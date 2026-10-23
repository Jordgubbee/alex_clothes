import { create } from 'zustand'
import { applyTemplate, slugify } from './categories'
import { ensureBase, composite } from './layers'

let nextId = 1
const uid = (p) => `${p}${nextId++}`

const DEFAULT_PACK = { id: 'pk0', name: 'mina_klader', template: '{name}', overrides: { male: '', female: '' } }

// Paketnamnet (dlcName) för ett kön: egen överskrivning eller mallen.
export const packDlc = (pack, gender) => slugify(pack.overrides?.[gender] || '') || applyTemplate(pack.template, pack.name, gender)

export const useStore = create((set, get) => ({
  projectName: 'mina_klader',
  gender: 'male',
  items: [],
  basePed: { male: null, female: null },
  selectedItemId: null,
  selectedTextureId: null,
  activeCategory: 'jbib',
  view: 'split', // 'split' | '2d' | '3d'
  toast: null,
  lang: (() => { try { return localStorage.getItem('alex.lang') || 'sv' } catch { return 'sv' } })(),
  setLang: (lang) => { try { localStorage.setItem('alex.lang', lang) } catch {} ; set({ lang }) },
  packs: [DEFAULT_PACK],
  packFilter: 'all',
  exportMode: 'addon', // 'addon' = egna paket med .ymt, 'replace' = ersätter GTA:s plagg
  multi: [], // flera markerade plagg i listan
  packsOpen: false,

  setPacksOpen: (packsOpen) => set({ packsOpen }),
  setPackFilter: (packFilter) => set({ packFilter }),
  setExportMode: (exportMode) => set({ exportMode }),
  addPack: (partial = {}) => {
    const pack = { id: uid('pk'), name: 'nytt_paket', template: '{name}', overrides: { male: '', female: '' }, ...partial }
    set((s) => ({ packs: [...s.packs, pack] }))
    return pack
  },
  updatePack: (id, patch) => set((s) => ({ packs: s.packs.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePack: (id) =>
    set((s) => {
      if (s.packs.length <= 1) return {}
      const packs = s.packs.filter((p) => p.id !== id)
      return { packs, items: s.items.map((i) => (i.packId === id ? { ...i, packId: packs[0].id } : i)), packFilter: s.packFilter === id ? 'all' : s.packFilter }
    }),
  moveToPack: (ids, packId) => set((s) => ({ items: s.items.map((i) => (ids.includes(i.id) ? { ...i, packId } : i)), multi: [] })),
  // Hittar eller skapar ett paket utifrån dlcName i ett importerat filnamn.
  packForDlc: (dlc, gender) => {
    const s = get()
    const hit = s.packs.find((p) => packDlc(p, gender) === dlc)
    if (hit) return hit.id
    // ems_f_clothes och ems_m_clothes hamnar i samma paket "ems".
    const m = dlc.match(/^(.*?)_([mf])(_clothes)?$/)
    const name = m ? m[1] : dlc.replace(/_clothes$/, '')
    const template = m ? (m[3] ? '{name}_{g}_clothes' : '{name}_{g}') : dlc.endsWith('_clothes') ? '{name}_clothes' : '{name}'
    const same = s.packs.find((p) => p.name === name && p.template === template)
    if (same) return same.id
    const fresh = s.packs.length === 1 && !s.items.length ? s.packs[0] : null
    if (fresh) {
      get().updatePack(fresh.id, { name, template })
      return fresh.id
    }
    return get().addPack({ name, template }).id
  },
  toggleMulti: (id, range) =>
    set((s) => {
      if (range && s.selectedItemId) return { multi: [...new Set([...s.multi, s.selectedItemId, id])] }
      return { multi: s.multi.includes(id) ? s.multi.filter((x) => x !== id) : [...s.multi, id] }
    }),
  clearMulti: () => set({ multi: [] }),

  setProjectName: (projectName) => set({ projectName: projectName.replace(/[^a-z0-9_]/gi, '_').toLowerCase() }),
  setGender: (gender) => set({ gender }),
  setView: (view) => set({ view }),
  setActiveCategory: (activeCategory) => set({ activeCategory }),
  setBasePed: (gender, file) => set((s) => ({ basePed: { ...s.basePed, [gender]: file } })),
  pedTextures: { male: [], female: [] },
  setPedTextures: (gender, list) => set((s) => ({ pedTextures: { ...s.pedTextures, [gender]: list } })),
  pedBusy: false,
  setPedBusy: (pedBusy) => set({ pedBusy }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  blender: null, // { ok, mode, blender, error }
  setBlender: (blender) => set({ blender }),
  notify: (text, kind = 'info') => {
    const id = Date.now()
    set({ toast: { id, text, kind } })
    setTimeout(() => get().toast?.id === id && set({ toast: null }), 4000)
  },

  addItem: (partial = {}) => {
    const s = get()
    const category = partial.category || s.activeCategory
    const gender = partial.gender || s.gender
    const packId = partial.packId || (s.packFilter !== 'all' ? s.packFilter : s.packs[0].id)
    const used = s.items.filter((i) => i.category === category && i.gender === gender && i.packId === packId).map((i) => i.slot)
    let slot = partial.slot ?? 0
    while (partial.slot == null && used.includes(slot)) slot++
    const item = {
      id: uid('i'),
      name: partial.name || 'nytt_plagg',
      gender,
      packId,
      category,
      slot,
      skin: partial.skin || false,
      ydd: null,
      preview: null,
      textures: [],
      offset: [0, 0, 0],
      scale: 1,
      ...partial,
    }
    delete item.quiet
    // quiet: vid import av många filer väljs inget plagg – man klickar själv på det man vill se.
    if (partial.quiet) set({ items: [...s.items, item] })
    else set({ items: [...s.items, item], outfit: { ...s.outfit, [`${gender}:${category}`]: item.id }, selectedItemId: item.id, selectedTextureId: item.textures[0]?.id || null, activeCategory: category })
    return item
  },

  updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      multi: s.multi.filter((x) => x !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      selectedTextureId: s.selectedItemId === id ? null : s.selectedTextureId,
    })),

  // outfit: vilket plagg som visas på gubben per kön och kategori.
  outfit: {},
  selectItem: (id) => {
    const item = get().items.find((i) => i.id === id)
    set((s) => ({ selectedItemId: id, selectedTextureId: item?.textures[0]?.id || null, outfit: item ? { ...s.outfit, [`${item.gender}:${item.category}`]: id } : s.outfit }))
  },
  selectTexture: (selectedTextureId) => set({ selectedTextureId, selectedLayerId: null }),

  addTextures: (itemId, list) => {
    // canvas kan vara null: då finns pending { file, index } och pixlarna avkodas när plagget öppnas.
    const created = list.map((t) => ({ id: uid('t'), name: t.name, canvas: t.canvas || null, pending: t.pending || null, width: t.width, height: t.height, original: t.original || null, edited: false, version: 0 }))
    set((s) => ({
      items: s.items.map((i) => (i.id === itemId ? { ...i, textures: [...i.textures, ...created] } : i)),
      selectedTextureId: s.selectedItemId === itemId && !s.selectedTextureId ? created[0]?.id || null : s.selectedTextureId,
    }))
  },

  removeTexture: (itemId, texId) =>
    set((s) => {
      const items = s.items.map((i) => (i.id === itemId ? { ...i, textures: i.textures.filter((t) => t.id !== texId) } : i))
      const item = items.find((i) => i.id === itemId)
      return { items, selectedTextureId: s.selectedTextureId === texId ? item?.textures[0]?.id || null : s.selectedTextureId }
    }),

  moveTexture: (itemId, texId, dir) =>
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== itemId) return i
        const arr = [...i.textures]
        const idx = arr.findIndex((t) => t.id === texId)
        const to = idx + dir
        if (to < 0 || to >= arr.length) return i
        ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
        return { ...i, textures: arr }
      }),
    })),

  // Lägger till en kopia direkt efter originalet, t.ex. för en ny färgvariant.
  insertTexture: (itemId, afterId, tex) => {
    const created = { id: uid('t'), original: null, edited: true, version: 0, ...tex }
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== itemId) return i
        const arr = [...i.textures]
        const idx = arr.findIndex((t) => t.id === afterId)
        arr.splice(idx < 0 ? arr.length : idx + 1, 0, created)
        return { ...i, textures: arr }
      }),
      selectedTextureId: created.id,
    }))
  },

  // Lager (text/loggor) på en textur. Sätter nya lager, ritar om och uppdaterar 3D-vyn.
  selectedLayerId: null,
  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
  setLayers: (texId, layers, selectId) => {
    const tex = get().items.flatMap((i) => i.textures).find((t) => t.id === texId)
    if (!tex) return
    ensureBase(tex)
    tex.layers = layers
    composite(tex)
    get().touchTexture(texId)
    if (selectId !== undefined) set({ selectedLayerId: selectId })
  },
  updateLayer: (texId, layerId, patch) => {
    const tex = get().items.flatMap((i) => i.textures).find((t) => t.id === texId)
    if (!tex?.layers) return
    get().setLayers(texId, tex.layers.map((L) => (L.id === layerId ? { ...L, ...patch } : L)))
  },

  // Anropas när canvasen har ritats om så att 3D-vyn och listor uppdateras.
  touchTexture: (texId, patch = {}) =>
    set((s) => ({
      items: s.items.map((i) => ({
        ...i,
        textures: i.textures.map((t) => (t.id === texId ? { ...t, edited: true, version: t.version + 1, ...patch } : t)),
      })),
    })),

  loadProject: (p) => {
    const ids = p.items.flatMap((i) => [i.id, ...i.textures.map((t) => t.id)]).map((id) => parseInt(id.slice(1), 10) || 0)
    nextId = Math.max(nextId, ...ids, 0) + 1
    const packs = p.packs?.length ? p.packs : [DEFAULT_PACK]
    for (const pk of packs) nextId = Math.max(nextId, (parseInt(pk.id.slice(2), 10) || 0) + 1)
    const items = p.items.map((i) => ({ ...i, packId: packs.some((pk) => pk.id === i.packId) ? i.packId : packs[0].id }))
    set({ ...p, packs, items, exportMode: p.exportMode || 'addon', multi: [], packFilter: 'all', selectedItemId: p.items[0]?.id || null, selectedTextureId: p.items[0]?.textures[0]?.id || null, activeCategory: p.items[0]?.category || 'jbib' })
  },
}))

export const useSelectedItem = () => useStore((s) => s.items.find((i) => i.id === s.selectedItemId) || null)
export const useSelectedTexture = () =>
  useStore((s) => {
    const item = s.items.find((i) => i.id === s.selectedItemId)
    return item?.textures.find((t) => t.id === s.selectedTextureId) || null
  })
