// Kopplingen mot skrivbordsappen (Electron). I en vanlig webbläsare finns inte window.alex.
import { useStore } from './store'
import { fileToCanvases, baseName, canvasFrom } from './images'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { t } from './i18n'
import { ensureTextures } from './loader'

export const desktop = typeof window !== 'undefined' ? window.alex || null : null

export const payload = async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })

// Bygger 3D-förhandsvisningar med Sollumz för flera plagg i en enda Blender-start.
// Varje plagg uppdateras så fort det är klart. materials = texturerna modellen själv använder.
export async function previewMany(itemIds) {
  if (!desktop) return
  const st = useStore.getState()
  const items = itemIds.map((id) => st.items.find((i) => i.id === id)).filter((i) => i?.ydd)
  if (!items.length) return
  const yddOf = new Map(items.map((i) => [i.id, i.ydd]))
  for (const i of items) st.updateItem(i.id, { converting: true })
  const off = desktop.onConverted(({ id, glb, materials, error }) => {
    const cur = useStore.getState().items.find((i) => i.id === id)
    if (!cur || cur.ydd !== yddOf.get(id)) return
    if (error) {
      st.notify(`${cur.name}: ${error}`, 'error')
      useStore.getState().updateItem(id, { converting: false })
      return
    }
    useStore.getState().updateItem(id, { preview: new File([glb], `${baseName(cur.ydd.name)}.glb`), previewFromYdd: true, previewYdd: cur.ydd, materials, converting: false })
  })
  try {
    const jobs = await Promise.all(items.map(async (i) => ({ id: i.id, gender: i.gender, files: [await payload(i.ydd)] })))
    await desktop.convertMany(jobs)
  } catch (e) {
    st.notify(`Sollumz: ${cleanError(e)}`, 'error')
  } finally {
    off()
    for (const i of items) useStore.getState().updateItem(i.id, { converting: false })
  }
}

export const previewFromYdd = (itemId) => previewMany([itemId])

export async function loadSavedPeds() {
  if (!desktop) return
  for (const g of ['male', 'female']) {
    const ped = await desktop.getPed(g)
    if (ped) await applyPed(g, ped)
  }
}

async function applyPed(gender, ped) {
  const st = useStore.getState()
  const textures = []
  for (const t of ped.textures) {
    try {
      textures.push(...(await fileToCanvases(new File([t.data], t.name))))
    } catch {
      // Hudtexturer som inte går att läsa ersätts av hudfärg.
    }
  }
  st.setBasePed(gender, new File([ped.glb], `${gender === 'male' ? 'mp_m' : 'mp_f'}_freemode_01.glb`))
  st.setPedTextures(gender, textures)
}

export async function importPedFromGta(gender, files) {
  const st = useStore.getState()
  st.setPedBusy(t('Sollumz bygger gubben…'))
  try {
    await desktop.setPed(gender, await Promise.all(files.map(payload)))
    await applyPed(gender, await desktop.getPed(gender))
    st.notify(t('Freemode-gubben är inläst och sparad till nästa gång.'))
  } catch (e) {
    st.notify(cleanError(e), 'error')
  } finally {
    st.setPedBusy(false)
  }
}

// Plockar ut båda freemode-gubbarna ur spelet (via CodeWalker) och bygger dem med Sollumz.
export async function pedsFromGta() {
  const st = useStore.getState()
  st.setPedBusy(t('Läser GTA V med CodeWalker…'))
  const off = desktop.onPedProgress((t) => useStore.getState().setPedBusy(t))
  try {
    const done = await desktop.pedsFromGta()
    for (const g of done) await applyPed(g, await desktop.getPed(g))
    st.notify(t('Klart: {p} med originalskelett.', { p: done.map((g) => (g === 'male' ? 'mp_m_freemode_01' : 'mp_f_freemode_01')).join(' + ') }))
  } catch (e) {
    st.notify(cleanError(e), 'error')
  } finally {
    off()
    st.setPedBusy(false)
  }
}

export async function pedFromFolder(gender) {
  const st = useStore.getState()
  st.setPedBusy(t('Sollumz bygger gubben…'))
  try {
    if (await desktop.pedFromFolder(gender)) {
      await applyPed(gender, await desktop.getPed(gender))
      st.notify(t('Freemode-gubben är inläst och sparad till nästa gång.'))
    }
  } catch (e) {
    st.notify(cleanError(e), 'error')
  } finally {
    st.setPedBusy(false)
  }
}

