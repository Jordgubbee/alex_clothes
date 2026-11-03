import { useEffect, useState } from 'react'
import { desktop, loadSavedPeds, previewFromYdd } from './lib/desktop'
import { useStore } from './lib/store'
import { LANGUAGES, useT, t as tr } from './lib/i18n'
import { openItem } from './lib/loader'
import Sidebar from './components/Sidebar'
import Inspector from './components/Inspector'
import TextureEditor from './components/TextureEditor'
import Viewer3D from './components/Viewer3D'
import ExportDialog from './components/ExportDialog'
import SettingsDialog from './components/SettingsDialog'
import PackDialog from './components/PackDialog'
import Home from './components/Home'
import { goHome, saveToHistory, startAutosave } from './lib/projects'
import { Button, Icon, Segmented } from './components/ui'

export default function App() {
  const t = useT()
  const gender = useStore((s) => s.gender)
  const setGender = useStore((s) => s.setGender)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const projectName = useStore((s) => s.projectName)
  const setProjectName = useStore((s) => s.setProjectName)
  const toast = useStore((s) => s.toast)
  const notify = useStore((s) => s.notify)
  const screen = useStore((s) => s.screen)
  const customPeds = useStore((s) => s.customPeds)
  const dirty = useStore((s) => s.dirty)
  const lastSaved = useStore((s) => s.lastSaved)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const packsOpen = useStore((s) => s.packsOpen)
  const setPacksOpen = useStore((s) => s.setPacksOpen)
  const exportMode = useStore((s) => s.exportMode)
  const setBlender = useStore((s) => s.setBlender)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const [exporting, setExporting] = useState(false)
  const selectedItemId = useStore((s) => s.selectedItemId)

  // Plagget laddas (texturer + 3D) först när man klickar på det.
  useEffect(() => {
    if (selectedItemId) openItem(selectedItemId)
  }, [selectedItemId])

  // Historik: autospara, och utan skrivbordsappen finns ingen startsida.
  useEffect(() => {
    if (!desktop) useStore.getState().setScreen('editor')
    return startAutosave()
  }, [])

  // Ctrl+S sparar projektet.
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (useStore.getState().screen === 'editor') saveToHistory()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'no' ? 'nb' : lang
  }, [lang])

  useEffect(() => {
    if (!desktop) return
    desktop.checkBlender().then((b) => {
      setBlender(b)
      loadSavedPeds(b)
    })
    return desktop.onEdited(({ itemId, name, data, error }) => {
      if (error) return notify(error, 'error')
      useStore.getState().updateItem(itemId, { ydd: new File([data], name) })
      notify(tr('Ny .ydd mottagen från Blender.'))
      previewFromYdd(itemId)
    })
  }, [setBlender, notify])

  return (
    <div className="flex h-screen flex-col bg-ink-950 text-ink-100">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-4">
        <span className="text-[13px] font-semibold tracking-tight">
          alex<span className="text-accent">_</span>clothes
        </span>
        {screen === 'editor' && desktop && (
          <Button variant="ghost" size="sm" onClick={goHome} title={t('Startsidan med alla dina projekt')}>
            ← {t('Hem')}
          </Button>
        )}
        {screen === 'editor' && (<>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-xs text-ink-300 outline-none hover:border-ink-700 focus:border-ink-600"
          title={t('Projektnamn')}
        />
        {desktop && (
          <span className="text-[11px] text-ink-500">{dirty ? t('Osparade ändringar') : lastSaved ? t('Sparat {tid}', { tid: new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : ''}</span>
        )}
        </>)}
        <div className="flex-1" />
        {screen === 'editor' && (<>
        <Segmented
          value={gender}
          onChange={setGender}
          options={[{ value: 'male', label: t('Kille') }, { value: 'female', label: t('Tjej') }, ...customPeds.map((m) => ({ value: m, label: m }))]}
        />
        <Segmented value={view} onChange={setView} options={[{ value: '2d', label: '2D' }, { value: 'split', label: '2D + 3D' }, { value: '3d', label: '3D' }]} />
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => saveToHistory()} title="Ctrl+S">
          {t('Spara')}
        </Button>
        {exportMode === 'addon' && (
          <Button variant="ghost" onClick={() => setPacksOpen(true)}>
            {t('Paket')}
          </Button>
        )}
        </>)}
        {desktop && (
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            {t('Inställningar')}
          </Button>
        )}
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="h-7 rounded-md border border-ink-700 bg-ink-900 px-1.5 text-xs text-ink-200"
          title="Language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {screen === 'editor' && (
          <Button variant="primary" onClick={() => setExporting(true)}>
            {t('Exportera till FiveM')}
          </Button>
        )}
      </header>

      {screen === 'home' ? (
        <Home />
      ) : (
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1">
          {view !== '3d' && (
            <div className={`min-w-0 ${view === 'split' ? 'w-[58%] border-r border-ink-800' : 'flex-1'}`}>
              <TextureEditor />
            </div>
          )}
          {view !== '2d' && (
            <div className="min-w-0 flex-1">
              <Viewer3D />
            </div>
          )}
        </main>
        <Inspector />
      </div>
      )}

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {settingsOpen && <SettingsDialog />}
      {packsOpen && <PackDialog />}
      {toast && (
        <div
          key={toast.id}
          className={`fixed bottom-5 left-1/2 z-50 max-w-xl -translate-x-1/2 rounded-md border px-4 py-2 text-[13px] ${toast.kind === 'error' ? 'border-red-500/40 bg-[#2a1515] text-red-200' : 'border-ink-700 bg-ink-800 text-ink-100'}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
