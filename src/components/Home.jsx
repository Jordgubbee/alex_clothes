import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { desktop } from '../lib/desktop'
import { newProject, openFromHistory } from '../lib/projects'
import { openProject } from '../lib/exporter'
import { loadImageToCanvas } from '../lib/images'
import { useT } from '../lib/i18n'
import { Button, FilePick, Icon } from './ui'

// Startsidan: dina tidigare projekt (historik), nytt projekt och öppna projektfil.
export default function Home() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const notify = useStore((s) => s.notify)
  const loadProject = useStore((s) => s.loadProject)
  const current = useStore((s) => s.projectId)
  const hasOpen = useStore((s) => s.items.length > 0)
  const setScreen = useStore((s) => s.setScreen)
  const [projects, setProjects] = useState(null)
  const [query, setQuery] = useState('')
  const [opening, setOpening] = useState(null)
  const [renaming, setRenaming] = useState(null)

  const refresh = () => desktop?.listProjects().then(setProjects)
  useEffect(() => {
    refresh()
  }, [])

  const open = async (id) => {
    setOpening(id)
    await openFromHistory(id)
    setOpening(null)
  }

  const remove = async (p) => {
    if (!confirm(t('Ta bort projektet "{n}" från historiken? Det går inte att ångra.', { n: p.name }))) return
    await desktop.deleteProject(p.id)
    refresh()
  }

  const rename = async (p, name) => {
    setRenaming(null)
    const clean = name.trim()
    if (!clean || clean === p.name) return
    await desktop.renameProject(p.id, clean)
    if (current === p.id) useStore.getState().setProjectName(clean)
    refresh()
  }

  const fmt = (ms) =>
    new Date(ms).toLocaleString({ sv: 'sv-SE', no: 'nb-NO', da: 'da-DK', fi: 'fi-FI', en: 'en-GB' }[lang] || 'sv-SE', { dateStyle: 'medium', timeStyle: 'short' })

  const list = (projects || []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-ink-950">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink-100">{t('Dina kläder')}</h1>
            <p className="mt-1 text-[13px] text-ink-400">{t('Allt du gör sparas automatiskt här. Öppna ett gammalt projekt eller börja på nytt.')}</p>
          </div>
          <div className="flex gap-2">
            {hasOpen && (
              <Button onClick={() => setScreen('editor')}>
                {t('Tillbaka till öppet projekt')}
              </Button>
            )}
            <FilePick
              accept=".alexproj"
              onFiles={async ([f]) => {
                try {
                  loadProject({ ...(await openProject(f, loadImageToCanvas)), projectId: null })
                  notify(t('Projektet öppnades.'))
                } catch (e) {
                  notify(t('Kunde inte öppna projektet: {e}', { e: e.message }), 'error')
                }
              }}
            >
              {t('Öppna projektfil…')}
            </FilePick>
            <Button variant="primary" onClick={newProject}>
              <Icon name="plus" /> {t('Nytt projekt')}
            </Button>
          </div>
        </div>

        {projects && projects.length > 0 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Sök projekt…')}
            className="mb-4 h-9 w-full max-w-xs rounded-md border border-ink-700 bg-ink-900 px-3 text-[13px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-ink-500"
          />
        )}

        {projects === null ? (
          <p className="text-[13px] text-ink-400">{t('Laddar…')}</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-700 px-6 py-16 text-center">
            <p className="text-sm font-medium text-ink-100">{t('Inga projekt än')}</p>
            <p className="mt-1 max-w-sm text-[13px] text-ink-400">{t('Skapa ett nytt projekt och importera kläder. Det sparas automatiskt och dyker upp här.')}</p>
            <Button variant="primary" className="mt-4" onClick={newProject}>
              <Icon name="plus" /> {t('Nytt projekt')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {list.map((p) => (
              <div key={p.id} className={`group overflow-hidden rounded-lg border bg-ink-900 ${current === p.id ? 'border-accent/60' : 'border-ink-800 hover:border-ink-600'}`}>
                <button onClick={() => open(p.id)} disabled={!!opening} className="block w-full text-left">
                  <div className="checker relative aspect-[2/1] w-full overflow-hidden">
                    {p.thumb && <img alt="" src={p.thumb} className="h-full w-full object-cover" />}
                    {opening === p.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-ink-100">{t('Öppnar…')}</div>
                    )}
                  </div>
                </button>
                <div className="px-3 py-2.5">
                  {renaming === p.id ? (
                    <input
                      autoFocus
                      defaultValue={p.name}
                      onBlur={(e) => rename(p, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      className="h-7 w-full rounded border border-ink-600 bg-ink-950 px-2 text-[13px] text-ink-100 outline-none"
                    />
                  ) : (
                    <button onClick={() => open(p.id)} className="block w-full truncate text-left text-[13px] font-medium text-ink-100" title={p.name}>
                      {p.name}
                    </button>
                  )}
                  <div className="mt-0.5 text-[11px] text-ink-400">{fmt(p.updated)}</div>
                  <div className="mt-1 truncate text-[11px] text-ink-500">
                    {t('{n} plagg', { n: p.items })}
                    {p.male ? ` · ${t('Kille')} ${p.male}` : ''}
                    {p.female ? ` · ${t('Tjej')} ${p.female}` : ''}
                    {p.packs?.length ? ` · ${p.packs.join(', ')}` : ''}
                  </div>
                  <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="sm" variant="ghost" onClick={() => setRenaming(p.id)}>
                      {t('Byt namn')}
                    </Button>
                    <Button size="sm" variant="ghost" title={t('Spara projektet som en fil du kan flytta eller dela')} onClick={async () => desktop.saveZip(`${p.name}.alexproj`, await desktop.loadProjectData(p.id))}>
                      {t('Spara som fil')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                      <Icon name="trash" /> {t('Ta bort')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
