import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { desktop, importPedFromGta, pedsFromGta, pedFromFolder } from '../lib/desktop'
import { PEDS } from '../lib/categories'
import { LANGUAGES, useT } from '../lib/i18n'
import { Button, FilePick } from './ui'

export default function SettingsDialog() {
  const t = useT()
  const blender = useStore((s) => s.blender)
  const setBlender = useStore((s) => s.setBlender)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const basePed = useStore((s) => s.basePed)
  const setBasePed = useStore((s) => s.setBasePed)
  const setPedTextures = useStore((s) => s.setPedTextures)
  const pedBusy = useStore((s) => s.pedBusy)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const [checking, setChecking] = useState(false)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    desktop.getSettings().then(setSettings)
  }, [])

  const pick = async (key) => {
    if (await desktop.pickFolder(key)) setSettings(await desktop.getSettings())
  }

  const recheck = async () => {
    setChecking(true)
    setBlender(await desktop.checkBlender())
    setChecking(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-100">{t('Inställningar')}</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-ink-200">{t('Språk')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => (
                <Button key={l.id} size="sm" variant={lang === l.id ? 'primary' : 'default'} onClick={() => setLang(l.id)}>
                  {l.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-ink-200">Blender + Sollumz</h3>
            <div className="rounded-md border border-ink-800 bg-ink-950 p-3 text-xs">
              <Row label="Blender">{blender?.blender || <span className="text-accent">{t('Hittades inte')}</span>}</Row>
              <Row label="Sollumz">
                {blender?.ok ? (
                  <span className="text-emerald-400">{blender.mode === 'native' ? t('Installerat · läser binära GTA-filer direkt') : t('Installerat · endast XML-läge')}</span>
                ) : (
                  <span className="text-accent">{blender?.error || t('Inte kontrollerat')}</span>
                )}
              </Row>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                onClick={async () => {
                  if (await desktop.pickBlender()) recheck()
                }}
              >
                {t('Välj blender.exe…')}
              </Button>
              <Button size="sm" variant="ghost" onClick={recheck} disabled={checking}>
                {checking ? t('Kontrollerar…') : t('Kontrollera igen')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => desktop.openExternal('https://github.com/Sollumz/Sollumz/releases')}>
                {t('Hämta Sollumz')}
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{t('Sollumz används för att läsa .ydd, bygga 3D-vyn, öppna plagg i Blender, slå ihop texturer och packa texturer till .ytd vid export.')}</p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-ink-200">GTA V</h3>
            <div className="rounded-md border border-ink-800 bg-ink-950 p-3 text-xs">
              <PathRow label="GTA V" value={settings?.gtaPath} onPick={() => pick('gtaPath')} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{t('Appen läser freemode-gubbarna direkt ur ditt spel och bygger .ymt-filerna själv. Inget extra program behövs, och filerna stannar på din dator.')}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink-200">{t('Freemode-gubbar')}</h3>
              <Button size="sm" variant="primary" disabled={!!pedBusy || !blender?.ok} onClick={pedsFromGta}>
                {pedBusy || t('Hämta båda från mitt GTA')}
              </Button>
            </div>
            {Object.entries(PEDS).map(([g, p]) => (
              <div key={g} className="mb-1.5 flex items-center gap-2 text-xs">
                <span className="w-16 text-ink-300">{t(p.label)}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-500">{basePed[g]?.name || t('Ingen')}</span>
                <Button size="sm" variant="ghost" disabled={!!pedBusy} onClick={() => pedFromFolder(g)}>
                  {t('Mapp…')}
                </Button>
                <FilePick size="sm" variant="ghost" multiple accept=".ydd,.yft,.ytd" onFiles={(f) => importPedFromGta(g, f)}>
                  {t('Filer…')}
                </FilePick>
                {basePed[g] && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await desktop.clearPed(g)
                      setBasePed(g, null)
                      setPedTextures(g, [])
                    }}
                  >
                    {t('Ta bort')}
                  </Button>
                )}
              </div>
            ))}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{t('Manuellt från OpenIV: exportera mp_m_freemode_01.yft och mappen mp_m_freemode_01 ur x64v.rpf › models › cdimages › streamedpeds_mp.rpf och välj den med Mapp….')}</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-ink-800 px-5 py-3">
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t('Klar')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PathRow({ label, value, onPick }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 py-0.5">
      <span className="w-20 shrink-0 text-ink-500">{label}</span>
      <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink-200' : 'text-accent'}`} title={value || ''}>
        {value || t('Hittades inte')}
      </span>
      <Button size="sm" variant="ghost" onClick={onPick}>
        {t('Ändra')}
      </Button>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-16 shrink-0 text-ink-500">{label}</span>
      <span className="min-w-0 break-all text-ink-200">{children}</span>
    </div>
  )
}
