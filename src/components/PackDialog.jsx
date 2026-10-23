import { useStore, packDlc } from '../lib/store'
import { DLC_TEMPLATES, PEDS, slugify } from '../lib/categories'
import { useT } from '../lib/i18n'
import { Button, Icon, Input } from './ui'

// Hantera klädpaket: namn, namnmall och exakt paketnamn (dlcName) per kön.
export default function PackDialog() {
  const t = useT()
  const packs = useStore((s) => s.packs)
  const items = useStore((s) => s.items)
  const addPack = useStore((s) => s.addPack)
  const updatePack = useStore((s) => s.updatePack)
  const removePack = useStore((s) => s.removePack)
  const setOpen = useStore((s) => s.setPacksOpen)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-ink-700 bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-100">{t('Klädpaket')}</h2>
            <p className="mt-0.5 text-xs text-ink-400">{t('Dela upp kläderna i egna paket, t.ex. polis och ambulans. Varje paket får egna filer för kille och tjej.')}</p>
          </div>
          <Button size="sm" onClick={() => addPack({ name: `paket_${packs.length + 1}` })}>
            <Icon name="plus" /> {t('Nytt paket')}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {packs.map((p) => {
            const count = (g) => items.filter((i) => i.packId === p.id && i.gender === g).length
            return (
              <div key={p.id} className="rounded-md border border-ink-800 bg-ink-950 p-3">
                <div className="flex items-center gap-2">
                  <Input value={p.name} onChange={(e) => updatePack(p.id, { name: slugify(e.target.value) || e.target.value.toLowerCase() })} className="!w-48 font-medium" />
                  <select
                    value={p.template}
                    onChange={(e) => updatePack(p.id, { template: e.target.value, overrides: { male: '', female: '' } })}
                    className="h-8 rounded-md border border-ink-700 bg-ink-900 px-2 font-mono text-xs text-ink-100"
                    title={t('Namnmall')}
                  >
                    {DLC_TEMPLATES.map((tpl) => (
                      <option key={tpl} value={tpl}>
                        {tpl.replace('{name}', p.name || 'namn')}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={packs.length <= 1}
                    title={t('Ta bort paketet (plaggen flyttas till första paketet)')}
                    onClick={() => confirm(t('Ta bort paketet "{n}"?', { n: p.name })) && removePack(p.id)}
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {['male', 'female'].map((g) => (
                    <div key={g}>
                      <div className="mb-1 flex justify-between text-[11px] text-ink-400">
                        <span>
                          {t(PEDS[g].label)} · {count(g)} {t('plagg')}
                        </span>
                        {p.overrides?.[g] && (
                          <button className="text-ink-500 hover:text-ink-200" onClick={() => updatePack(p.id, { overrides: { ...p.overrides, [g]: '' } })}>
                            {t('Återställ')}
                          </button>
                        )}
                      </div>
                      <Input
                        value={packDlc(p, g)}
                        onChange={(e) => updatePack(p.id, { overrides: { ...p.overrides, [g]: e.target.value } })}
                        className="font-mono !text-xs"
                      />
                      <div className="mt-1 truncate font-mono text-[10.5px] text-ink-500" title={`${PEDS[g].model}_${packDlc(p, g)}^jbib_000_u.ydd`}>
                        {PEDS[g].model}_{packDlc(p, g)}^jbib_000_u.ydd
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="text-[11px] leading-relaxed text-ink-500">
            {t('Tips: markera flera plagg i listan med Ctrl+klick eller Skift+klick och flytta dem till ett annat paket med knappen som visas längst ner.')}
          </p>
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