export const cleanError = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

// "jbib_diff_005_b_uni" och "jbib_diff_005_a_uni" är samma textur i olika färger.
export const texFamily = (name) => texKey(name).replace(/_diff_(\d{3})_[a-z](_|$)/, '_diff_$1_*$2')

export const texKey = (name) => String(name || '').toLowerCase().split('^').pop().replace(/\.(dds|png|tga|ytd)$/, '').split('.')[0]

// Texturer som finns inbäddade i 3D-förhandsvisningen, per materialnamn.
export async function embeddedTextures(file) {
  const out = {}
  if (!file) return out
  const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')
  gltf.scene.traverse((m) => {
    const img = m.material?.map?.image
    const key = texKey(m.material?.name)
    if (!img || !key || out[key] || !img.width) return
    const c = canvasFrom(img.width, img.height)
    c.getContext('2d').drawImage(img, 0, 0)
    out[key] = c
  })
  return out
}

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(4, n)))

// Räknar ut rutorna i atlasen. UV-värdena är i Blenders system (origo nere till vänster).
export function atlasLayout(keys, size) {
  const n = keys.length
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const cw = size / cols
  const ch = size / rows
  const pad = Math.max(2, Math.round(size / 512))
  const cells = {}
  keys.forEach((k, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * cw + pad
    const y = row * ch + pad
    const w = cw - pad * 2
    const h = ch - pad * 2
    cells[k] = { x, y, w, h, cell: { x: col * cw, y: row * ch, w: cw, h: ch }, uv: [x / size, 1 - (y + h) / size, w / size, h / size] }
  })
  return cells
}

export function drawAtlas(cells, sources, size) {
  const c = canvasFrom(size, size)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  for (const [k, cell] of Object.entries(cells)) {
    const src = sources[k]
    if (!src) continue
    // Kanten ritas utsträckt först så att mipmaps inte blöder in färg från grannrutan.
    ctx.drawImage(src, cell.cell.x, cell.cell.y, cell.cell.w, cell.cell.h)
    ctx.drawImage(src, cell.x, cell.y, cell.w, cell.h)
  }
  return c
}

/**
 * Slår ihop alla texturer i ett plagg till en. Varje färgvariant av huvudtexturen får en egen atlas,
 * så att a, b, c … finns kvar. Modellen uppdateras i Blender så att UV:erna pekar på rätt ruta.
 */
export async function mergeItemTextures(itemId, { size = 2048, primary, sources }) {
  const st = useStore.getState()
  const item = st.items.find((i) => i.id === itemId)
  await ensureTextures(item)
  const keys = item.materials
  const cells = atlasLayout(keys, nextPow2(size))
  const spec = { atlas: primary, primary, tiles: Object.fromEntries(keys.map((k) => [k, cells[k].uv])) }
  st.updateItem(itemId, { converting: true })
  try {
    const res = await desktop.mergeTextures({ gender: item.gender, ydd: await payload(item.ydd), spec })
    // Färgvarianterna är huvudtexturens a, b, c … – inte de andra materialens texturer.
    const others = new Set(keys.filter((k) => k !== primary))
    const own = item.textures.filter((x) => !others.has(texKey(x.name)))
    const variants = own.length ? own : [{ name: primary, canvas: sources[primary] }]
    const textures = variants.map((v, i) => ({
      id: `${v.id || 'm'}_atlas${i}`,
      name: `${texKey(v.name)}_atlas`,
      canvas: drawAtlas(cells, { ...sources, [primary]: v.canvas }, nextPow2(size)),
      original: null,
      edited: true,
      version: 0,
    }))
    useStore.getState().updateItem(itemId, { ydd: new File([res.data], item.ydd.name), textures, materials: [primary], merged: true })
    useStore.getState().selectTexture(textures[0].id)
    st.notify(t('Texturerna är ihopslagna till en. Plagget fungerar nu med en .ytd per färgvariant.'))
    await previewFromYdd(itemId)
  } catch (e) {
    st.notify(cleanError(e), 'error')
  } finally {
    useStore.getState().updateItem(itemId, { converting: false })
  }
}
