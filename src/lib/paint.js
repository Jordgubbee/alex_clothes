// Rit-hjälpare för texturredigeraren. Allt ritas direkt på texturens canvas.

export function dab(ctx, x, y, size, hardness, color, alpha) {
  const r = size / 2
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(Math.min(0.99, hardness), rgba(color, alpha))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

// Ritar dabs längs en linje så att snabba drag inte blir prickiga.
export function stroke(from, to, size, fn) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const step = Math.max(1, size * 0.15)
  const n = Math.max(1, Math.ceil(dist / step))
  for (let i = 1; i <= n; i++) fn(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n)
}

// Klonstämpel: kopierar en mjuk cirkel från källbilden med förskjutning.
export function cloneDab(ctx, source, x, y, dx, dy, size, hardness, alpha) {
  const r = size / 2
  const tmp = document.createElement('canvas')
  tmp.width = tmp.height = Math.ceil(size)
  const t = tmp.getContext('2d')
  t.drawImage(source, x + dx - r, y + dy - r, size, size, 0, 0, size, size)
  t.globalCompositeOperation = 'destination-in'
  const g = t.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, `rgba(0,0,0,${alpha})`)
  g.addColorStop(Math.min(0.99, hardness), `rgba(0,0,0,${alpha})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  t.fillStyle = g
  t.fillRect(0, 0, size, size)
  ctx.drawImage(tmp, x - r, y - r)
}

// "Ta bort logga": fyller rektangeln genom att blanda kantpixlarna inåt
// (Coons-interpolering) och lägger på lite brus som matchar tygets struktur.
export function healRect(ctx, rect) {
  const x0 = Math.max(1, Math.round(rect.x))
  const y0 = Math.max(1, Math.round(rect.y))
  const x1 = Math.min(ctx.canvas.width - 2, Math.round(rect.x + rect.w))
  const y1 = Math.min(ctx.canvas.height - 2, Math.round(rect.y + rect.h))
  const w = x1 - x0
  const h = y1 - y0
  if (w < 1 || h < 1) return
  const pad = 3
  const src = ctx.getImageData(x0 - 1, y0 - 1, w + 2, h + 2)
  const W = w + 2
  const px = (x, y, c) => src.data[(y * W + x) * 4 + c]

  // Medelvärde av flera pixlar utanför kanten ger stabilare färg än en enda rad.
  const big = ctx.getImageData(Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(ctx.canvas.width, w + pad * 2), Math.min(ctx.canvas.height, h + pad * 2))
  const BW = big.width
  const ox = x0 - Math.max(0, x0 - pad)
  const oy = y0 - Math.max(0, y0 - pad)
  const bpx = (x, y, c) => big.data[(Math.min(big.height - 1, Math.max(0, y)) * BW + Math.min(BW - 1, Math.max(0, x))) * 4 + c]
  const edge = (side, i, c) => {
    let s = 0
    for (let k = 1; k <= pad; k++) {
      if (side === 'l') s += bpx(ox - k, oy + i, c)
      if (side === 'r') s += bpx(ox + w + k - 1, oy + i, c)
      if (side === 't') s += bpx(ox + i, oy - k, c)
      if (side === 'b') s += bpx(ox + i, oy + h + k - 1, c)
    }
    return s / pad
  }

  // Uppskattar brusnivån i omgivningen.
  let noise = 0
  for (let i = 0; i < w; i++) noise += Math.abs(px(i + 1, 0, 0) - px(i, 0, 0))
  noise = Math.min(18, noise / w)

  const out = ctx.createImageData(w, h)
  const corner = (cx, cy, c) => bpx(cx, cy, c)
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      const n = (Math.random() - 0.5) * noise
      for (let c = 0; c < 4; c++) {
        const L = edge('l', y, c)
        const R = edge('r', y, c)
        const T = edge('t', x, c)
        const B = edge('b', x, c)
        const bil =
          (1 - u) * (1 - v) * corner(ox - 1, oy - 1, c) +
          u * (1 - v) * corner(ox + w, oy - 1, c) +
          (1 - u) * v * corner(ox - 1, oy + h, c) +
          u * v * corner(ox + w, oy + h, c)
        const val = (1 - u) * L + u * R + (1 - v) * T + v * B - bil
        out.data[(y * w + x) * 4 + c] = c === 3 ? val : val + n
      }
    }
  }
  ctx.putImageData(out, x0, y0)
}

export function pickColor(ctx, x, y) {
  const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
  return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function averageColor(ctx, rect) {
  const d = ctx.getImageData(Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h))).data
  let r = 0, g = 0, b = 0
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]
    g += d[i + 1]
    b += d[i + 2]
  }
  return '#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

// Applicerar färgjusteringar på hela texturen eller en markering.
export function applyFilter(canvas, filter, rect) {
  const ctx = canvas.getContext('2d')
  const tmp = document.createElement('canvas')
  tmp.width = canvas.width
  tmp.height = canvas.height
  const t = tmp.getContext('2d')
  t.filter = filter
  t.drawImage(canvas, 0, 0)
  if (rect) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
    ctx.drawImage(tmp, 0, 0)
    ctx.restore()
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(tmp, 0, 0)
  }
}

export function resizeCanvas(canvas, w, h) {
  const tmp = document.createElement('canvas')
  tmp.width = canvas.width
  tmp.height = canvas.height
  tmp.getContext('2d').drawImage(canvas, 0, 0)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tmp, 0, 0, w, h)
}

export const filterString = (a) => `hue-rotate(${a.hue}deg) saturate(${a.saturation}%) brightness(${a.brightness}%) contrast(${a.contrast}%)`

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function normRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}
