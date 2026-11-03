import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { desktop, cleanError, texKey } from '../lib/desktop'
import { isCustomPed, categoryByKey } from '../lib/categories'
import { Button } from './ui'
import { useT } from '../lib/i18n'

// Delarna i den ordning de visas i menyn. Grunddelarna (head, uppr, lowr, feet) finns alltid på peden.
const ORDER = ['head', 'hair', 'uppr', 'lowr', 'feet', 'jbib', 'accs', 'teef', 'berd', 'hand', 'task', 'decl']

export const partLabel = (comp, t) =>
  ({ head: t('Huvud & ansikte'), uppr: t('Överkropp'), lowr: t('Ben'), feet: t('Fötter'), hand: t('Händer') })[comp] || t(categoryByKey(comp)?.label || comp)

// Vilka modeller (nummer) och färger (a, b, c …) som finns per del.
// Freemode: ur listan över GTA:s filer. Egna peds: ur pedens egen modell och texturer.
function optionsFromIndex(names) {
  const out = {}
  for (const n of names) {
    const m = n.match(/^([a-z]+)_(\d{3})_[ru]\.ydd$/)
    if (m) (out[m[1]] ||= { slots: new Set(), letters: {} }).slots.add(parseInt(m[2], 10))
  }
  for (const n of names) {
    const m = n.match(/^([a-z]+)_diff_(\d{3})_([a-z])(_[a-z]+)?\.ytd$/)
    if (m && out[m[1]]) (out[m[1]].letters[parseInt(m[2], 10)] ||= new Set()).add(m[3])
  }
  return out
}

function optionsFromPed(ped, textures) {
  const out = {}
  ped?.traverse((m) => {
    const p = m.isMesh && m.userData.part
    if (p) (out[p.comp] ||= { slots: new Set(), letters: {} }).slots.add(p.slot)
  })
  for (const x of textures || []) {
    const m = texKey(x.name).match(/^([a-z]+)_diff_(\d{3})_([a-z])/)
    if (m && out[m[1]]) (out[m[1]].letters[parseInt(m[2], 10)] ||= new Set()).add(m[3])
  }
  return out
}

export default function PedPanel({ gender, baseParts, ped, replaced, onClose }) {
  const t = useT()
  const look = useStore((s) => s.pedLook[gender] || {})
  const setPedPart = useStore((s) => s.setPedPart)
  const resetPedLook = useStore((s) => s.resetPedLook)
  const pedTextures = useStore((s) => s.pedTextures[gender])
  const pedBusy = useStore((s) => s.pedBusy)
  const custom = isCustomPed(gender)
  const [index, setIndex] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (custom || !desktop) return
    let alive = true
    setError(null)
    desktop
      .gtaPedIndex(gender)
      .then((names) => alive && setIndex(names))
      .catch((e) => alive && setError(cleanError(e)))
    return () => {
      alive = false
    }
  }, [gender, custom])

  const options = custom ? optionsFromPed(ped, pedTextures) : index ? optionsFromIndex(index) : {}
  const comps = ORDER.filter((c) => baseParts.includes(c) || options[c]).concat(Object.keys(options).filter((c) => !ORDER.includes(c) && !c.startsWith('p_')))
  const sorted = (set) => [...(set || [])].sort((a, b) => (typeof a === 'number' ? a - b : a.localeCompare(b)))

  return (
    <div className="absolute left-0 top-8 z-10 w-80 rounded-md border border-ink-700 bg-ink-900 p-2 shadow-lg">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-ink-100">{t('Pedens utseende')}</span>
        <button className="text-xs text-ink-500 hover:text-ink-200" onClick={onClose}>
          ✕
        </button>
      </div>
      {!custom && desktop && !index && !error && <p className="px-1.5 py-1 text-[11px] text-ink-400">{t('Läser GTA V…')}</p>}
      {error && <p className="px-1.5 py-1 text-[11px] text-accent">{error}</p>}
      <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
        {comps.map((comp) => {
          const opt = options[comp]
          const base = baseParts.includes(comp)
          const ch = look[comp]
          const slots = sorted(opt?.slots)
          const value = ch ? String(ch.slot) : ''
          const letters = ch && ch.slot >= 0 ? sorted(opt?.letters[ch.slot]) : []
          return (
            <div key={comp} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-ink-850">
              <span className="min-w-0 flex-1 truncate text-xs text-ink-200">
                {partLabel(comp, t)}
                {replaced.includes(comp) && <span className="ml-1 text-[10px] text-ink-500">({t('ersatt')})</span>}
              </span>
              <select
                value={value}
                disabled={!!pedBusy}
                onChange={(e) => setPedPart(gender, comp, e.target.value === '' ? null : { slot: parseInt(e.target.value, 10), letter: 'a' })}
                className="h-6 w-24 rounded border border-ink-700 bg-ink-900 px-1 text-[11px] text-ink-100"
              >
                <option value="">{base ? t('Standard') : t('Ingen')}</option>
                {base && <option value="-1">{t('Dold')}</option>}
                {slots.map((n) => (
                  <option key={n} value={n}>
                    {t('Nr {n}', { n })}
                  </option>
                ))}
              </select>
              <select
                value={ch?.letter || 'a'}
                disabled={letters.length < 2 || !!pedBusy}
                onChange={(e) => setPedPart(gender, comp, { slot: ch.slot, letter: e.target.value })}
                className="h-6 w-14 rounded border border-ink-700 bg-ink-900 px-1 text-[11px] text-ink-100 disabled:opacity-40"
                title={t('Färg')}
              >
                {(letters.length ? letters : ['a']).map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 border-t border-ink-800 px-1.5 pt-1.5 text-[11px] leading-relaxed text-ink-500">
        {custom
          ? t('Välj vilken variant och färg av pedens delar som visas. Dubbelklicka på en del för att dölja den.')
          : t('Ansikten, frisyrer och kläder hämtas ur ditt GTA första gången du väljer dem. Dubbelklicka på en del för att dölja den.')}
      </p>
      <p className="px-1.5 pt-1 text-[11px] leading-relaxed text-ink-500">{t('Påverkar bara 3D-vyn – inte exporten.')}</p>
      {Object.keys(look).length > 0 && (
        <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => resetPedLook(gender)}>
          {t('Återställ peden')}
        </Button>
      )}
      {!desktop && !custom && <p className="px-1.5 pt-1 text-[11px] text-ink-500">{t('Fler ansikten och kläder finns i skrivbordsappen.')}</p>}
    </div>
  )
}
