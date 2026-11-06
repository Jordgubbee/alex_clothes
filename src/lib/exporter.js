import JSZip from 'jszip'
import { streamNames, addonNames, categoryByKey, PEDS, ALL_CATEGORIES, isCustomPed } from './categories'
import { canvasToBlob, extOf } from './images'
import { writeDDSDXT5 } from './dds'
import { desktop, cleanError } from './desktop'
import { buildYmtXml, buildShopMeta } from './ymt'
import { packDlc } from './store'
import { t } from './i18n'
import { ensureAllTextures, ensureTextures } from './loader'
import { bundlePed, pedsMetaFile } from './pedExport'

export function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const MB = 1024 * 1024
const pow2 = (n) => n > 0 && (n & (n - 1)) === 0
const DLC_RE = /^[A-Za-z][A-Za-z0-9_]{1,40}$/
const itemLabel = (item) => `${t(categoryByKey(item.category).label)} · ${item.name} (${t(PEDS[item.gender].label)})`

/**
 * Räknar fram exakt vad exporten kommer att innehålla och vad som är fel.
 * Samma plan används för förhandsvisningen och för själva exporten, så det man ser är det man får.
 */
// layout: 'packs' = stream/<paket>/[kön]/<kategori>/ (som Durty/EVRP), 'flat' = allt direkt i stream/.
// lowercase: gör alla namn till små bokstäver (annars behålls stora och små som du skrev dem).
// Peds med alla texturer i en .ytd: en patch per fil, med de plagg som hör dit.
function compoundPatches(items, L) {
  const map = new Map()
  for (const item of items.filter((i) => i.compound)) {
    const ped = PEDS[item.gender]?.model || item.gender
    const file = `${ped}${item.compound.prop ? '_p' : ''}.ytd`
    const key = `${item.gender}:${file}`
    if (!map.has(key)) map.set(key, { gender: item.gender, ped, file: item.compound.file, path: L(`stream/${ped}/${file}`), items: [] })
    map.get(key).items.push(item)
  }
  return [...map.values()]
}

