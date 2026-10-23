import JSZip from 'jszip'
import { streamNames, addonNames, categoryByKey, PEDS, ALL_CATEGORIES } from './categories'
import { canvasToBlob, extOf } from './images'
import { writeDDSDXT5 } from './dds'
import { desktop, cleanError } from './desktop'
import { buildYmtXml, buildShopMeta } from './ymt'
import { packDlc } from './store'
import { t } from './i18n'
import { ensureAllTextures } from './loader'

export function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const MB = 1024 * 1024
const pow2 = (n) => n > 0 && (n & (n - 1)) === 0
const DLC_RE = /^[a-z][a-z0-9_]{1,40}$/
const itemLabel = (item) => `${t(categoryByKey(item.category).label)} · ${item.name} (${t(PEDS[item.gender].label)})`

/**
 * Räknar fram exakt vad exporten kommer att innehålla och vad som är fel.
 * Samma plan används för förhandsvisningen och för själva exporten, så det man ser är det man får.
 */
export function planExport({ items, packs, exportMode }) {
  const problems = []
  const err = (text) => problems.push({ level: 'error', text })
  const warn = (text) => problems.push({ level: 'warn', text })
  const entries = [] // { item, model, textures: [names], group }
  const groups = [] // addon: { pack, gender, dlc, ped, ymt, meta, components, props }

  for (const item of items) {
    const label = itemLabel(item)
    if (!item.ydd) err(t('{x}: saknar .ydd-modell.', { x: label }))
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

  if (exportMode === 'replace') {
    const seen = new Set()
    for (const item of items) {
      const key = `${item.gender}-${item.category}-${item.slot}`
      if (seen.has(key)) err(t('{x}: nummer {n} används av två plagg.', { x: itemLabel(item), n: item.slot }))
      seen.add(key)
      const base = { gender: item.gender, category: item.category, slot: item.slot, skin: item.skin }
      entries.push({
        item,
        model: `stream/${streamNames(base).model}`,
        textures: item.textures.map((_, i) => `stream/${streamNames({ ...base, textureIndex: i }).texture}`),
      })
    }
    return { mode: 'replace', entries, groups, problems }
  }

  // Addon: ett eget paket per (paket, kön) med .ymt + .meta, numrerat från 000 i varje kategori.
  const dlcOwner = new Map()
  for (const pack of packs) {
    for (const gender of ['male', 'female']) {
      const mine = items.filter((i) => i.packId === pack.id && i.gender === gender)
      if (!mine.length) continue
      const dlc = packDlc(pack, gender)
      const ped = PEDS[gender].model
      if (!DLC_RE.test(dlc)) err(t('Paketnamnet "{d}" är ogiltigt. Använd små bokstäver, siffror och understreck, och börja med en bokstav.', { d: dlc }))
      const owner = dlcOwner.get(`${gender}:${dlc}`)
      if (owner) err(t('Paketen "{a}" och "{b}" får samma namn ({d}) för {g}.', { a: owner, b: pack.name, d: dlc, g: t(PEDS[gender].label) }))
      dlcOwner.set(`${gender}:${dlc}`, pack.name)

      const folder = `stream/${pack.name}/[${gender}]`
      const group = { pack, gender, dlc, ped, components: {}, props: {}, ymt: `stream/${pack.name}/${ped}_${dlc}.ymt`, meta: `meta/${ped}_${dlc}.meta`, count: mine.length }
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
            model: `${folder}/${cat.key}/${addonNames(base).model}`,
            textures: item.textures.map((_, i) => `${folder}/${cat.key}/${addonNames({ ...base, textureIndex: i }).texture}`),
          })
          const n = Math.max(1, item.textures.length)
          if (cat.prop) (group.props[cat.id] ||= []).push({ textures: n })
          else (group.components[cat.id] ||= []).push({ skin: item.skin, textures: n })
        })
      }
      groups.push(group)
    }
  }
  return { mode: 'addon', entries, groups, problems }
}

const MANIFEST = (name, metas) => `fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'alex_clothes'
description '${name}'
version '1.0.0'
${
  metas.length
    ? `
files {
${metas.map((m) => `  '${m}',`).join('\n')}
}

${metas.map((m) => `data_file 'SHOP_PED_APPAREL_META_FILE' '${m}'`).join('\n')}
`
    : `
