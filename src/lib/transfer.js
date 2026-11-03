// Flytta eller kopiera loggor och texter (lager) mellan texturer – t.ex. samma märke på alla
// färgvarianter, eller över till ett annat plagg. Samma storlek = exakt samma plats.
import { useStore } from './store'
import { ensureTextures } from './loader'
import { ensureBase, composite, layerId } from './layers'

const findTex = (texId) => {
  for (const item of useStore.getState().items) {
    const tex = item.textures.find((x) => x.id === texId)
    if (tex) return { item, tex }
  }
  return null
}

/**
 * Kopierar lager (layerIds) från sourceTexId till targetTexIds.
 * move = true tar bort lagren från källan efteråt.
 * Är målet en annan storlek skalas position och storlek i samma proportion.
 */
export async function copyLayers(sourceTexId, layerIds, targetTexIds, { move = false, onProgress } = {}) {
  const src = findTex(sourceTexId)
  if (!src) throw new Error('Källtexturen finns inte längre.')
  const layers = (src.tex.layers || []).filter((L) => layerIds.includes(L.id))
  if (!layers.length) return 0
  const sw = src.tex.canvas.width
  const sh = src.tex.canvas.height
  let done = 0
  for (const id of targetTexIds) {
    if (id === sourceTexId) continue
    const hit = findTex(id)
    if (!hit) continue
    done++
    onProgress?.(done, targetTexIds.length)
    await ensureTextures({ textures: [hit.tex] })
    const tex = findTex(id).tex
    if (!tex.canvas) continue
    ensureBase(tex)
    const kx = tex.canvas.width / sw
    const ky = tex.canvas.height / sh
    const copies = layers.map((L) => ({
      ...L,
      id: layerId(),
      x: L.x * kx,
      y: L.y * ky,
      // Proportionerna behålls; vid olika bildformat används den minsta skalan.
      scale: L.scale * Math.min(kx, ky),
    }))
    tex.layers = [...(tex.layers || []), ...copies]
    composite(tex)
    useStore.getState().touchTexture(id)
  }
  if (move) {
    const fresh = findTex(sourceTexId).tex
    useStore.getState().setLayers(sourceTexId, (fresh.layers || []).filter((L) => !layerIds.includes(L.id)), null)
  }
  return done
}
