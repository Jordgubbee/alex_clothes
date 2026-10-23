// Laddar ett plagg först när man klickar på det: avkodar texturerna och bygger 3D-modellen.
// Då blir importen snabb även för stora paket och appen laggar inte.
import { useStore } from './store'
import { decodePending } from './images'
import { desktop, previewMany } from './desktop'

const loading = new Set()
const yieldToUi = () => new Promise((r) => setTimeout(r, 0))

export async function ensureTextures(item) {
  for (const tex of item.textures) {
    if (tex.canvas || !tex.pending || loading.has(tex.id)) continue
    loading.add(tex.id)
    try {
      tex.canvas = await decodePending(tex.pending)
      tex.width = tex.canvas.width
      tex.height = tex.canvas.height
      useStore.getState().touchTexture(tex.id, { edited: tex.edited })
    } catch (e) {
      useStore.getState().notify(`${tex.name}: ${e.message}`, 'error')
    } finally {
      loading.delete(tex.id)
    }
    await yieldToUi()
  }
}

// Avkodar allt i projektet (behövs för Spara och för export av ändrade texturer).
export async function ensureAllTextures() {
  for (const item of useStore.getState().items) await ensureTextures(item)
}

export async function openItem(itemId) {
  const item = useStore.getState().items.find((i) => i.id === itemId)
  if (!item) return
  // Den valda texturen först, så att den syns direkt.
  const st = useStore.getState()
  const first = item.textures.find((t) => t.id === st.selectedTextureId)
  if (first) await ensureTextures({ textures: [first] })
  const build = desktop && item.ydd && (!item.preview || (item.previewFromYdd && item.previewYdd !== item.ydd)) && !item.converting
  await Promise.all([ensureTextures(item), build ? previewMany([itemId]) : null])
}
