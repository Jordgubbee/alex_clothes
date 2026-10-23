// Lager ovanpå en textur, som i Photoshop: text och loggor som kan flyttas, skalas, roteras och
// ändras i efterhand. tex.base = själva plagget (pixlar), tex.layers = lagren (nederst först),
// tex.canvas = det sammansatta resultatet som 3D-vyn och exporten använder.
import { cloneCanvas, canvasFrom } from './images'

let nextLayer = 1
export const layerId = () => `L${Date.now().toString(36)}${nextLayer++}`

export const BLENDS = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiplicera' },
  { id: 'screen', label: 'Skärm' },
  { id: 'overlay', label: 'Överlägg' },
  { id: 'soft-light', label: 'Mjukt ljus' },
  { id: 'darken', label: 'Mörkare' },
  { id: 'lighten', label: 'Ljusare' },
]

export const SYSTEM_FONTS = [
  'Arial', 'Arial Black', 'Impact', 'Bahnschrift', 'Segoe UI', 'Segoe UI Black', 'Calibri', 'Cambria', 'Georgia',
  'Times New Roman', 'Trebuchet MS', 'Verdana', 'Tahoma', 'Courier New', 'Consolas', 'Franklin Gothic Medium',
  'Gill Sans MT', 'Rockwell', 'Stencil', 'Copperplate Gothic Bold', 'Old English Text MT', 'Lucida Console', 'Comic Sans MS',
]

// Typsnitt som faktiskt finns på datorn (jämför bredd mot reservtypsnittet).
export function availableFonts(extra = []) {
  const c = document.createElement('canvas').getContext('2d')
  const sample = 'WMwm1234567890'
  const width = (f) => {
    c.font = `40px ${f}`
    return c.measureText(sample).width
  }
  const mono = width('monospace')
  const serif = width('serif')
  const ok = SYSTEM_FONTS.filter((f) => width(`"${f}", monospace`) !== mono || width(`"${f}", serif`) !== serif)
  return [...new Set([...extra, ...ok])]
}

export async function loadFontFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^\w -]/g, '')
  const face = new FontFace(name, await file.arrayBuffer())
  await face.load()
  document.fonts.add(face)
  return name
}

export function newTextLayer(props = {}) {
  return {
    id: layerId(),
    type: 'text',
    name: props.text || 'Text',
    visible: true,
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    flipX: false,
    opacity: 1,
    blend: 'source-over',
    text: 'TEXT',
    font: 'Arial Black',
    size: 96,
    bold: false,
    italic: false,
    color: '#ffffff',
    spacing: 0,
    stroke: 0,
    strokeColor: '#000000',
    curve: 0,
    ...props,
  }
}

export function newImageLayer(img, props = {}) {
  return { id: layerId(), type: 'image', name: props.name || 'Logga', visible: true, x: 0, y: 0, rot: 0, scale: 1, flipX: false, opacity: 1, blend: 'source-over', img, tint: null, ...props }
}

const fontOf = (L) => `${L.italic ? 'italic ' : ''}${L.bold ? 'bold ' : ''}${L.size}px "${L.font}"`

// Storlek på lagret innan skala/rotation, i texturens pixlar.
export function layerSize(L) {
  if (L.type === 'image') return { w: L.img.width, h: L.img.height }
  const c = document.createElement('canvas').getContext('2d')
  c.font = fontOf(L)
  c.letterSpacing = `${L.spacing}px`
  const lines = String(L.text).split('\n')
  const w = Math.max(1, ...lines.map((l) => c.measureText(l).width)) + L.stroke * 2
  const h = L.size * 1.2 * lines.length + L.stroke * 2
  if (!L.curve) return { w, h }
  // Böjd text tar mer plats på höjden.
  const r = w / ((Math.abs(L.curve) * Math.PI) / 180)
  const sag = r - r * Math.cos(((Math.abs(L.curve) * Math.PI) / 180) / 2)
  return { w: Math.min(w, 2 * r), h: h + sag }
}

const tintCache = new WeakMap()
function tinted(img, color) {
  let byColor = tintCache.get(img)
  if (!byColor) tintCache.set(img, (byColor = new Map()))
  if (byColor.has(color)) return byColor.get(color)
  const c = cloneCanvas(img)
  const ctx = c.getContext('2d')
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, c.width, c.height)
  byColor.set(color, c)
  return c
}

function drawText(ctx, L) {
  ctx.font = fontOf(L)
  ctx.letterSpacing = `${L.spacing}px`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const lines = String(L.text).split('\n')
  const lh = L.size * 1.2
  const paint = (s, x, y) => {
    if (L.stroke > 0) {
      ctx.lineWidth = L.stroke * 2
      ctx.strokeStyle = L.strokeColor
      ctx.strokeText(s, x, y)
    }
    ctx.fillStyle = L.color
    ctx.fillText(s, x, y)
  }
  if (!L.curve) {
    lines.forEach((line, i) => paint(line, 0, (i - (lines.length - 1) / 2) * lh))
    return
  }
  // Text längs en båge – för märken och emblem. Positiv böj = uppåt (som ett leende upp och ner).
  const text = lines.join(' ')
  const total = ctx.measureText(text).width
  const angle = (L.curve * Math.PI) / 180
  const r = total / Math.abs(angle)
  const dir = Math.sign(angle)
  let a = -angle / 2
  ctx.save()
  ctx.translate(0, dir * r)
  for (const ch of text) {
    const w = ctx.measureText(ch).width + L.spacing
    const step = (w / total) * angle
    ctx.save()
    ctx.rotate(a + step / 2)
    ctx.translate(0, -dir * r)
    paint(ch, 0, 0)
    ctx.restore()
    a += step
  }
  ctx.restore()
}

