// Läser texturer ur en GTA V .ytd (RSC7). Endast läsning.
import { decodePixels } from './dds'

function sizeFromFlags(flags) {
  const s =
    (((flags >>> 27) & 1) << 0) +
    (((flags >>> 26) & 1) << 1) +
    (((flags >>> 25) & 1) << 2) +
    (((flags >>> 24) & 1) << 3) +
    (((flags >>> 17) & 0x7f) << 4) +
    (((flags >>> 11) & 0x3f) << 5) +
    (((flags >>> 7) & 0xf) << 6) +
    (((flags >>> 5) & 0x3) << 7) +
    (((flags >>> 4) & 0x1) << 8)
  return (0x200 << (flags & 0xf)) * s
}

const FORMATS = { 0x31545844: 'DXT1', 0x33545844: 'DXT3', 0x35545844: 'DXT5', 21: 'BGRA' }

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).arrayBuffer()
}

// decode = false läser bara namn och storlek (snabbt). only = avkoda bara textur nummer `only`.
export async function readYTD(buffer, { decode = true, only = null } = {}) {
  const head = new DataView(buffer)
  if (head.getUint32(0, true) !== 0x37435352) throw new Error('Filen är inte en okrypterad RSC7 .ytd. Exportera den från OpenIV först.')
  const sysSize = sizeFromFlags(head.getUint32(8, true))
  const data = await inflateRaw(new Uint8Array(buffer, 16))
  const v = new DataView(data)
  const resolve = (ptr) => {
    const kind = ptr >>> 28
    const off = ptr & 0x0fffffff
    if (kind === 5) return off
    if (kind === 6) return sysSize + off
    throw new Error('Ogiltig pekare i .ytd')
  }
  const readStr = (off) => {
    let s = ''
    for (let c; (c = v.getUint8(off)) !== 0; off++) s += String.fromCharCode(c)
    return s
  }

  const listPtr = resolve(v.getUint32(0x30, true))
  const count = v.getUint16(0x38, true)
  const textures = []
  for (let i = 0; i < count; i++) {
    const t = resolve(v.getUint32(listPtr + i * 8, true))
    const name = readStr(resolve(v.getUint32(t + 0x28, true)))
    const width = v.getUint16(t + 0x50, true)
    const height = v.getUint16(t + 0x52, true)
    const format = FORMATS[v.getUint32(t + 0x58, true)]
    if (!format) {
      textures.push({ name, width, height, error: `${name}: formatet (t.ex. BC7) stöds inte – exportera som DDS/PNG från OpenIV.` })
      continue
    }
    if (!decode || (only !== null && only !== i)) {
      textures.push({ name, width, height, index: i })
      continue
    }
    const dataOff = resolve(v.getUint32(t + 0x70, true))
    textures.push({ name, width, height, index: i, data: decodePixels(data, dataOff, width, height, format) })
  }
  return textures
}
