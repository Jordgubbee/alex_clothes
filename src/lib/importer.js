import { useStore } from './store'
import { guessFromFilename } from './categories'
import { extOf, textureEntries, TEXTURE_EXTS, MODEL_EXTS, baseName } from './images'
import { desktop, previewMany } from './desktop'
import { t } from './i18n'

// Sorterar in filer i plagg. Utan målplagg grupperas filerna efter kategori + nummer i filnamnet,
// så att man kan dra in en hel mapp från OpenIV på en gång.
export async function importFiles(files, targetItemId = null) {
  const st = useStore.getState()
  const created = new Map()
  const toConvert = new Set()

  const itemFor = (file) => {
    if (targetItemId) return targetItemId
    const parsed = guessFromFilename(file.name)
    const { dlc, ...g } = parsed || {}
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
        useStore.getState().addTextures(itemFor(file), list.map((t) => ({ ...t, original })))
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

// .ydd först så att kategori och nummer gissas från modellen.
function order(f) {
  const ext = extOf(f.name)
  if (ext === 'ydd') return 0
  if (MODEL_EXTS.includes(ext)) return 1
  return 2
}