export function drawLayer(ctx, L) {
  if (!L.visible) return
  ctx.save()
  ctx.globalAlpha = L.opacity
  ctx.globalCompositeOperation = L.blend
  ctx.translate(L.x, L.y)
  ctx.rotate((L.rot * Math.PI) / 180)
  ctx.scale(L.scale * (L.flipX ? -1 : 1), L.scale)
  if (L.type === 'image') {
    const src = L.tint ? tinted(L.img, L.tint) : L.img
    ctx.drawImage(src, -src.width / 2, -src.height / 2)
  } else drawText(ctx, L)
  ctx.restore()
}

export function ensureBase(tex) {
  if (!tex.base) tex.base = cloneCanvas(tex.canvas)
  if (!tex.layers) tex.layers = []
  return tex.base
}

// Ritar om tex.canvas = bakgrund + alla synliga lager.
export function composite(tex) {
  if (!tex.base) return
  const c = tex.canvas
  if (c.width !== tex.base.width || c.height !== tex.base.height) {
    c.width = tex.base.width
    c.height = tex.base.height
  }
  const ctx = c.getContext('2d')
  ctx.save()
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(tex.base, 0, 0)
  ctx.restore()
  for (const L of tex.layers || []) drawLayer(ctx, L)
}

// Bränner in lager i bakgrunden (alla, eller bara ett).
export function flatten(tex, onlyId = null) {
  if (!tex.base) return
  const ctx = tex.base.getContext('2d')
  const keep = []
  for (const L of tex.layers) {
    if (!onlyId || L.id === onlyId) drawLayer(ctx, L)
    else keep.push(L)
  }
  tex.layers = keep
  composite(tex)
}

// Punkt i texturen -> lagrets egna koordinater (utan skala/rotation).
function toLocal(L, px, py) {
  const a = (-L.rot * Math.PI) / 180
  const dx = px - L.x
  const dy = py - L.y
  const x = (dx * Math.cos(a) - dy * Math.sin(a)) / (L.scale * (L.flipX ? -1 : 1))
  const y = (dx * Math.sin(a) + dy * Math.cos(a)) / L.scale
  return { x, y }
}

export function hitLayer(L, px, py) {
  if (!L.visible) return false
  const { w, h } = layerSize(L)
  const p = toLocal(L, px, py)
  return Math.abs(p.x) <= w / 2 && Math.abs(p.y) <= h / 2
}

// Hörn och rotationshandtag för det markerade lagret, i texturens koordinater.
export function layerHandles(L, zoom) {
  const { w, h } = layerSize(L)
  const a = (L.rot * Math.PI) / 180
  const s = L.scale
  const pt = (x, y) => ({ x: L.x + (x * Math.cos(a) - y * Math.sin(a)) * s, y: L.y + (x * Math.sin(a) + y * Math.cos(a)) * s })
  const corners = [pt(-w / 2, -h / 2), pt(w / 2, -h / 2), pt(w / 2, h / 2), pt(-w / 2, h / 2)]
  const top = pt(0, -h / 2)
  const off = 28 / zoom
  const rotate = { x: top.x + Math.sin(a) * off, y: top.y - Math.cos(a) * off }
  return { corners, top, rotate }
}

// Tar bort en bakgrundsfärg (t.ex. vit runt en logga). Mjuk kant mellan tol och tol*1.6.
export function removeBackground(img, color, tolerance) {
  const c = cloneCanvas(img)
  const ctx = c.getContext('2d')
  const d = ctx.getImageData(0, 0, c.width, c.height)
  const n = parseInt(color.slice(1), 16)
  const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255
  const hard = tolerance
  const soft = tolerance * 1.6 + 1
  for (let i = 0; i < d.data.length; i += 4) {
    const dist = Math.sqrt((d.data[i] - R) ** 2 + (d.data[i + 1] - G) ** 2 + (d.data[i + 2] - B) ** 2)
    if (dist <= hard) d.data[i + 3] = 0
    else if (dist < soft) d.data[i + 3] = Math.round(d.data[i + 3] * ((dist - hard) / (soft - hard)))
  }
  ctx.putImageData(d, 0, 0)
  return c
}

// Vanligaste hörnfärgen – bra gissning på en loggas bakgrund.
export function cornerColor(img) {
  const ctx = img.getContext('2d')
  const pts = [[0, 0], [img.width - 1, 0], [0, img.height - 1], [img.width - 1, img.height - 1]]
  const counts = {}
  for (const [x, y] of pts) {
    const p = ctx.getImageData(x, y, 1, 1).data
    const hex = '#' + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
    counts[hex] = (counts[hex] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

// Beskär genomskinliga kanter så att handtagen hamnar tätt runt loggan.
export function trimTransparent(img) {
  const ctx = img.getContext('2d')
  const { data, width: w, height: h } = ctx.getImageData(0, 0, img.width, img.height)
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return img
  const c = canvasFrom(x1 - x0 + 1, y1 - y0 + 1)
  c.getContext('2d').drawImage(img, -x0, -y0)
  return c
}

// Lagrets miniatyr för lagerpanelen.
export function layerThumb(L) {
  const c = canvasFrom(40, 40)
  const ctx = c.getContext('2d')
  const { w, h } = layerSize(L)
  const k = Math.min(36 / w, 36 / h)
  ctx.translate(20, 20)
  ctx.scale(k, k)
  drawLayer(ctx, { ...L, x: 0, y: 0, rot: 0, scale: 1, opacity: 1, blend: 'source-over', visible: true })
  return c.toDataURL()
}
