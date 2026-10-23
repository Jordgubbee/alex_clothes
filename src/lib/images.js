import { readDDS } from './dds'
import { readYTD } from './ytd'

export function canvasFrom(width, height, rgba) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  if (rgba) c.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0)
  return c
}

export function cloneCanvas(src) {
  const c = canvasFrom(src.width, src.height)
  c.getContext('2d').drawImage(src, 0, 0)
  return c
}

export function loadImageToCanvas(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const c = canvasFrom(img.naturalWidth, img.naturalHeight)
      c.getContext('2d').drawImage(img, 0, 0)
      res(c)
    }
    img.onerror = () => rej(new Error('Kunde inte läsa bilden.'))
    img.src = src
  })
}

export const extOf = (name) => name.split('.').pop().toLowerCase()
export const baseName = (name) => name.replace(/\.[^.]+$/, '')

export const TEXTURE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'dds', 'ytd']
export const MODEL_EXTS = ['obj', 'fbx', 'glb', 'gltf']

// Returnerar [{ name, canvas }] – en .ytd kan innehålla flera texturer.
export async function fileToCanvases(file) {
  const ext = extOf(file.name)
  if (ext === 'dds') {
    const t = readDDS(await file.arrayBuffer())
    return [{ name: baseName(file.name), canvas: canvasFrom(t.width, t.height, t.data) }]
  }
  if (ext === 'ytd') {
    const list = await readYTD(await file.arrayBuffer())
    const ok = list.filter((t) => t.data)
    if (!ok.length) throw new Error(list[0]?.error || 'Inga läsbara texturer i filen.')
    return ok.map((t) => ({ name: t.name, canvas: canvasFrom(t.width, t.height, t.data) }))
  }
  const url = URL.createObjectURL(file)
  try {
    return [{ name: baseName(file.name), canvas: await loadImageToCanvas(url) }]
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Snabb läsning vid import: bara namn och storlek. Pixlarna avkodas först när plagget öppnas.
// Returnerar [{ name, width, height, pending: { file, index } }]. Fel (t.ex. BC7) syns direkt.
export async function textureEntries(file) {
  if (extOf(file.name) !== 'ytd') {
    const list = await fileToCanvases(file)
    return list.map((t) => ({ ...t, width: t.canvas.width, height: t.canvas.height }))
  }
  const list = await readYTD(await file.arrayBuffer(), { decode: false })
  const ok = list.filter((t) => !t.error)
  if (!ok.length) throw new Error(list[0]?.error || 'Inga läsbara texturer i filen.')
  return ok.map((t) => ({ name: t.name, width: t.width, height: t.height, canvas: null, pending: { file, index: t.index } }))
}

export async function decodePending(pending) {
  const [t] = (await readYTD(await pending.file.arrayBuffer(), { only: pending.index })).filter((x) => x.index === pending.index)
  if (!t?.data) throw new Error(t?.error || 'Kunde inte läsa texturen.')
  return canvasFrom(t.width, t.height, t.data)
}

export const canvasToBlob = (canvas, type = 'image/png') => new Promise((r) => canvas.toBlob(r, type))
