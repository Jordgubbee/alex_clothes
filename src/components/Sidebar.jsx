import { useStore } from '../lib/store'
import { ALL_CATEGORIES, GROUPS } from '../lib/categories'
import { importFiles } from '../lib/importer'
import { filesFromDrop } from '../lib/files'
import { useT } from '../lib/i18n'
import { Button, FilePick, Icon } from './ui'

export const IMPORT_ACCEPT = '.ydd,.ytd,.yft,.dds,.png,.jpg,.jpeg,.webp,.obj,.fbx,.glb,.gltf'

export default function Sidebar() {
  const t = useT()
  const items = useStore((s) => s.items)
  const gender = useStore((s) => s.gender)
  const active = useStore((s) => s.activeCategory)
  const setActive = useStore((s) => s.setActiveCategory)
  const selectedId = useStore((s) => s.selectedItemId)
  const selectItem = useStore((s) => s.selectItem)
  const addItem = useStore((s) => s.addItem)
  const packs = useStore((s) => s.packs)
  const packFilter = useStore((s) => s.packFilter)
  const setPackFilter = useStore((s) => s.setPackFilter)
  const multi = useStore((s) => s.multi)
  const toggleMulti = useStore((s) => s.toggleMulti)
  const clearMulti = useStore((s) => s.clearMulti)
  const moveToPack = useStore((s) => s.moveToPack)
  const setPacksOpen = useStore((s) => s.setPacksOpen)
  const exportMode = useStore((s) => s.exportMode)

  const mine = items.filter((i) => i.gender === gender && (packFilter === 'all' || i.packId === packFilter))
  const inCat = mine.filter((i) => i.category === active).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id))
  const count = (key) => mine.filter((i) => i.category === key).length
  const packName = (id) => packs.find((p) => p.id === id)?.name || ''

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault()
        importFiles(await filesFromDrop(e.dataTransfer))
      }}
    >
      {exportMode === 'addon' && (
        <div className="flex items-center gap-1.5 border-b border-ink-800 p-2">
          <select
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-900 px-1.5 text-xs text-ink-100"
            title={t('Visa paket')}
          >
            <option value="all">{t('Alla paket')}</option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setPacksOpen(true)}>
            {t('Paket…')}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group} className="px-2 pt-3">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{t(group)}</div>
            {ALL_CATEGORIES.filter((c) => c.group === group).map((c) => (
              <button
                key={c.key}
                onClick={() => setActive(c.key)}
                className={`flex h-7 w-full items-center justify-between rounded-md px-2 text-[13px] ${active === c.key ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100'}`}
              >
                <span>{t(c.label)}</span>
                {count(c.key) > 0 && <span className="text-[11px] tabular-nums text-ink-400">{count(c.key)}</span>}
              </button>
            ))}
          </div>
        ))}

        <div className="mt-3 border-t border-ink-800 px-2 pt-3">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{t('Plagg i kategorin')}</span>
            <button title={t('Lägg till tomt plagg')} className="text-ink-400 hover:text-ink-100" onClick={() => addItem({ category: active })}>
              <Icon name="plus" />
            </button>
          </div>
          {inCat.length === 0 && <p className="px-2 py-2 text-xs text-ink-500">{t('Inga plagg än. Dra in filer eller mappar hit.')}</p>}
          {inCat.map((i) => {
            const marked = multi.includes(i.id)
            return (
              <button
                key={i.id}
                onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey ? toggleMulti(i.id, e.shiftKey) : (clearMulti(), selectItem(i.id)))}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${marked ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : selectedId === i.id ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
              >
                <Thumb item={i} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink-100">{i.name}</span>
                  <span className="block truncate text-[11px] text-ink-400">
                    {exportMode === 'addon' && packFilter === 'all' ? `${packName(i.packId)} · ` : ''}
                    {i.textures.length} {i.textures.length === 1 ? t('textur') : t('texturer')}
                    {!i.ydd && <span className="text-accent"> · {t('saknar .ydd')}</span>}
                    {(i.materials?.length || 0) > 1 && <span className="text-accent"> · {t('{n} texturer i modellen', { n: i.materials.length })}</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {multi.length > 0 ? (
        <div className="border-t border-ink-800 bg-ink-850 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-200">
            <span>{t('{n} markerade', { n: multi.length })}</span>
            <button className="text-ink-400 hover:text-ink-100" onClick={clearMulti}>
              {t('Avmarkera')}
            </button>
          </div>
          <select
            value=""
            onChange={(e) => e.target.value && moveToPack(multi, e.target.value)}
            className="h-8 w-full rounded-md border border-ink-700 bg-ink-900 px-2 text-[13px] text-ink-100"
          >
            <option value="">{t('Flytta till paket…')}</option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="border-t border-ink-800 p-3">
          <div className="grid grid-cols-2 gap-1.5">
            <FilePick multiple accept={IMPORT_ACCEPT} onFiles={(f) => importFiles(f)}>
              {t('Filer…')}
            </FilePick>
            <FilePick folder onFiles={(f) => importFiles(f)}>
              {t('Mapp…')}
            </FilePick>
          </div>
          <Button variant="ghost" className="mt-1.5 w-full" onClick={() => addItem({ category: active })}>
            <Icon name="plus" /> {t('Tomt plagg')}
          </Button>
        </div>
      )}
    </aside>
  )
}

// Miniatyr – grå ruta tills texturen har laddats (den laddas när man klickar på plagget).
export function Thumb({ tex, item }) {
  const x = tex || item?.textures[0]
  return (
    <span className="checker block h-9 w-9 shrink-0 overflow-hidden rounded border border-ink-700">
      {x?.canvas && <img alt="" src={thumbOf(x)} className="h-full w-full object-cover" />}
    </span>
  )
}

const thumbCache = new WeakMap()
export function thumbOf(tex) {
  const hit = thumbCache.get(tex.canvas)
  if (hit && hit.v === tex.version) return hit.url
  const c = document.createElement('canvas')
  c.width = c.height = 64
  c.getContext('2d').drawImage(tex.canvas, 0, 0, 64, 64)
  const url = c.toDataURL()
  thumbCache.set(tex.canvas, { v: tex.version, url })
  return url
}
