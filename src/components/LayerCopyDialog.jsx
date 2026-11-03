import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { copyLayers } from '../lib/transfer'
import { categoryByKey, PEDS, variantLetter } from '../lib/categories'
import { useT } from '../lib/i18n'
import { Button, Segmented } from './ui'
import { Thumb } from './Sidebar'

// Välj vilka texturer loggan eller texten ska till.
export default function LayerCopyDialog({ sourceTex, layer, onClose }) {
  const t = useT()
  const items = useStore((s) => s.items)
  const notify = useStore((s) => s.notify)
  const [picked, setPicked] = useState(() => new Set())
  const [mode, setMode] = useState('copy')
  const [onlySame, setOnlySame] = useState(true)
  const [busy, setBusy] = useState(null)

  const sw = sourceTex.canvas.width
  const sh = sourceTex.canvas.height
  const size = (x) => [x.canvas?.width || x.width, x.canvas?.height || x.height]
  const same = (x) => {
    const [w, h] = size(x)
    return w === sw && h === sh
  }
  const owner = items.find((i) => i.textures.some((x) => x.id === sourceTex.id))

  // Plagget med källtexturen först, sedan resten.
  const groups = useMemo(() => {
    const list = items.map((item) => ({ item, textures: item.textures.filter((x) => x.id !== sourceTex.id && (!onlySame || same(x))) })).filter((g) => g.textures.length)
    return list.sort((a, b) => (a.item.id === owner?.id ? -1 : b.item.id === owner?.id ? 1 : 0))
  }, [items, onlySame]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const pickVariants = () => setPicked(new Set(owner.textures.filter((x) => x.id !== sourceTex.id && same(x)).map((x) => x.id)))
  const pickAllSame = () => setPicked(new Set(groups.flatMap((g) => g.textures.filter(same).map((x) => x.id))))

  const run = async () => {
    setBusy(t('Förbereder…'))
    try {
      const n = await copyLayers(sourceTex.id, [layer.id], [...picked], {
        move: mode === 'move',
        onProgress: (a, b) => setBusy(t('Lägger till {a} av {b}…', { a, b })),
      })
      notify(mode === 'move' ? t('"{n}" flyttades till {c} texturer.', { n: layer.name, c: n }) : t('"{n}" kopierades till {c} texturer.', { n: layer.name, c: n }))
      onClose()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-100">{t('Lägg "{n}" på andra texturer', { n: layer.name })}</h2>
          <p className="mt-0.5 text-xs text-ink-400">{t('Loggan hamnar på exakt samma plats och i samma storlek. Har texturen en annan storlek skalas den i samma proportion.')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-5 py-3">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'copy', label: t('Kopiera') }, { value: 'move', label: t('Flytta') }]} />
          <Button size="sm" onClick={pickVariants}>
            {t('Alla färgvarianter i plagget')}
          </Button>
          <Button size="sm" onClick={pickAllSame}>
            {t('Alla med samma storlek')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            {t('Avmarkera')}
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-300">
            <input type="checkbox" checked={onlySame} onChange={(e) => setOnlySame(e.target.checked)} />
            {t('Bara samma storlek ({w}×{h})', { w: sw, h: sh })}
          </label>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {groups.length === 0 && <p className="text-xs text-ink-500">{t('Inga andra texturer med samma storlek i projektet.')}</p>}
          {groups.map(({ item, textures }) => (
            <div key={item.id}>
              <div className="mb-1.5 text-[11px] text-ink-400">
                {item.id === owner?.id && <span className="text-accent">{t('Samma plagg')} · </span>}
                {item.name} · {t(categoryByKey(item.category).label)} · {t(PEDS[item.gender]?.label || item.gender)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {textures.map((x) => {
                  const on = picked.has(x.id)
                  const [w, h] = size(x)
                  return (
                    <button
                      key={x.id}
                      onClick={() => toggle(x.id)}
                      title={`${x.name} · ${w}×${h}`}
                      className={`relative rounded-md p-0.5 ${on ? 'bg-accent' : 'bg-ink-800 hover:bg-ink-700'}`}
                    >
                      <Thumb tex={x} />
                      <span className="absolute bottom-0.5 left-0.5 rounded-sm bg-black/70 px-1 font-mono text-[10px] text-white">{variantLetter(item.textures.indexOf(x))}</span>
                      {!same(x) && <span className="absolute right-0.5 top-0.5 rounded-sm bg-accent px-1 text-[9px] font-bold text-ink-950">≠</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-800 px-5 py-3">
          <span className="text-xs text-ink-400">{busy || t('{n} texturer valda', { n: picked.size })}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>
              {t('Avbryt')}
            </Button>
            <Button variant="primary" onClick={run} disabled={!!busy || picked.size === 0}>
              {mode === 'move' ? t('Flytta dit') : t('Kopiera dit')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