export function planExport({ items, packs, exportMode, layout = 'packs', lowercase = false }) {
  const L = (p) => (lowercase ? p.toLowerCase() : p)
  const problems = []
  const err = (text) => problems.push({ level: 'error', text })
  const warn = (text) => problems.push({ level: 'warn', text })
  const entries = [] // { item, model, textures: [names], group }
  const groups = [] // addon: { pack, gender, dlc, ped, ymt, meta, components, props }

  for (const item of items) {
    const label = itemLabel(item)
    if (!item.ydd && !item.compound) err(t('{x}: saknar .ydd-modell.', { x: label }))
    if (!item.textures.length) err(t('{x}: saknar texturer.', { x: label }))
    if (item.textures.length > 26) err(t('{x}: max 26 färgvarianter (a–z).', { x: label }))
    if (item.ydd && item.ydd.size > 16 * MB) warn(t('{x}: modellen är över 16 MB och kan ge "oversized asset" i FiveM.', { x: label }))
    if ((item.materials?.length || 0) > 1) warn(t('{x}: modellen använder {n} olika texturer. Slå ihop dem till en, annars syns bara en del in game.', { x: label, n: item.materials.length }))
    for (const tex of item.textures) {
      const w = tex.canvas?.width || tex.width
      const h = tex.canvas?.height || tex.height
      if (!pow2(w) || !pow2(h)) warn(t('{x}: texturen "{t}" är {w}×{h}. GTA kräver 2-potens (512, 1024, 2048).', { x: label, t: tex.name, w, h }))
      else if (w > 2048 || h > 2048) warn(t('{x}: texturen "{t}" är {w}×{h}. Över 2048 blir filen onödigt stor.', { x: label, t: tex.name, w, h }))
    }
  }

  const patches = compoundPatches(items, L)
  // Egna peds exporteras som en hel ped: alla pedens filer följer med, med dina ändringar.
  const pedBundles = [...new Set(items.filter((i) => isCustomPed(i.gender)).map((i) => i.gender))].map((gender) => ({
    gender,
    model: PEDS[gender].model,
    dir: L(`stream/${PEDS[gender].model}`),
    items: items.filter((i) => i.gender === gender && !i.compound),
  }))
  items = items.filter((i) => !i.compound)

  if (exportMode === 'replace') {
    const seen = new Set()
    for (const item of items) {
      const key = `${item.gender}-${item.category}-${item.slot}`
      if (seen.has(key)) err(t('{x}: nummer {n} används av två plagg.', { x: itemLabel(item), n: item.slot }))
      seen.add(key)
      const base = { gender: item.gender, category: item.category, slot: item.slot, skin: item.skin, suffix: isCustomPed(item.gender) ? item.texSuffix : null }
      entries.push({
        item,
        model: L(`stream/${streamNames(base).model}`),
        textures: item.textures.map((_, i) => L(`stream/${streamNames({ ...base, textureIndex: i }).texture}`)),
      })
    }
    return { mode: 'replace', entries, groups, patches, pedBundles, problems }
  }

  // Egna peds: deras kläder ersätter pedens egna med samma nummer och filnamn (ingen .ymt behövs).
  const seenCustom = new Set()
  for (const item of items.filter((i) => isCustomPed(i.gender))) {
    const key = `${item.gender}-${item.category}-${item.slot}`
    if (seenCustom.has(key)) err(t('{x}: nummer {n} används av två plagg.', { x: itemLabel(item), n: item.slot }))
    seenCustom.add(key)
    const base = { gender: item.gender, category: item.category, slot: item.slot, skin: item.skin, suffix: item.texSuffix }
    const dir = `stream/${L(PEDS[item.gender].model)}`
    entries.push({
      item,
      model: L(`${dir}/${streamNames(base).model}`),
      textures: item.textures.map((_, i) => L(`${dir}/${streamNames({ ...base, textureIndex: i }).texture}`)),
    })
  }

  // Addon: ett eget paket per (paket, kön) med .ymt + .meta, numrerat från 000 i varje kategori.
  const dlcOwner = new Map()
  for (const pack of packs) {
    for (const gender of ['male', 'female']) {
      const mine = items.filter((i) => i.packId === pack.id && i.gender === gender)
      if (!mine.length) continue
      const dlc = L(packDlc(pack, gender))
      const ped = PEDS[gender].model
      if (!DLC_RE.test(dlc)) err(t('Paketnamnet "{d}" är ogiltigt. Använd bokstäver, siffror och understreck, och börja med en bokstav.', { d: dlc }))
      const owner = dlcOwner.get(`${gender}:${dlc}`)
      if (owner) err(t('Paketen "{a}" och "{b}" får samma namn ({d}) för {g}.', { a: owner, b: pack.name, d: dlc, g: t(PEDS[gender].label) }))
      dlcOwner.set(`${gender}:${dlc}`, pack.name)

      const packDir = L(pack.name)
      const folder = layout === 'flat' ? 'stream' : `stream/${packDir}/[${gender}]`
      const group = { pack, gender, dlc, ped, components: {}, props: {}, ymt: layout === 'flat' ? `stream/${ped}_${dlc}.ymt` : `stream/${packDir}/${ped}_${dlc}.ymt`, meta: `meta/${ped}_${dlc}.meta`, count: mine.length }
      for (const cat of ALL_CATEGORIES) {
        const list = mine.filter((i) => i.category === cat.key).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id))
        if (!list.length) continue
        if (list.length > 255) err(t('{p}: {c} har {n} plagg – max 255 per kategori och paket.', { p: dlc, c: t(cat.label), n: list.length }))
        list.forEach((item, index) => {
          const base = { gender, dlc, category: cat.key, index, skin: !cat.prop && item.skin }
          entries.push({
            item,
            index,
            group,
            model: layout === 'flat' ? `${folder}/${addonNames(base).model}` : `${folder}/${cat.key}/${addonNames(base).model}`,
            textures: item.textures.map((_, i) => (layout === 'flat' ? `${folder}/${addonNames({ ...base, textureIndex: i }).texture}` : `${folder}/${cat.key}/${addonNames({ ...base, textureIndex: i }).texture}`)),
          })
          const n = Math.max(1, item.textures.length)
          if (cat.prop) (group.props[cat.id] ||= []).push({ textures: n })
          else (group.components[cat.id] ||= []).push({ skin: item.skin, textures: n })
        })
      }
      groups.push(group)
    }
  }
  return { mode: 'addon', entries, groups, patches, pedBundles, problems }
}

const MANIFEST = (name, metas, pedsMeta) => {
  const files = [...metas, ...(pedsMeta ? ['peds.meta'] : [])]
  const data = [...metas.map((m) => `data_file 'SHOP_PED_APPAREL_META_FILE' '${m}'`), ...(pedsMeta ? [`data_file 'PED_METADATA_FILE' 'peds.meta'`] : [])]
  return `fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'alex_clothes'
description '${name}'
version '1.0.0'
${
  files.length
    ? `
files {
${files.map((m) => `  '${m}',`).join('\n')}
}

${data.join('\n')}
`
    : `
-- Filerna i stream/ ersätter GTA:s egna filer med samma namn.
`
}`
}

