// Kopplingen mot skrivbordsappen (Electron). I en vanlig webbläsare finns inte window.alex.
import { useStore } from './store'
import { fileToCanvases, baseName, canvasFrom } from './images'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { t } from './i18n'
import { ensureTextures } from './loader'
import { registerPed, unregisterPed, guessFromFilename, categoryByKey } from './categories'
import { isCompoundPed, pedDrawableCounts } from './pedExport'
import { importFiles, importCompoundYtd } from './importer'

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

// Laddar sparade gubbar. Finns inga än hämtas de automatiskt ur GTA – de ska alltid finnas.
export async function loadSavedPeds(blender) {
  if (!desktop) return
  await loadCustomPeds()
  let missing = false
  for (const g of ['male', 'female']) {
    const ped = await desktop.getPed(g)
    if (ped) await applyPed(g, ped)
    else missing = true
  }
  if (!missing || !blender?.ok) return
  const settings = await desktop.getSettings()
  if (settings.gtaPath) await pedsFromGta()
}

// ---- Egna peds ----
export async function loadCustomPeds() {
  const list = await desktop.listCustomPeds()
  for (const p of list) registerPed(p.model, p.label)
  useStore.getState().setCustomPeds(list.map((p) => p.model))
  for (const p of list) {
    const ped = await desktop.getPed(p.model)
    if (ped) await applyPed(p.model, ped)
  }
}

export async function addCustomPed() {
  const st = useStore.getState()
  st.setPedBusy(t('Sollumz bygger peden…'))
  try {
    const meta = await desktop.addCustomPed()
    if (!meta) return
    registerPed(meta.model, meta.label)
    useStore.getState().setCustomPeds([...new Set([...useStore.getState().customPeds, meta.model])])
    await applyPed(meta.model, await desktop.getPed(meta.model))
    useStore.getState().setGender(meta.model)
    st.notify(t('{p} är tillagd. Importera pedens kläder för att göra egna texturer.', { p: meta.model }))
  } catch (e) {
    st.notify(cleanError(e), 'error')
  } finally {
    useStore.getState().setPedBusy(false)
  }
}

// Importerar pedens egna kläder (.ydd + .ytd) som plagg, så att man kan göra nya texturer till dem.
export async function importCustomPedClothes(model) {
  const all = (await desktop.customPedFiles(model)).map((f) => new File([f.data], f.name))
  useStore.getState().setGender(model)
  useStore.getState().setScreen('editor')
  // Allt i en fil (s_m_y_cop_01.ytd): varje del blir ett plagg. Annars en fil per plagg (uppr_000_u.ydd …).
  const lower = model.toLowerCase()
  const compound = all.filter((f) => f.name.toLowerCase() === `${lower}.ytd` || f.name.toLowerCase() === `${lower}_p.ytd`)
  if (compound.length) {
    let n = 0
    for (const f of compound) n += await importCompoundYtd(f, model)
    useStore.getState().notify(t('{n} plagg från {p}. Klicka på ett plagg för att göra egna texturer.', { n, p: model }))
    return
  }
  await importFiles(all.filter((f) => /\.(ydd|ytd)$/i.test(f.name)), null, { gender: model })
}

// Nya kläder till en egen ped (t.ex. addon-kläder från ett annat paket): varje plagg får nästa lediga
// nummer efter pedens egna, så att inget original ersätts. Exporten lägger in dem i pedens .ymt.
export async function importAddonForPed(model, files) {
  const st = useStore.getState()
  const names = (await desktop.customPedFiles(model)).map((f) => f.name)
  if (isCompoundPed(model, names)) {
    st.notify(t('{p} har alla plagg i en enda fil, så nya plagg kan inte läggas till. Du kan göra nya texturer till pedens egna plagg.', { p: model }), 'error')
    return
  }
  const next = pedDrawableCounts(names)
  for (const i of st.items) if (i.gender === model) next[i.category] = Math.max(next[i.category] || 0, i.slot + 1)
  // Samma plagg (kategori + nummer + paket) i källfilerna hålls ihop och får ett gemensamt nytt nummer.
  const groups = new Map()
  let props = 0
  for (const f of files) {
    const g = guessFromFilename(f.name)
    if (!g || !/\.(ydd|ytd)$/i.test(f.name)) continue
    if (categoryByKey(g.category)?.prop) {
      props++
      continue
    }
    const key = `${g.dlc || ''}:${g.gender || ''}:${g.category}:${g.slot}`
    if (!groups.has(key)) groups.set(key, { ...g, files: [] })
    groups.get(key).files.push(f)
  }
  const renamed = []
  for (const g of [...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || a.slot - b.slot)) {
    const slot = next[g.category] || 0
    next[g.category] = slot + 1
    const n = String(slot).padStart(3, '0')
    for (const f of g.files) {
      const letter = f.name.toLowerCase().match(/_diff_\d{3}_([a-z])/)?.[1] || 'a'
      const name = /\.ydd$/i.test(f.name) ? `${model}^${g.category}_${n}_${g.skin ? 'r' : 'u'}.ydd` : `${model}^${g.category}_diff_${n}_${letter}_${g.texSuffix || (g.skin ? 'whi' : 'uni')}.ytd`
      renamed.push(new File([f], name))
    }
  }
  if (props) st.notify(t('{n} props hoppades över – nya props kan inte läggas till på egna peds än.', { n: props }), 'error')
  if (!renamed.length) return st.notify(t('Hittade inga plagg (.ydd/.ytd med t.ex. jbib_000 i namnet).'), 'error')
  st.setGender(model)
  await importFiles(renamed, null, { gender: model })
  st.notify(t('{n} nya plagg till {p}. De får nya nummer efter pedens egna och läggs in i pedens .ymt vid export.', { n: groups.size, p: model }))
}

export async function removeCustomPed(model) {
  await desktop.removeCustomPed(model)
  unregisterPed(model)
  const st = useStore.getState()
  st.setCustomPeds(st.customPeds.filter((m) => m !== model))
  st.setBasePed(model, null)
  if (st.gender === model) st.setGender('male')
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
  const model = { male: 'mp_m_freemode_01', female: 'mp_f_freemode_01' }[gender] || gender
  st.setBasePed(gender, new File([ped.glb], `${model}.glb`))
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
  st.setPedBusy(t('Läser GTA V…'))
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

export const texKey = (name) => String(name || '').toLowerCase().split('^').pop().replace(/\.(dds|png|tga|ytd)$/, '').split('.')[0].replace(/__decal$/, '')

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
