import { useStore } from './store'
import { guessFromFilename, categoryByKey } from './categories'
import { readYTD } from './ytd'
import { extOf, textureEntries, TEXTURE_EXTS, MODEL_EXTS, baseName } from './images'
import { desktop, previewMany } from './desktop'
import { t } from './i18n'

// Sorterar in filer i plagg. Utan målplagg grupperas filerna efter kategori + nummer i filnamnet,
// så att man kan dra in en hel mapp från OpenIV på en gång.
// opts.gender: tvinga kön/ped, t.ex. när en egen peds kläder importeras (filerna saknar då prefix).
export async function importFiles(files, targetItemId = null, opts = {}) {
  const st = useStore.getState()
  const created = new Map()
  const toConvert = new Set()

  const itemFor = (file) => {
    if (targetItemId) return targetItemId
    const parsed = guessFromFilename(file.name)
    const { dlc, ...g } = parsed || {}
    if (opts.gender) g.gender = opts.gender
    const gender = g.gender || st.gender
    // Filer från ett addon-paket (…_ems_f_clothes^…) läggs i ett paket med samma namn.
    const packId = dlc ? useStore.getState().packForDlc(dlc, gender) : undefined
    const key = parsed ? `${gender}-${packId || ''}-${g.category}-${g.slot}` : 'misc'
    if (created.has(key)) return created.get(key)
    const existing = parsed && useStore.getState().items.find((i) => i.gender === gender && i.category === g.category && i.slot === g.slot && (!packId || i.packId === packId))
    if (existing) {
      created.set(key, existing.id)
      return existing.id
    }
    if (g.gender && g.gender !== useStore.getState().gender) useStore.getState().setGender(g.gender)
    const item = useStore.getState().addItem({ quiet: true, name: baseName(file.name).split('^').pop().replace(/_diff/, ''), ...g, ...(packId ? { packId } : {}) })
    created.set(key, item.id)
    return item.id
  }

  const sorted = [...files].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
  let count = 0
  for (const file of sorted) {
    const ext = extOf(file.name)
    try {
      if (ext === 'ydd') {
        const id = itemFor(file)
        useStore.getState().updateItem(id, { ydd: file })
        const item = useStore.getState().items.find((i) => i.id === id)
        if (desktop && (!item.preview || item.previewFromYdd)) toConvert.add(id)
        count++
      } else if (MODEL_EXTS.includes(ext)) {
        useStore.getState().updateItem(itemFor(file), { preview: file, previewFromYdd: false })
        count++
      } else if (TEXTURE_EXTS.includes(ext)) {
        const list = await textureEntries(file)
        const original = ext === 'ytd' && list.length === 1 ? file : null
        const id = itemFor(file)
        // Pedens egen texturändelse (uni, whi, bla …) följer med till exporten.
        const suffix = guessFromFilename(file.name)?.texSuffix
        const it = useStore.getState().items.find((i) => i.id === id)
        if (suffix && it && !it.texSuffix) useStore.getState().updateItem(id, { texSuffix: suffix })
        useStore.getState().addTextures(id, list.map((t) => ({ ...t, original })))
        count += list.length
      } else if (!['ymt', 'meta', 'yft', 'xml', 'ini', 'txt', 'lua'].includes(ext)) {
        st.notify(`${file.name}: ${t('filtypen stöds inte.')}`, 'error')
      }
    } catch (e) {
      st.notify(`${file.name}: ${e.message}`, 'error')
    }
  }
  if (count) st.notify(targetItemId ? t('{n} filer importerade.', { n: count }) : t('{n} filer importerade. Klicka på ett plagg för att visa det.', { n: count }))
  // 3D byggs bara för plagget man har öppet – resten byggs när man klickar på dem.
  const open = useStore.getState().selectedItemId
  if (open && toConvert.has(open)) await previewMany([open])
}

// Peds med alla texturer i en fil (s_m_y_cop_01.ytd / s_m_y_cop_01_p.ytd): varje del och nummer
// (uppr_diff_000_a_whi, uppr_diff_000_b_bla …) blir ett plagg med sina färgvarianter. Normal- och
// spec-kartor hoppas över. Exporten bygger sedan om pedens .ytd med bara de ändrade texturerna utbytta.
export async function importCompoundYtd(file, gender) {
  const st = useStore.getState()
  const prop = /_p\.ytd$/i.test(file.name)
  const list = await readYTD(await file.arrayBuffer(), { decode: false })
  const groups = new Map()
  for (const tex of list) {
    const m = tex.name.toLowerCase().match(/^([a-z_]+?)_diff_(\d{3})_([a-z])(?:_([a-z]+))?$/)
    if (!m || !categoryByKey(m[1])) continue
    const key = `${m[1]}_${m[2]}`
    if (!groups.has(key)) groups.set(key, { category: m[1], slot: parseInt(m[2], 10), suffix: m[4] || null, textures: [] })
    groups.get(key).textures.push({ ...tex, letter: m[3] })
  }
  let count = 0
  for (const g of [...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || a.slot - b.slot)) {
    g.textures.sort((a, b) => a.letter.localeCompare(b.letter))
    const item = st.addItem({
      quiet: true,
      name: `${g.category}_${String(g.slot).padStart(3, '0')}`,
      gender,
      category: g.category,
      slot: g.slot,
      skin: g.suffix && g.suffix !== 'uni',
      texSuffix: g.suffix,
      compound: { file, prop },
    })
    useStore.getState().addTextures(
      item.id,
      g.textures.map((x) => ({ name: x.name, width: x.width, height: x.height, canvas: null, pending: { file, index: x.index } }))
    )
    count++
  }
  return count
}

// .ydd först så att kategori och nummer gissas från modellen.
function order(f) {
  const ext = extOf(f.name)
  if (ext === 'ydd') return 0
  if (MODEL_EXTS.includes(ext)) return 1
  return 2
}