const README = (plan, name, packList) => `ALEX_CLOTHES
============

${t('1. Lägg mappen "{n}" i din servers resources-mapp.', { n: name })}
${t('2. Lägg till raden  ensure {n}  i server.cfg.', { n: name })}
${t('3. Starta om servern.')}

${
  plan.mode === 'addon'
    ? `${t('Kläderna läggs till efter GTA:s egna, så inget originalplagg ersätts. De syns direkt i klädmenyer som illenium-appearance, qb-clothing, esx_skin och fivem-appearance.')}

${plan.groups.map((g) => `  ${g.ped}_${g.dlc}  (${g.count} ${t('plagg')})`).join('\n')}`
    : t('Filerna i stream/ ersätter freemode-plaggen med samma nummer.')
}
${
  plan.pedBundles?.length
    ? `
${t('Peds (hela peden med dina ändringar):')}
${plan.pedBundles.map((b) => `  ${b.dir}/`).join('\n')}
`
    : ''
}
${
  packList.length
    ? `
${t('Följande texturer kunde inte packas automatiskt och ligger i _packa_texturer. Packa dem till .ytd i OpenIV med exakt samma namn:')}

${packList.map((p) => `  ${p.dds}  ->  ${p.ytd}`).join('\n')}
`
    : ''
}`

/**
 * target: 'zip' = spara en .zip, 'folder' = skriv resursen direkt i en mapp (t.ex. serverns resources/),
 * 'data' = returnera zip-datan (för tester).
 * onProgress(text, andel 0–1).
 */
