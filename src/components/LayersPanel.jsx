import { useMemo, useRef, useState } from 'react'
import { availableFonts, BLENDS, cornerColor, layerThumb, loadFontFile, removeBackground, trimTransparent } from '../lib/layers'
import { fileToCanvases } from '../lib/images'
import { useStore } from '../lib/store'
import { useT } from '../lib/i18n'
import { Button, FilePick, Icon, Slider } from './ui'
import { ColorInput } from './TextureEditor'

// Typsnitt som användaren laddat in under sessionen.
const customFonts = []

export default function LayersPanel({ tex, layers, selected, onSelect, onChange, onLive, onBeforeLive, onAddText, onAddImage, onFlatten }) {
  const t = useT()
  const notify = useStore((s) => s.notify)
  const [, setFontsVersion] = useState(0)
  const fonts = useMemo(() => availableFonts(customFonts), [customFonts.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = useRef(null)

  // Första ändringen i en följd av slider-drag sparas i historiken, resten är "live".
  const begin = () => {
    if (live.current !== selected?.id) {
      onBeforeLive()
      live.current = selected?.id
    }
  }
  const end = () => (live.current = null)
  const set = (patch) => selected && onLive(selected.id, patch)
  const index = selected ? layers.findIndex((L) => L.id === selected.id) : -1
  const move = (dir) => {
    const arr = [...layers]
    const to = index + dir
    if (to < 0 || to >= arr.length) return
    ;[arr[index], arr[to]] = [arr[to], arr[index]]
    onChange(arr, selected.id)
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-ink-800 bg-ink-900" onPointerUp={end}>
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
        <span className="text-xs font-semibold text-ink-200">{t('Lager')}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" title={t('Ny text')} onClick={onAddText}>
            <Icon name="text" /> {t('Text')}
          </Button>
          <FilePick
            size="sm"
            variant="ghost"
            accept=".png,.jpg,.jpeg,.webp,.dds"
            multiple
            onFiles={async (files) => {
              for (const f of files) {
                try {
                  const [{ canvas }] = await fileToCanvases(f)
                  onAddImage(canvas, f.name.replace(/\.[^.]+$/, ''))
                } catch (e) {
                  notify(e.message, 'error')
                }
              }
            }}
          >
            <Icon name="image" /> {t('Logga')}
          </FilePick>
        </div>
      </div>

      <div className="max-h-[38%] min-h-[96px] overflow-y-auto border-b border-ink-800 p-1.5">
        {[...layers].reverse().map((L) => (
          <div
            key={L.id}
            onClick={() => onSelect(L.id)}
            className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 ${selected?.id === L.id ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
          >
            <button
              title={L.visible ? t('Dölj') : t('Visa')}
              className="text-ink-400 hover:text-ink-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange(layers.map((x) => (x.id === L.id ? { ...x, visible: !x.visible } : x)), selected?.id ?? null)
              }}
            >
              <Icon name={L.visible ? 'eye' : 'eyeoff'} className="!h-3.5 !w-3.5" />
            </button>
            <img alt="" src={layerThumb(L)} className="checker h-8 w-8 shrink-0 rounded border border-ink-700" />
            <span className={`min-w-0 flex-1 truncate text-xs ${L.visible ? 'text-ink-100' : 'text-ink-500'}`}>{L.name}</span>
            <span className="text-[10px] uppercase text-ink-500">{L.type === 'text' ? 'T' : 'IMG'}</span>
          </div>
        ))}
        <div
          onClick={() => onSelect(null)}
          className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 ${!selected ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
        >
          <span className="w-3.5" />
          <img alt="" src={baseThumb(tex)} className="checker h-8 w-8 shrink-0 rounded border border-ink-700" />
          <span className="min-w-0 flex-1 truncate text-xs text-ink-300">{t('Plagget (bakgrund)')}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!selected ? (
          <div className="space-y-2 text-[11px] leading-relaxed text-ink-500">
            <p>{t('Lägg till text eller en logga med knapparna ovan, dra in en PNG på texturen eller klistra in med Ctrl+V.')}</p>
            <p>{t('Penseln, klonstämpeln och Ta bort logga ändrar plagget under lagren.')}</p>
            {layers.length > 0 && (
              <Button size="sm" className="w-full" onClick={() => onFlatten(null)}>
                <Icon name="merge" /> {t('Bränn in alla lager')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3" onPointerDownCapture={begin}>
            <input
              value={selected.name}
              onFocus={begin}
              onChange={(e) => set({ name: e.target.value })}
              className="h-7 w-full rounded-md border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 outline-none focus:border-ink-500"
            />

            {selected.type === 'text' && (
              <>
                <textarea
                  value={selected.text}
                  onFocus={begin}
                  onChange={(e) => set({ text: e.target.value, name: e.target.value.split('\n')[0] || 'Text' })}
                  rows={2}
                  className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-[13px] text-ink-100 outline-none focus:border-ink-500"
                />
                <div className="flex gap-1">
                  <select
                    value={selected.font}
                    onChange={(e) => set({ font: e.target.value })}
                    className="h-7 min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-1.5 text-xs text-ink-100"
                    style={{ fontFamily: `"${selected.font}"` }}
                  >
                    {fonts.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <FilePick
                    size="sm"
                    variant="ghost"
                    accept=".ttf,.otf,.woff,.woff2"
                    onFiles={async ([f]) => {
                      try {
                        const name = await loadFontFile(f)
                        if (!customFonts.includes(name)) customFonts.push(name)
                        setFontsVersion((n) => n + 1)
                        begin()
                        set({ font: name })
                      } catch {
                        notify(t('Kunde inte läsa typsnittet.'), 'error')
                      }
                    }}
                  >
                    +
                  </FilePick>
                </div>
                <div className="flex items-center gap-1.5">
                  <ColorInput value={selected.color} onChange={(color) => set({ color })} />
                  <div className="flex-1" />
                  <Toggle on={selected.bold} onClick={() => set({ bold: !selected.bold })} title={t('Fet')}>
                    <b>B</b>
                  </Toggle>
                  <Toggle on={selected.italic} onClick={() => set({ italic: !selected.italic })} title={t('Kursiv')}>
                    <i>I</i>
                  </Toggle>
                </div>
                <Slider label={t('Textstorlek')} value={selected.size} min={8} max={600} onChange={(size) => set({ size })} />
                <Slider label={t('Bokstavsavstånd')} value={selected.spacing} min={-20} max={120} onChange={(spacing) => set({ spacing })} />
                <Slider label={t('Böj text')} value={selected.curve} min={-300} max={300} onChange={(curve) => set({ curve })} format={(v) => `${v}°`} />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Slider label={t('Kontur')} value={selected.stroke} min={0} max={40} onChange={(stroke) => set({ stroke })} format={(v) => `${v}px`} />
                  </div>
                  <input
                    type="color"
                    value={selected.strokeColor}
                    onChange={(e) => set({ strokeColor: e.target.value })}
                    className="h-7 w-7 cursor-pointer rounded border border-ink-700 bg-transparent"
                    title={t('Konturfärg')}
                  />
                </div>
              </>
            )}

            {selected.type === 'image' && <ImageTools layer={selected} set={set} begin={begin} />}

            <div className="space-y-2.5 border-t border-ink-800 pt-3">
              <Slider label={t('Storlek')} value={selected.scale} min={0.02} max={6} step={0.01} onChange={(scale) => set({ scale })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label={t('Rotation')} value={selected.rot} min={-180} max={180} onChange={(rot) => set({ rot })} format={(v) => `${Math.round(v)}°`} />
              <Slider label={t('Täckning')} value={selected.opacity} min={0} max={1} step={0.01} onChange={(opacity) => set({ opacity })} format={(v) => `${Math.round(v * 100)}%`} />
              <div>
                <div className="mb-1 text-[11px] text-ink-400">{t('Blandning')}</div>
                <select
                  value={selected.blend}
                  onChange={(e) => set({ blend: e.target.value })}
                  className="h-7 w-full rounded-md border border-ink-700 bg-ink-950 px-1.5 text-xs text-ink-100"
                >
                  {BLENDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {t(b.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <Button size="sm" onClick={() => set({ x: tex.canvas.width / 2 })}>
                  {t('Centrera')}
                </Button>
                <Button size="sm" onClick={() => set({ flipX: !selected.flipX })}>
                  ↔ {t('Spegla')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 border-t border-ink-800 pt-3">
              <Button size="sm" onClick={() => move(1)} disabled={index >= layers.length - 1}>
                <Icon name="up" /> {t('Upp')}
              </Button>
              <Button size="sm" onClick={() => move(-1)} disabled={index <= 0}>
                <Icon name="down" /> {t('Ner')}
              </Button>
              <Button
                size="sm"
                title="Ctrl+D"
                onClick={() => {
                  const copy = { ...selected, id: `${selected.id}c${Date.now() % 100000}`, x: selected.x + 20, y: selected.y + 20 }
                  onChange([...layers, copy], copy.id)
                }}
              >
                <Icon name="clone" /> {t('Duplicera')}
              </Button>
              <Button size="sm" title="Ctrl+E" onClick={() => onFlatten(selected.id)}>
                <Icon name="merge" /> {t('Bränn in')}
              </Button>
              <Button size="sm" variant="danger" className="col-span-2" title="Delete" onClick={() => onChange(layers.filter((L) => L.id !== selected.id), null)}>
                <Icon name="trash" /> {t('Ta bort lager')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function ImageTools({ layer, set, begin }) {
  const t = useT()
  const notify = useStore((s) => s.notify)
  const [bg, setBg] = useState(() => cornerColor(layer.img))
  const [tol, setTol] = useState(40)
  return (
    <div className="space-y-2.5">
      <FilePick
        size="sm"
        className="w-full"
        accept=".png,.jpg,.jpeg,.webp,.dds"
        onFiles={async ([f]) => {
          try {
            const [{ canvas }] = await fileToCanvases(f)
            begin()
            set({ img: trimTransparent(canvas), name: f.name.replace(/\.[^.]+$/, '') })
          } catch (e) {
            notify(e.message, 'error')
          }
        }}
      >
        {t('Byt bild')}
      </FilePick>
      <div className="rounded-md border border-ink-800 p-2">
        <div className="mb-1.5 text-[11px] font-medium text-ink-300">{t('Ta bort bakgrund')}</div>
        <div className="flex items-center gap-2">
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-ink-700 bg-transparent" title={t('Färgen som ska bort')} />
          <div className="flex-1">
            <Slider label={t('Tolerans')} value={tol} min={1} max={160} onChange={setTol} />
          </div>
        </div>
        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            begin()
            set({ img: trimTransparent(removeBackground(layer.img, bg, tol)) })
          }}
        >
          {t('Ta bort färgen')}
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" checked={!!layer.tint} onChange={(e) => set({ tint: e.target.checked ? '#ffffff' : null })} />
        <span className="flex-1">{t('Färga om loggan')}</span>
        {layer.tint && <input type="color" value={layer.tint} onChange={(e) => set({ tint: e.target.value })} className="h-7 w-7 cursor-pointer rounded border border-ink-700 bg-transparent" />}
      </div>
    </div>
  )
}

function Toggle({ on, onClick, title, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs ${on ? 'border-ink-500 bg-ink-700 text-ink-100' : 'border-ink-700 text-ink-400 hover:text-ink-100'}`}
    >
      {children}
    </button>
  )
}

const baseCache = new WeakMap()
function baseThumb(tex) {
  const src = tex.base || tex.canvas
  const hit = baseCache.get(src)
  if (hit && hit.v === tex.version) return hit.url
  const c = document.createElement('canvas')
  c.width = c.height = 40
  c.getContext('2d').drawImage(src, 0, 0, 40, 40)
  const url = c.toDataURL()
  baseCache.set(src, { v: tex.version, url })
  return url
}
