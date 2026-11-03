// Projekthistorik: projekten sparas automatiskt i appen och visas på startsidan.
import { useStore } from './store'
import { buildProjectData, openProject } from './exporter'
import { loadImageToCanvas, decodePending } from './images'
import { desktop } from './desktop'
import { t } from './i18n'

const AUTOSAVE_MS = 45 * 1000
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

// Miniatyr till startsidan. Finns ingen öppnad textur läses den första direkt ur originalfilen.
async function thumbnail(items) {
  const all = items.flatMap((i) => i.textures)
  let src = all.find((x) => x.canvas)?.canvas
  if (!src) {
    const p = all.find((x) => x.pending)?.pending
    src = p ? await decodePending(p).catch(() => null) : null
  }
  if (!src) return null
  const tex = { canvas: src }
  const c = document.createElement('canvas')
  c.width = 160
  c.height = 80
  c.getContext('2d').drawImage(tex.canvas, 0, 0, 160, 80)
  return c.toDataURL('image/jpeg', 0.8)
}

let saving = null

// Sparar det öppna projektet i historiken. Returnerar false om det inte fanns något att spara.
export async function saveToHistory({ silent = false } = {}) {
  if (!desktop) return false
  if (saving) return saving
  const st = useStore.getState()
  if (!st.items.length) return false
  saving = (async () => {
    const id = st.projectId || newId()
    const data = await buildProjectData(st)
    const packs = st.packs.filter((p) => st.items.some((i) => i.packId === p.id)).map((p) => p.name)
    await desktop.saveProjectData(
      {
        id,
        name: st.projectName,
        items: st.items.length,
        male: st.items.filter((i) => i.gender === 'male').length,
        female: st.items.filter((i) => i.gender === 'female').length,
        packs,
        thumb: await thumbnail(st.items),
      },
      data
    )
    useStore.getState().markSaved(id)
    if (!silent) st.notify(t('Projektet sparades.'))
    return true
  })()
  try {
    return await saving
  } catch (e) {
    st.notify(t('Kunde inte spara projektet: {e}', { e: e.message }), 'error')
    return false
  } finally {
    saving = null
  }
}

export async function openFromHistory(id) {
  const st = useStore.getState()
  try {
    const data = await desktop.loadProjectData(id)
    const p = await openProject(new Blob([data]), loadImageToCanvas)
    useStore.getState().loadProject({ ...p, projectId: id })
  } catch (e) {
    st.notify(t('Kunde inte öppna projektet: {e}', { e: e.message }), 'error')
  }
}

// Går till startsidan. Osparade ändringar sparas först.
export async function goHome() {
  const st = useStore.getState()
  if (st.dirty) await saveToHistory({ silent: true })
  useStore.getState().setScreen('home')
}

export async function newProject() {
  const st = useStore.getState()
  if (st.dirty) await saveToHistory({ silent: true })
  useStore.getState().resetProject(t('nytt_projekt'))
}

// Markerar projektet som ändrat när plagg, paket eller namn ändras, och sparar automatiskt.
export function startAutosave() {
  if (!desktop) return () => {}
  const unsub = useStore.subscribe((s, prev) => {
    if (s.screen !== 'editor' || s.dirty) return
    if (s.items !== prev.items || s.packs !== prev.packs || s.projectName !== prev.projectName || s.exportMode !== prev.exportMode) {
      useStore.setState({ dirty: true })
    }
  })
  const timer = setInterval(() => {
    const s = useStore.getState()
    if (s.dirty && s.screen === 'editor' && !s.items.some((i) => i.converting)) saveToHistory({ silent: true })
  }, AUTOSAVE_MS)
  // Appen frågar innan den stänger – osparade ändringar sparas, sedan stängs fönstret.
  const offClosing = desktop.onClosing(async () => {
    if (useStore.getState().dirty) await saveToHistory({ silent: true })
    desktop.closeNow()
  })
  return () => {
    unsub()
    clearInterval(timer)
    offClosing()
  }
}