export async function exportResource({ projectName, items, packs, exportMode, layout = 'packs', lowercase = false, target = 'zip', onProgress }) {
  if (lowercase) projectName = projectName.toLowerCase()
  const plan = planExport({ items, packs, exportMode, layout, lowercase })
  if (plan.problems.some((p) => p.level === 'error')) throw new Error(t('Rätta felen först.'))
  // Bara texturer som inte kan kopieras rakt av behöver avkodas – resten går snabbt.
  const needPixels = items.filter((i) => i.textures.some((x) => !x.canvas && !(x.original && !x.edited)))
  for (const [n, i] of needPixels.entries()) {
    onProgress?.(t('Läser texturer {a} av {b}…', { a: n + 1, b: needPixels.length }), 0.05 * (n / needPixels.length))
    await ensureTextures(i)
  }
  const zip = new JSZip()
  const folder = zip.folder(projectName)
  // Allt som skrivs noteras, så att en peds originalfiler aldrig skriver över dina ändringar.
  const written = new Set()
  const root = {
    file: (p, data) => {
      written.add(p.toLowerCase())
      return folder.file(p, data)
    },
  }
  const pack = []
  const errors = []
  let built = 0

  // .ymt byggs med CodeWalker och kontrolleras innan något skrivs till zip:en.
  if (plan.mode === 'addon') {
    if (!desktop) throw new Error(t('Addon-paket kräver skrivbordsappen (för .ymt).'))
    onProgress?.(t('Bygger .ymt…'), 0.05)
    const ymts = await desktop.buildYmt(plan.groups.map((g) => ({ name: g.ymt.split('/').pop(), xml: buildYmtXml({ dlc: g.dlc, components: g.components, props: g.props }) })))
    plan.groups.forEach((g, i) => {
      root.file(g.ymt, ymts[i].data)
      root.file(g.meta, buildShopMeta({ ped: g.ped, dlc: g.dlc, female: g.gender === 'female' }))
    })
  }

  let done = 0
  for (const entry of plan.entries) {
    const { item } = entry
    onProgress?.(t('Packar {a} av {b}…', { a: ++done, b: plan.entries.length }), 0.08 + 0.72 * (done / plan.entries.length))
    root.file(entry.model, await item.ydd.arrayBuffer())
    for (let i = 0; i < item.textures.length; i++) {
      const tex = item.textures[i]
      const path = entry.textures[i]
      const ytdName = path.split('/').pop()
      if (tex.original && extOf(tex.original.name) === 'ytd' && !tex.edited) {
        root.file(path, await tex.original.arrayBuffer())
        continue
      }
      const texName = ytdName.split('^')[1].replace('.ytd', '')
      const dds = writeDDSDXT5(tex.canvas.getContext('2d').getImageData(0, 0, tex.canvas.width, tex.canvas.height))
      if (desktop) {
        try {
          root.file(path, await desktop.buildYtd(ytdName.replace('.ytd', ''), [{ name: `${texName}.dds`, data: new Uint8Array(dds) }]))
          built++
          continue
        } catch (e) {
          errors.push(`${ytdName}: ${cleanError(e)}`)
        }
      }
      const dir = `_packa_texturer/${ytdName.replace('.ytd', '')}`
      root.file(`${dir}/${texName}.dds`, dds)
      root.file(`${dir}/${texName}.png`, await canvasToBlob(tex.canvas))
      pack.push({ dds: `${dir}/${texName}.dds`, ytd: path })
    }
  }

  // Peds med alla texturer i en fil: bygg om pedens .ytd med bara de ändrade texturerna utbytta.
  for (const patch of plan.patches || []) {
    const replacements = []
    for (const item of patch.items) {
      for (let i = 0; i < item.textures.length; i++) {
        const tex = item.textures[i]
        if (!tex.edited && tex.pending) continue
        if (!tex.canvas) await ensureTextures(item)
        const name = tex.pending ? tex.name : `${item.category}_diff_${String(item.slot).padStart(3, '0')}_${String.fromCharCode(97 + i)}${item.texSuffix ? `_${item.texSuffix}` : ''}`
        const dds = writeDDSDXT5(tex.canvas.getContext('2d').getImageData(0, 0, tex.canvas.width, tex.canvas.height))
        replacements.push({ name: `${name}.dds`, data: new Uint8Array(dds) })
      }
    }
    onProgress?.(t('Bygger {f}…', { f: patch.path.split('/').pop() }), 0.82)
    const original = { name: patch.file.name, data: new Uint8Array(await patch.file.arrayBuffer()) }
    if (!replacements.length) root.file(patch.path, original.data)
    else if (desktop) {
      root.file(patch.path, await desktop.patchYtd(original, patch.path.split('/').pop().replace(/\.ytd$/i, ''), replacements))
      built += replacements.length
    } else throw new Error(t('Addon-paket kräver skrivbordsappen (för .ymt).'))
  }

  // Hela peden: originalfilerna som inte ändrats, uppdaterad .ymt och peds.meta för addon-peds.
  const pedMetas = []
  for (const bundle of plan.pedBundles || []) {
    onProgress?.(t('Lägger till {p}…', { p: bundle.model }), 0.84)
    const meta = await bundlePed({ root, dir: bundle.dir, gender: bundle.gender, items: bundle.items, written, lowercase, onProgress: (text) => onProgress?.(text, 0.84) })
    if (meta) pedMetas.push(meta)
  }
  if (pedMetas.length) root.file('peds.meta', pedsMetaFile(pedMetas))

  root.file('fxmanifest.lua', MANIFEST(projectName, plan.groups.map((g) => g.meta), pedMetas.length > 0))
  root.file('README.txt', README(plan, projectName, pack))
  let savedTo = null
  if (target === 'folder' && desktop) {
    onProgress?.(t('Skriver filer…'), 0.85)
    const files = []
    for (const [p, f] of Object.entries(zip.files)) if (!f.dir) files.push({ path: p, data: await f.async('uint8array') })
    savedTo = await desktop.exportFolder(projectName, files)
    if (!savedTo) return { cancelled: true }
  } else if (target === 'data') {
    // Bara för tester: zip-datan tillbaka utan spara-dialog.
    return { data: await zip.generateAsync({ type: 'uint8array' }), plan }
  } else {
    onProgress?.(t('Sparar zip…'), 0.85)
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } }, (m) => onProgress?.(t('Sparar zip…'), 0.85 + 0.15 * (m.percent / 100)))
    if (desktop) {
      savedTo = await desktop.saveZip(`${projectName}.zip`, data)
      if (!savedTo) return { cancelled: true }
    } else download(new Blob([data]), `${projectName}.zip`)
  }
  onProgress?.(t('Klart'), 1)
  return { packed: pack.length, built, errors, plan, savedTo }
}

