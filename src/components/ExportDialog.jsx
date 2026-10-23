import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { exportResource, planExport } from '../lib/exporter'
import { categoryByKey, PEDS } from '../lib/categories'
import { desktop } from '../lib/desktop'
import { useT } from '../lib/i18n'
import { Button, Field, Input, Segmented } from './ui'

export default function ExportDialog({ onClose }) {
  const t = useT()
  const items = useStore((s) => s.items)
  const packs = useStore((s) => s.packs)
  const exportMode = useStore((s) => s.exportMode)
  const setExportMode = useStore((s) => s.setExportMode)
  const projectName = useStore((s) => s.projectName)
  const setProjectName = useStore((s) => s.setProjectName)
  const notify = useStore((s) => s.notify)
  const setPacksOpen = useStore((s) => s.setPacksOpen)
  const [busy, setBusy] = useState(false)
  const [showFiles, setShowFiles] = useState(null)

  const plan = useMemo(() => planExport({ items, packs, exportMode }), [items, packs, exportMode, t])
  const errors = plan.problems.filter((p) => p.level === 'error')
  const warns = plan.problems.filter((p) => p.level === 'warn')

  const run = async () => {
    setBusy(t('Förbereder…'))
    try {
      const { packed, built, errors: errs } = await exportResource({ projectName, items, packs, exportMode, onProgress: setBusy })
      if (errs.length) notify(t('Sollumz kunde inte packa {n} textur(er): {e}', { n: errs.length, e: errs[0] }), 'error')
      else if (packed) notify(t('Export klar. {n} texturer måste packas i OpenIV – se README.txt.', { n: packed }))
      else notify(t('Export klar ({n} texturer packade). Lägg mappen i resources/ och skriv ensure {r} i server.cfg.', { n: built, r: projectName }))
      onClose()
    } catch (e) {
      notify(t('Exporten misslyckades: {e}', { e: e.message }), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-100">{t('Exportera till FiveM')}</h2>
          <p className="mt-0.5 text-xs text-ink-400">{t('Skapar en färdig resurs-mapp med fxmanifest.lua, stream/ och allt FiveM behöver.')}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <ModeCard active={exportMode === 'addon'} onClick={() => setExportMode('addon')} title={t('Addon-paket')} badge={t('Rekommenderas')}>
              {t('Egna paket med egna namn, separat för kille och tjej. Läggs till efter GTA:s kläder – inget ersätts.')}
            </ModeCard>
            <ModeCard active={exportMode === 'replace'} onClick={() => setExportMode('replace')} title={t('Ersätt GTA-plagg')}>
              {t('Byter ut GTA:s egna freemode-plagg med samma nummer. Ingen .ymt behövs.')}
            </ModeCard>
          </div>

          <Field label={t('Resursens namn')} hint={t('Mappen du lägger i resources/. Små bokstäver, siffror och understreck.')}>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </Field>

          {(errors.length > 0 || warns.length > 0) && (
            <div className="space-y-1">
              {[...errors, ...warns].map((p, i) => (
                <p key={i} className={`rounded px-2.5 py-1.5 text-xs ${p.level === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-accent/10 text-accent'}`}>
                  {p.text}
                </p>
              ))}
            </div>
          )}

          {plan.mode === 'addon' ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{t('Paket som skapas')}</span>
                <Button size="sm" variant="ghost" onClick={() => setPacksOpen(true)}>
                  {t('Ändra paket och namn…')}
                </Button>
              </div>
              {plan.groups.length === 0 && <p className="text-xs text-ink-500">{t('Inga plagg i projektet.')}</p>}
              <div className="space-y-2">
                {plan.groups.map((g) => {
                  const key = `${g.pack.id}-${g.gender}`
                  const mine = plan.entries.filter((e) => e.group === g)
                  const byCat = {}
                  for (const e of mine) byCat[e.item.category] = (byCat[e.item.category] || 0) + 1
                  return (
                    <div key={key} className="rounded-md border border-ink-800 bg-ink-950 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-medium text-ink-100">
                          {g.pack.name} <span className="font-normal text-ink-400">· {t(PEDS[g.gender].label)}</span>
                        </span>
                        <span className="truncate font-mono text-[11px] text-ink-400">
                          {g.ped}_{g.dlc}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {Object.entries(byCat).map(([c, n]) => (
                          <span key={c} className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">
                            {t(categoryByKey(c).label)} {n}
                          </span>
                        ))}
                      </div>
                      <button className="mt-2 text-[11px] text-ink-400 hover:text-ink-200" onClick={() => setShowFiles(showFiles === key ? null : key)}>
                        {showFiles === key ? t('Dölj filer') : t('Visa filer ({n})', { n: mine.reduce((s, e) => s + 1 + e.textures.length, 2) })}
                      </button>
                      {showFiles === key && (
                        <div className="mt-1.5 max-h-48 overflow-y-auto font-mono text-[10.5px] leading-relaxed text-ink-400">
                          <div className="text-ink-200">{g.ymt}</div>
                          <div className="text-ink-200">{g.meta}</div>
                          {mine.map((e) => (
                            <div key={e.item.id}>
                              <div>{e.model}</div>
                              {e.textures.map((x) => (
                                <div key={x}>{x}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">{t('Filer i stream/')}</div>
              <div className="max-h-56 overflow-y-auto rounded border border-ink-800 bg-ink-950 p-2 font-mono text-[11px] leading-relaxed text-ink-300">
                {plan.entries.length === 0 && <span className="text-ink-500">{t('Inga plagg i projektet.')}</span>}
                {plan.entries.map((e) => (
                  <div key={e.item.id} className="mb-1.5">
                    <div>{e.model}</div>
                    {e.textures.map((x) => (
                      <div key={x}>{x}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!desktop && exportMode === 'addon' && <p className="text-xs text-accent">{t('Addon-paket kräver skrivbordsappen (för .ymt).')}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-800 px-5 py-3">
          <span className="text-xs text-ink-500">{errors.length ? t('{n} fel måste rättas', { n: errors.length }) : warns.length ? t('{n} varningar', { n: warns.length }) : t('Allt ser bra ut')}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>
              {t('Avbryt')}
            </Button>
            <Button variant="primary" onClick={run} disabled={!!busy || errors.length > 0 || !items.length || (!desktop && exportMode === 'addon')}>
              {busy || t('Exportera .zip')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeCard({ active, onClick, title, badge, children }) {
  return (
    <button onClick={onClick} className={`rounded-md border p-3 text-left transition-colors ${active ? 'border-accent/70 bg-accent/5' : 'border-ink-800 hover:border-ink-600'}`}>
      <span className="flex items-center gap-2 text-[13px] font-medium text-ink-100">
        <span className={`h-3 w-3 rounded-full border ${active ? 'border-accent bg-accent' : 'border-ink-500'}`} />
        {title}
        {badge && <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-normal text-ink-300">{badge}</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-400">{children}</span>
    </button>
  )
}