-- Filerna i stream/ ersätter GTA:s egna freemode-plagg.
`
}`

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
  packList.length
    ? `
${t('Följande texturer kunde inte packas automatiskt och ligger i _packa_texturer. Packa dem till .ytd i OpenIV med exakt samma namn:')}

${packList.map((p) => `  ${p.dds}  ->  ${p.ytd}`).join('\n')}
`
    : ''
}`

export async function exportResource({ projectName, items, packs, exportMode, onProgress }) {
  const plan = planExport({ items, packs, exportMode })
  if (plan.problems.some((p) => p.level === 'error')) throw new Error(t('Rätta felen först.'))
  // Texturer som aldrig öppnats och inte kan kopieras rakt av behöver sina pixlar.
  if (items.some((i) => i.textures.some((x) => !x.canvas && !(x.original && !x.edited)))) await ensureAllTextures()
  const zip = new JSZip()
  const root = zip.folder(projectName)
  const pack = []
  const errors = []
  let built = 0

  // .ymt byggs med CodeWalker och kontrolleras innan något skrivs till zip:en.
  if (plan.mode === 'addon') {
    if (!desktop) throw new Error(t('Addon-paket kräver skrivbordsappen (för .ymt).'))
    onProgress?.(t('Bygger .ymt…'))
    const ymts = await desktop.buildYmt(plan.groups.map((g) => ({ name: g.ymt.split('/').pop(), xml: buildYmtXml({ dlc: g.dlc, components: g.components, props: g.props }) })))
    plan.groups.forEach((g, i) => {
      root.file(g.ymt, ymts[i].data)
      root.file(g.meta, buildShopMeta({ ped: g.ped, dlc: g.dlc, female: g.gender === 'female' }))
    })
  }

  let done = 0
  for (const entry of plan.entries) {
    const { item } = entry
    onProgress?.(t('Packar {a} av {b}…', { a: ++done, b: plan.entries.length }))
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

  root.file('fxmanifest.lua', MANIFEST(projectName, plan.groups.map((g) => g.meta)))
  root.file('README.txt', README(plan, projectName, pack))
  onProgress?.(t('Sparar zip…'))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  download(blob, `${projectName}.zip`)
  return { packed: pack.length, built, errors, plan }
}

// Sparar hela projektet (modeller + texturer + paket) i en fil som kan öppnas igen.
export async function saveProject(state) {
  await ensureAllTextures()
  const zip = new JSZip()
  const meta = { version: 2, projectName: state.projectName, gender: state.gender, packs: state.packs, exportMode: state.exportMode, items: [], basePed: {} }
  for (const g of ['male', 'female']) {
    const f = state.basePed[g]
    if (f) {
      zip.file(`ped/${g}/${f.name}`, await f.arrayBuffer())
      meta.basePed[g] = f.name
    }
  }
  for (const item of state.items) {
    const m = { ...item, converting: false, ydd: item.ydd?.name || null, preview: item.preview?.name || null, textures: [] }
    if (item.ydd) zip.file(`items/${item.id}/${item.ydd.name}`, await item.ydd.arrayBuffer())
    if (item.preview) zip.file(`items/${item.id}/preview/${item.preview.name}`, await item.preview.arrayBuffer())
    for (const tex of item.textures) {
      zip.file(`items/${item.id}/tex/${tex.id}.png`, await canvasToBlob(tex.canvas))
      if (tex.original) zip.file(`items/${item.id}/orig/${tex.id}/${tex.original.name}`, await tex.original.arrayBuffer())
      // Lager sparas separat så att text och loggor går att ändra igen efter att projektet öppnats.
      let layers = null
      if (tex.base) {
        zip.file(`items/${item.id}/tex/${tex.id}_base.png`, await canvasToBlob(tex.base))
        layers = []
        for (const L of tex.layers || []) {
          const { img, ...rest } = L
          if (img) zip.file(`items/${item.id}/tex/${tex.id}_${L.id}.png`, await canvasToBlob(img))
          layers.push(rest)
        }
      }
      m.textures.push({ id: tex.id, name: tex.name, edited: tex.edited, original: tex.original?.name || null, layers })
    }
    meta.items.push(m)
  }
  zip.file('project.json', JSON.stringify(meta, null, 2))
  download(await zip.generateAsync({ type: 'blob' }), `${state.projectName}.alexproj`)
}

export async function openProject(file, loadCanvas) {
  const zip = await JSZip.loadAsync(file)
  const meta = JSON.parse(await zip.file('project.json').async('string'))
  const asFile = async (path, name) => {
    const entry = zip.file(path)
    return entry ? new File([await entry.async('blob')], name) : null
  }
  const basePed = { male: null, female: null }
  for (const g of ['male', 'female']) if (meta.basePed[g]) basePed[g] = await asFile(`ped/${g}/${meta.basePed[g]}`, meta.basePed[g])
  const png = async (path) => {
    const url = URL.createObjectURL(await zip.file(path).async('blob'))
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
      const blob = await zip.file(`items/${m.id}/tex/${tex.id}.png`).async('blob')
      const url = URL.createObjectURL(blob)
      const canvas = await loadCanvas(url)
      URL.revokeObjectURL(url)
      const restored = { ...tex, canvas, version: 0, original: tex.original ? await asFile(`items/${m.id}/orig/${tex.id}/${tex.original}`, tex.original) : null }
      if (tex.layers) {
        restored.base = await png(`items/${m.id}/tex/${tex.id}_base.png`)
        restored.layers = []
        for (const L of tex.layers) restored.layers.push(L.type === 'image' ? { ...L, img: await png(`items/${m.id}/tex/${tex.id}_${L.id}.png`) } : L)
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
  return { projectName: meta.projectName, gender: meta.gender, packs: meta.packs, exportMode: meta.exportMode, basePed, items }
}
