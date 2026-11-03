import { useEffect, useState } from 'react'
import { useStore, useSelectedItem, packDlc } from '../lib/store'
import { ALL_CATEGORIES, streamNames, addonNames, variantLetter } from '../lib/categories'
import { importFiles } from '../lib/importer'
import { emit } from '../lib/bus'
import { Button, Field, FilePick, Icon, Input, Select, Section, Slider } from './ui'
import { Thumb } from './Sidebar'
import { desktop, payload, previewFromYdd, cleanError, embeddedTextures, mergeItemTextures, texKey, atlasLayout, drawAtlas } from '../lib/desktop'
import { cloneCanvas, canvasFrom, fileToCanvases } from '../lib/images'
import { useT } from '../lib/i18n'
import { fitOf, isIdentity, IDENTITY_FIT, fitForBlender, pivots } from '../lib/fit'

const blankCanvas = (n) => {
  const c = canvasFrom(n, n)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, n, n)
  return c
}

export default function Inspector() {
  const t = useT()
  const item = useSelectedItem()
  const selectedTextureId = useStore((s) => s.selectedTextureId)
  const selectTexture = useStore((s) => s.selectTexture)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const removeTexture = useStore((s) => s.removeTexture)
  const moveTexture = useStore((s) => s.moveTexture)
  const insertTexture = useStore((s) => s.insertTexture)
  const blender = useStore((s) => s.blender)
  const notify = useStore((s) => s.notify)
  const packs = useStore((s) => s.packs)
  const exportMode = useStore((s) => s.exportMode)
  const items = useStore((s) => s.items)

  if (!item) return <aside className="w-72 shrink-0 border-l border-ink-800 bg-ink-900"><Guide /></aside>

  const set = (patch) => updateItem(item.id, patch)
  const pack = packs.find((p) => p.id === item.packId) || packs[0]
  const cat = ALL_CATEGORIES.find((c) => c.key === item.category)
  // Slutligt nummer i addon-paketet: plaggets plats bland samma kategori i samma paket och kön.
  const siblings = items.filter((i) => i.packId === item.packId && i.gender === item.gender && i.category === item.category).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id))
  const index = siblings.findIndex((i) => i.id === item.id)
  const finalName =
    exportMode === 'addon'
      ? addonNames({ gender: item.gender, dlc: packDlc(pack, item.gender), category: item.category, index, skin: !cat.prop && item.skin }).model
      : streamNames({ gender: item.gender, category: item.category, slot: item.slot, skin: item.skin }).model

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900">
      <Section title={t('Plagg')}>
        <div className="space-y-3">
          <Field label={t('Namn')}>
            <Input value={item.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {exportMode === 'addon' && (
            <Field label={t('Paket')}>
              <Select value={item.packId} onChange={(e) => set({ packId: e.target.value })}>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Field label={t('Kategori')}>
              <Select value={item.category} onChange={(e) => set({ category: e.target.value })}>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {t(c.label)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={exportMode === 'addon' ? t('Ordning') : t('Nummer')}>
              <Input type="number" min={0} max={999} value={item.slot} onChange={(e) => set({ slot: Math.max(0, Math.min(999, parseInt(e.target.value || '0', 10))) })} />
            </Field>
          </div>
          {!cat.prop && (
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input type="checkbox" checked={item.skin} onChange={(e) => set({ skin: e.target.checked })} />
              {t('Plagget visar hud (_r / _whi)')}
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-ink-300">
            <input type="checkbox" checked={!item.hidden} onChange={(e) => set({ hidden: !e.target.checked })} />
            {t('Visa i 3D')}
          </label>
          <div className="rounded bg-ink-950 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-ink-500">{t('Filnamn i FiveM')}</div>
            <p className="break-all font-mono text-[10.5px] leading-relaxed text-ink-300">{finalName}</p>
          </div>
        </div>
      </Section>

      <Section id="files" collapsible defaultOpen={false} title={t('Filer')}>
        <FileRow label={t('Spelmodell (.ydd)')} file={item.ydd} accept=".ydd" onFiles={(f) => importFiles(f, item.id)} onClear={() => set({ ydd: null })} />
        <FileRow label={t('3D-förhandsvisning')} file={item.preview} accept=".obj,.fbx,.glb,.gltf" onFiles={(f) => importFiles(f, item.id)} onClear={() => set({ preview: null })} />
      </Section>

      {desktop && (item.materials?.length || 0) > 1 && blender?.ok && <MergePanel item={item} />}

      {desktop && (
        <Section id="blender" collapsible defaultOpen={false} title="Blender + Sollumz">
          {!blender?.ok ? (
            <p className="text-xs text-accent">{t('Blender med Sollumz hittades inte. Öppna Inställningar.')}</p>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" disabled={!item.ydd || item.converting} onClick={() => previewFromYdd(item.id)}>
                {item.converting ? t('Sollumz arbetar…') : t('Bygg om 3D från .ydd')}
              </Button>
              <Button
                className="w-full"
                disabled={!item.ydd}
                onClick={async () => {
                  try {
                    await desktop.editInBlender(item.id, [await payload(item.ydd)], item.gender)
                    notify(t('Blender öppnas. Fixa plagget och klicka "Skicka till alex_clothes" i sidopanelen (N).'))
                  } catch (e) {
                    notify(cleanError(e), 'error')
                  }
                }}
              >
                {t('Öppna i Blender')}
              </Button>
              <p className="text-[11px] leading-relaxed text-ink-500">{t('Plagget öppnas med freemode-skelettet, så viktningen bevaras. Rätta klippning och skicka tillbaka – den nya .ydd:n kommer hit automatiskt.')}</p>
            </div>
          )}
        </Section>
      )}

      <Section
        id="variants"
        collapsible
        title={`${t('Färgvarianter')} (${item.textures.length})`}
        action={
          <FilePick size="sm" variant="ghost" multiple accept=".ytd,.dds,.png,.jpg,.jpeg,.webp" onFiles={(f) => importFiles(f, item.id)}>
            <Icon name="plus" /> {t('Lägg till')}
          </FilePick>
        }
      >
        {item.textures.length === 0 && <p className="text-xs text-ink-500">{t('Varje textur blir en färgvariant (a, b, c…) i spelet.')}</p>}
        <div className="mb-2 flex gap-1">
          {[512, 1024, 2048].map((n) => (
            <Button key={n} size="sm" variant="ghost" title={t('Ny tom textur {n}×{n}', { n })} onClick={() => insertTexture(item.id, null, { name: `ny_${n}`, canvas: blankCanvas(n) })}>
              + {n}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          {item.textures.map((tex, i) => (
            <div
              key={tex.id}
              onClick={() => selectTexture(tex.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-md p-1.5 ${selectedTextureId === tex.id ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
            >
              <span className="w-4 text-center font-mono text-xs text-ink-400">{variantLetter(i)}</span>
              <Thumb tex={tex} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink-100">{tex.name}</span>
                <span className="block text-[11px] text-ink-500">
                  {tex.width || tex.canvas?.width}×{tex.height || tex.canvas?.height}
                  {tex.edited && <span className="text-accent"> · {t('ändrad')}</span>}
                </span>
              </span>
              <span className="hidden gap-0.5 group-hover:flex">
                <IconBtn name="clone" title={t('Duplicera som ny färgvariant')} onClick={() => tex.canvas && insertTexture(item.id, tex.id, { name: `${tex.name}_kopia`, canvas: cloneCanvas(tex.canvas) })} />
                <IconBtn name="up" title={t('Flytta upp')} onClick={() => moveTexture(item.id, tex.id, -1)} />
                <IconBtn name="down" title={t('Flytta ner')} onClick={() => moveTexture(item.id, tex.id, 1)} />
                <IconBtn name="trash" title={t('Ta bort')} onClick={() => removeTexture(item.id, tex.id)} />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <FitPanel item={item} set={set} />

      <div className="p-4">
        <Button variant="danger" className="w-full" onClick={() => confirm(t('Ta bort "{n}"?', { n: item.name })) && removeItem(item.id)}>
          <Icon name="trash" /> {t('Ta bort plagg')}
        </Button>
      </div>
    </aside>
  )
}

// Plagg vars modell använder flera texturer (t.ex. hölster + taser + radio) slås ihop till en,
// eftersom GTA bara laddar en .ytd per färgvariant.
function MergePanel({ item }) {
  const t = useT()
  const notify = useStore((s) => s.notify)
  const [sources, setSources] = useState({})
  const [size, setSize] = useState(2048)
  const keys = item.materials
  const variantKeys = new Set(item.textures.map((x) => texKey(x.name)))
  const [primary, setPrimary] = useState(keys.find((k) => variantKeys.has(k)) || keys[0])

  useEffect(() => {
    let alive = true
    embeddedTextures(item.preview)
      .catch(() => ({}))
      .then((emb) => {
        if (!alive) return
        const next = {}
        for (const k of keys) next[k] = item.textures.find((x) => texKey(x.name) === k)?.canvas || emb[k] || null
        setSources((s) => ({ ...next, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v)) }))
      })
    return () => {
      alive = false
    }
  }, [item.preview, item.textures, keys.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const missing = keys.filter((k) => !sources[k] && !(k === primary && item.textures.length))
  const preview = (() => {
    const cells = atlasLayout(keys, 256)
    return drawAtlas(cells, { ...sources, [primary]: item.textures[0]?.canvas || sources[primary] }, 256).toDataURL()
  })()

  return (
    <Section title={t('Flera texturer i modellen')}>
      <p className="mb-3 text-[11px] leading-relaxed text-accent">
        {t('Modellen använder {n} texturer, men GTA laddar bara en per färgvariant – resten blir fel in game. Slå ihop dem till en.', { n: keys.length })}
      </p>
      <div className="space-y-1.5">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <input type="radio" name={`primary-${item.id}`} checked={primary === k} onChange={() => setPrimary(k)} title={t('Huvudtextur (dess färgvarianter behålls)')} />
            <span className="checker block h-8 w-8 shrink-0 overflow-hidden rounded border border-ink-700">
              {sources[k] && <img alt="" src={sources[k].toDataURL()} className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-200" title={k}>
              {k}
            </span>
            <FilePick
              size="sm"
              variant="ghost"
              accept=".ytd,.dds,.png,.jpg,.jpeg,.webp"
              onFiles={async ([f]) => {
                try {
                  const [first] = await fileToCanvases(f)
                  setSources((s) => ({ ...s, [k]: first.canvas }))
                } catch (e) {
                  notify(e.message, 'error')
                }
              }}
            >
              {sources[k] ? t('Byt') : t('Välj')}
            </FilePick>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <img alt="" src={preview} className="checker h-20 w-20 rounded border border-ink-700" />
        <div className="flex-1 space-y-2">
          <select value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))} className="h-7 w-full rounded-md border border-ink-700 bg-ink-900 px-1.5 text-xs text-ink-100">
            {[1024, 2048, 4096].map((n) => (
              <option key={n} value={n}>
                {t('Atlas')} {n}×{n}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={missing.length > 0 || item.converting}
            onClick={() => mergeItemTextures(item.id, { size, primary, sources })}
          >
            {item.converting ? t('Sollumz arbetar…') : t('Slå ihop till en textur')}
          </Button>
        </div>
      </div>
      {missing.length > 0 && <p className="mt-2 text-[11px] text-accent">{t('Välj en bild för: {k}', { k: missing.join(', ') })}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{t('Huvudtexturens färgvarianter behålls – varje variant får en egen sammanslagen textur. Normal- och spec-kartor slås ihop på samma sätt.')}</p>
    </Section>
  )
}

// Passform i 3D: exakta reglage för det som handtagen i 3D-vyn gör, plus "blås upp" mot klippning.
// "Spara i modellen" bakar in passformen i .ydd:n så att plagget sitter likadant i spelet.
function FitPanel({ item, set }) {
  const t = useT()
  const notify = useStore((s) => s.notify)
  const blender = useStore((s) => s.blender)
  const [busy, setBusy] = useState(false)
  const fit = fitOf(item)
  const change = (patch) => set({ fit: { ...fit, ...patch }, offset: [0, 0, 0], scale: 1 })
  const cm = (v) => `${(v * 100).toFixed(1)} cm`
  const pct = (v) => `${Math.round(v * 1000) / 10}%`

  const bake = async () => {
    const pivot = pivots.get(item.id)
    if (!pivot) return notify(t('Visa plagget i 3D först.'), 'error')
    setBusy(true)
    try {
      const [x, y, z] = pivot
      const res = await desktop.fitModel({ gender: item.gender, ydd: await payload(item.ydd), fit: fitForBlender(fit, { x, y, z }) })
      set({ ydd: new File([res.data], item.ydd.name), fit: { ...IDENTITY_FIT }, offset: [0, 0, 0], scale: 1 })
      await previewFromYdd(item.id)
      notify(t('Passformen är sparad i {f}. Plagget sitter likadant i spelet.', { f: item.ydd.name }))
    } catch (e) {
      notify(cleanError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="fit" collapsible defaultOpen={false} title={t('Passform i 3D')}>
      <div className="space-y-2.5">
        <p className="text-[11px] leading-relaxed text-ink-500">{t('Dra i handtagen i 3D-vyn (Flytta, Rotera, Skala) eller använd reglagen.')}</p>
        {['x', 'y', 'z'].map((k) => (
          <Slider key={k} label={`${t('Flytta')} ${k.toUpperCase()}`} value={fit[k]} min={-0.3} max={0.3} step={0.001} format={cm} onChange={(v) => change({ [k]: v })} />
        ))}
        <Slider label={t('Rotera')} value={fit.rotY} min={-45} max={45} step={0.5} format={(v) => `${v.toFixed(1)}°`} onChange={(v) => change({ rotY: v })} />
        <Slider label={t('Storlek')} value={fit.scale} min={0.7} max={1.3} step={0.002} format={pct} onChange={(v) => change({ scale: v })} />
        <Slider label={t('Bredd')} value={fit.sx} min={0.7} max={1.3} step={0.002} format={pct} onChange={(v) => change({ sx: v })} />
        <Slider label={t('Höjd')} value={fit.sy} min={0.7} max={1.3} step={0.002} format={pct} onChange={(v) => change({ sy: v })} />
        <Slider label={t('Djup')} value={fit.sz} min={0.7} max={1.3} step={0.002} format={pct} onChange={(v) => change({ sz: v })} />
        <Slider label={t('Blås upp (mot klippning)')} value={fit.inflate} min={-10} max={20} step={0.1} format={(v) => `${v.toFixed(1)} mm`} onChange={(v) => change({ inflate: v })} />
        <label className="flex items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            checked={!!item.flipUV}
            onChange={(e) => {
              set({ flipUV: e.target.checked })
              emit('uv', item.id)
            }}
          />
          {t('Vänd UV (om texturen hamnar upp och ner)')}
        </label>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" disabled={isIdentity(fit)} onClick={() => set({ fit: { ...IDENTITY_FIT }, offset: [0, 0, 0], scale: 1 })}>
            {t('Nollställ')}
          </Button>
          {desktop && blender?.ok && (
            <Button size="sm" variant="primary" className="flex-1" disabled={!item.ydd || isIdentity(fit) || busy || item.converting} onClick={bake}>
              {busy ? t('Sollumz arbetar…') : t('Spara i modellen (för spelet)')}
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-ink-500">
          {t('Passformen syns direkt i 3D. "Spara i modellen" bygger om .ydd:n med Sollumz så att plagget sitter likadant i FiveM – viktningen mot skelettet behålls.')}
        </p>
      </div>
    </Section>
  )
}

function FileRow({ label, file, accept, onFiles, onClear }) {
  const t = useT()
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-ink-400">{label}</div>
        <div className={`truncate text-xs ${file ? 'text-ink-100' : 'text-ink-500'}`}>{file?.name || t('Ingen fil')}</div>
      </div>
      {file && <IconBtn name="trash" title={t('Ta bort')} onClick={onClear} />}
      <FilePick size="sm" accept={accept} onFiles={onFiles}>
        {file ? t('Byt') : t('Välj')}
      </FilePick>
    </div>
  )
}

function IconBtn({ name, title, onClick }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
    >
      <Icon name={name} className="!h-3.5 !w-3.5" />
    </button>
  )
}

function Guide() {
  const t = useT()
  const steps = [
    [t('Hämta gubbarna'), t('Gubbarna hämtas automatiskt ur ditt GTA V första gången appen startar, med originalskelettet.')],
    [t('Dra in kläder'), t('Släpp .ydd/.ytd-filer eller hela mappar i listan till vänster. Kategori, kön och paket läses av filnamnen.')],
    [t('Dela upp i paket'), t('Skapa paket (t.ex. polis, ambulans) och ge dem egna namn för kille och tjej.')],
    [t('Redigera'), t('Ta bort loggor, måla, lägg till text, nya färgvarianter eller slå ihop texturer.')],
    [t('Exportera'), t('Exportera till FiveM, lägg mappen i resources/ och skriv ensure i server.cfg.')],
  ]
  return (
    <div className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-ink-100">{t('Kom igång')}</h2>
      <p className="mb-5 text-xs text-ink-400">{t('Fem steg från GTA till din server.')}</p>
      <ol className="space-y-4">
        {steps.map(([title, d], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-600 text-[11px] text-ink-300">{i + 1}</span>
            <span>
              <span className="block text-[13px] text-ink-100">{title}</span>
              <span className="block text-xs leading-relaxed text-ink-400">{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