// Bygger projektfilen (.alexproj = zip). Snabbt: oredigerade texturer sparas som originalfiler
// (.ytd) i stället för att avkodas, och bara ändrade texturer sparas som bilder.
export async function buildProjectData(state) {
  const zip = new JSZip()
  const meta = { version: 3, projectName: state.projectName, gender: state.gender, packs: state.packs, exportMode: state.exportMode, pedLook: state.pedLook, items: [] }
  const sources = new Map() // File -> sökväg i zip:en (en .ytd med flera texturer sparas bara en gång)
  const addSource = async (file) => {
    if (sources.has(file)) return sources.get(file)
    const p = `src/${sources.size}_${file.name}`
    zip.file(p, await file.arrayBuffer())
    sources.set(file, p)
    return p
  }
  for (const item of state.items) {
    const { converting, previewYdd, textures, ydd, preview, ...rest } = item // eslint-disable-line no-unused-vars
    const m = { ...rest, ydd: ydd?.name || null, preview: preview?.name || null, textures: [] }
    if (ydd) zip.file(`items/${item.id}/${ydd.name}`, await ydd.arrayBuffer())
    if (preview) zip.file(`items/${item.id}/preview/${preview.name}`, await preview.arrayBuffer())
    for (const tex of textures) {
      const out = { id: tex.id, name: tex.name, edited: tex.edited, width: tex.width || tex.canvas?.width, height: tex.height || tex.canvas?.height, layers: null }
      if (tex.original) out.original = await addSource(tex.original)
      if (tex.pending) out.pending = { src: await addSource(tex.pending.file), index: tex.pending.index }
      // Pixlar behövs bara om texturen är ändrad eller inte går att läsa från en originalfil.
      if (tex.canvas && (tex.edited || (!tex.original && !tex.pending))) zip.file(`items/${item.id}/tex/${tex.id}.png`, await canvasToBlob(tex.canvas))
      if (tex.base) {
        zip.file(`items/${item.id}/tex/${tex.id}_base.png`, await canvasToBlob(tex.base))
        out.layers = []
        for (const L of tex.layers || []) {
          const { img, ...lr } = L
          if (img) zip.file(`items/${item.id}/tex/${tex.id}_${L.id}.png`, await canvasToBlob(img))
          out.layers.push(lr)
        }
      }
      m.textures.push(out)
    }
    meta.items.push(m)
  }
  zip.file('project.json', JSON.stringify(meta))
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
}

// Sparar projektet som en fil man kan dela eller flytta till en annan dator.
export async function saveProject(state) {
  const data = await buildProjectData(state)
  const name = `${state.projectName}.alexproj`
  if (desktop) return desktop.saveZip(name, data)
  download(new Blob([data]), name)
}

export async function openProject(file, loadCanvas) {
  const zip = await JSZip.loadAsync(file)
  const meta = JSON.parse(await zip.file('project.json').async('string'))
  const asFile = async (path, name) => {
    const entry = zip.file(path)
    return entry ? new File([await entry.async('blob')], name || path.split('/').pop().replace(/^\d+_/, '')) : null
  }
  const files = new Map()
  const srcFile = async (p) => {
    if (!files.has(p)) files.set(p, await asFile(p))
    return files.get(p)
  }
  const png = async (path) => {
    const entry = zip.file(path)
    if (!entry) return null
    const url = URL.createObjectURL(await entry.async('blob'))
    try {
      return await loadCanvas(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const items = []
  for (const m of meta.items) {
    const textures = []
    for (const tex of m.textures) {
      const restored = { ...tex, version: 0, canvas: await png(`items/${m.id}/tex/${tex.id}.png`), original: null, pending: null }
      // Äldre projektfiler (version 2) sparade originalet under orig/.
      if ((meta.version || 2) < 3 && tex.original) restored.original = await asFile(`items/${m.id}/orig/${tex.id}/${tex.original}`, tex.original)
      else if (tex.original) restored.original = await srcFile(tex.original)
      if (tex.pending) restored.pending = { file: await srcFile(tex.pending.src), index: tex.pending.index }
      else if (!restored.canvas && restored.original) restored.pending = { file: restored.original, index: 0 }
      if (tex.layers) {
        restored.base = await png(`items/${m.id}/tex/${tex.id}_base.png`)
        restored.layers = []
        for (const L of tex.layers) restored.layers.push(L.type === 'image' ? { ...L, img: await png(`items/${m.id}/tex/${tex.id}_${L.id}.png`) } : L)
      }
      if (restored.canvas) {
        restored.width = restored.canvas.width
        restored.height = restored.canvas.height
      }
      textures.push(restored)
    }
    items.push({
      ...m,
      ydd: m.ydd ? await asFile(`items/${m.id}/${m.ydd}`, m.ydd) : null,
      preview: m.preview ? await asFile(`items/${m.id}/preview/${m.preview}`, m.preview) : null,
      textures,
    })
  }
  return { projectName: meta.projectName, gender: meta.gender, packs: meta.packs, exportMode: meta.exportMode, pedLook: meta.pedLook, items }
}
