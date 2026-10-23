// Läser DDS (DXT1/3/5 och okomprimerad BGRA) och skriver okomprimerad A8R8G8B8 DDS.

const fourCC = (s) => (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>> 0

function rgb565(c) {
  return [(((c >> 11) & 31) * 255) / 31, (((c >> 5) & 63) * 255) / 63, ((c & 31) * 255) / 31]
}

function decodeColorBlock(view, off, out, w, h, bx, by, dxt1, alpha) {
  const c0 = view.getUint16(off, true)
  const c1 = view.getUint16(off + 2, true)
  const p0 = rgb565(c0)
  const p1 = rgb565(c1)
  const pal = [p0, p1]
  let punch = false
  if (!dxt1 || c0 > c1) {
    pal.push(p0.map((v, i) => (2 * v + p1[i]) / 3), p0.map((v, i) => (v + 2 * p1[i]) / 3))
  } else {
    pal.push(p0.map((v, i) => (v + p1[i]) / 2), [0, 0, 0])
    punch = true
  }
  const bits = view.getUint32(off + 4, true)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const px = bx + x
      const py = by + y
      if (px >= w || py >= h) continue
      const idx = (bits >>> (2 * (y * 4 + x))) & 3
      const o = (py * w + px) * 4
      const c = pal[idx]
      out[o] = c[0]
      out[o + 1] = c[1]
      out[o + 2] = c[2]
      out[o + 3] = alpha ? alpha[y * 4 + x] : punch && idx === 3 ? 0 : 255
    }
  }
}

function dxt3Alpha(view, off) {
  const a = new Array(16)
  for (let i = 0; i < 8; i++) {
    const b = view.getUint8(off + i)
    a[i * 2] = (b & 15) * 17
    a[i * 2 + 1] = (b >> 4) * 17
  }
  return a
}

function dxt5Alpha(view, off) {
  const a0 = view.getUint8(off)
  const a1 = view.getUint8(off + 1)
  const pal = [a0, a1]
  if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7)
  else {
    for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5)
    pal.push(0, 255)
  }
  // 48 bitar index, delat i två 24-bitarsdelar för att slippa BigInt.
  const lo = view.getUint8(off + 2) | (view.getUint8(off + 3) << 8) | (view.getUint8(off + 4) << 16)
  const hi = view.getUint8(off + 5) | (view.getUint8(off + 6) << 8) | (view.getUint8(off + 7) << 16)
  const a = new Array(16)
  for (let i = 0; i < 8; i++) a[i] = pal[(lo >> (3 * i)) & 7]
  for (let i = 0; i < 8; i++) a[i + 8] = pal[(hi >> (3 * i)) & 7]
  return a
}

export function decodePixels(buffer, offset, w, h, format) {
  const view = new DataView(buffer)
  const out = new Uint8ClampedArray(w * h * 4)
  if (format === 'DXT1' || format === 'DXT3' || format === 'DXT5') {
    const blockSize = format === 'DXT1' ? 8 : 16
    let off = offset
    for (let by = 0; by < h; by += 4) {
      for (let bx = 0; bx < w; bx += 4) {
        if (format === 'DXT1') decodeColorBlock(view, off, out, w, h, bx, by, true, null)
        else {
          const alpha = format === 'DXT3' ? dxt3Alpha(view, off) : dxt5Alpha(view, off)
          decodeColorBlock(view, off + 8, out, w, h, bx, by, false, alpha)
        }
        off += blockSize
      }
    }
    return out
  }
  if (format === 'BGRA') {
    for (let i = 0; i < w * h; i++) {
      const o = offset + i * 4
      out[i * 4] = view.getUint8(o + 2)
      out[i * 4 + 1] = view.getUint8(o + 1)
      out[i * 4 + 2] = view.getUint8(o)
      out[i * 4 + 3] = view.getUint8(o + 3)
    }
    return out
  }
  throw new Error(`Texturformatet ${format} stöds inte. Exportera texturen som PNG eller DXT5 från OpenIV.`)
}

export function readDDS(buffer) {
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== fourCC('DDS ')) throw new Error('Inte en giltig DDS-fil.')
  const h = view.getUint32(12, true)
  const w = view.getUint32(16, true)
  const pfFlags = view.getUint32(80, true)
  const cc = view.getUint32(84, true)
  let format = 'BGRA'
  if (pfFlags & 4) {
    if (cc === fourCC('DXT1')) format = 'DXT1'
    else if (cc === fourCC('DXT3')) format = 'DXT3'
    else if (cc === fourCC('DXT5')) format = 'DXT5'
    else if (cc === fourCC('DX10')) throw new Error('DDS i BC7/DX10-format stöds inte. Spara om som DXT5 eller PNG.')
    else throw new Error('Okänt DDS-format.')
  }
  return { width: w, height: h, data: decodePixels(buffer, 128, w, h, format) }
}

// ---- DXT5-kodare (BC3) med mipmaps, så att texturerna blir lika små som GTA:s egna ----

const to565 = (r, g, b) => ((Math.round((r * 31) / 255) << 11) | (Math.round((g * 63) / 255) << 5) | Math.round((b * 31) / 255)) >>> 0

function encodeBlock(src, w, h, bx, by, out, off) {
  const px = new Array(16)
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0, minA = 255, maxA = 0
  for (let i = 0; i < 16; i++) {
    const x = Math.min(w - 1, bx + (i & 3))
    const y = Math.min(h - 1, by + (i >> 2))
    const o = (y * w + x) * 4
    const p = [src[o], src[o + 1], src[o + 2], src[o + 3]]
    px[i] = p
    minR = Math.min(minR, p[0]); maxR = Math.max(maxR, p[0])
    minG = Math.min(minG, p[1]); maxG = Math.max(maxG, p[1])
    minB = Math.min(minB, p[2]); maxB = Math.max(maxB, p[2])
    minA = Math.min(minA, p[3]); maxA = Math.max(maxA, p[3])
  }
  // Alfa: 8 nivåer mellan max och min.
  out[off] = maxA
  out[off + 1] = minA
  let lo = 0, hi = 0
  for (let i = 0; i < 16; i++) {
    let idx = 0
    if (maxA !== minA) {
      const t = Math.round(((maxA - px[i][3]) / (maxA - minA)) * 7)
      idx = t === 0 ? 0 : t === 7 ? 1 : t + 1
    }
    if (i < 8) lo |= idx << (3 * i)
    else hi |= idx << (3 * (i - 8))
  }
  out[off + 2] = lo & 255; out[off + 3] = (lo >> 8) & 255; out[off + 4] = (lo >> 16) & 255
  out[off + 5] = hi & 255; out[off + 6] = (hi >> 8) & 255; out[off + 7] = (hi >> 16) & 255

  // Färg: lite indragen bounding box ger mindre fel än ren min/max.
  const inset = (a, b) => (b - a) / 16
  const iR = inset(minR, maxR), iG = inset(minG, maxG), iB = inset(minB, maxB)
  let c0 = to565(maxR - iR, maxG - iG, maxB - iB)
  let c1 = to565(minR + iR, minG + iG, minB + iB)
  if (c0 < c1) [c0, c1] = [c1, c0]
  const p0 = rgb565(c0), p1 = rgb565(c1)
  const pal = [p0, p1, p0.map((v, i) => (2 * v + p1[i]) / 3), p0.map((v, i) => (v + 2 * p1[i]) / 3)]
  let bits = 0
  for (let i = 0; i < 16; i++) {
    let best = 0, bestD = Infinity
    for (let k = 0; k < 4; k++) {
      const d = (px[i][0] - pal[k][0]) ** 2 + (px[i][1] - pal[k][1]) ** 2 + (px[i][2] - pal[k][2]) ** 2
      if (d < bestD) { bestD = d; best = k }
    }
    bits |= best << (2 * i)
  }
  out[off + 8] = c0 & 255; out[off + 9] = c0 >> 8
  out[off + 10] = c1 & 255; out[off + 11] = c1 >> 8
  out[off + 12] = bits & 255; out[off + 13] = (bits >>> 8) & 255; out[off + 14] = (bits >>> 16) & 255; out[off + 15] = (bits >>> 24) & 255
}

function halve(src, w, h) {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1)
  const out = new Uint8ClampedArray(nw * nh * 4)
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++)
      for (let c = 0; c < 4; c++) {
        const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1)
        const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1)
        out[(y * nw + x) * 4 + c] = (src[(y0 * w + x0) * 4 + c] + src[(y0 * w + x1) * 4 + c] + src[(y1 * w + x0) * 4 + c] + src[(y1 * w + x1) * 4 + c]) / 4
      }
  return { data: out, w: nw, h: nh }
}

export function writeDDSDXT5(imageData) {
  let { width: w, height: h, data } = imageData
  const levels = []
  let level = { data, w, h }
  while (true) {
    const bw = Math.ceil(level.w / 4), bh = Math.ceil(level.h / 4)
    const out = new Uint8Array(bw * bh * 16)
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) encodeBlock(level.data, level.w, level.h, bx * 4, by * 4, out, (by * bw + bx) * 16)
    levels.push(out)
    // GTA slutar vid 4×4 – mindre nivåer ger inget.
    if (level.w <= 4 || level.h <= 4) break
    level = halve(level.data, level.w, level.h)
  }
  const total = levels.reduce((s, l) => s + l.length, 0)
  const buf = new ArrayBuffer(128 + total)
  const v = new DataView(buf)
  v.setUint32(0, fourCC('DDS '), true)
  v.setUint32(4, 124, true)
  v.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000, true)
  v.setUint32(12, h, true)
  v.setUint32(16, w, true)
  v.setUint32(20, levels[0].length, true)
  v.setUint32(28, levels.length, true)
  v.setUint32(76, 32, true)
  v.setUint32(80, 0x4, true)
  v.setUint32(84, fourCC('DXT5'), true)
  v.setUint32(108, 0x1000 | 0x8 | 0x400000, true)
  let off = 128
  const bytes = new Uint8Array(buf)
  for (const l of levels) {
    bytes.set(l, off)
    off += l.length
  }
  return buf
}

export function writeDDS(imageData) {
  const { width: w, height: h, data } = imageData
  const buf = new ArrayBuffer(128 + w * h * 4)
  const v = new DataView(buf)
  v.setUint32(0, fourCC('DDS '), true)
  v.setUint32(4, 124, true)
  v.setUint32(8, 0x1 | 0x2 | 0x4 | 0x8 | 0x1000, true)
  v.setUint32(12, h, true)
  v.setUint32(16, w, true)
  v.setUint32(20, w * 4, true)
  v.setUint32(76, 32, true)
  v.setUint32(80, 0x41, true)
  v.setUint32(88, 32, true)
  v.setUint32(92, 0x00ff0000, true)
  v.setUint32(96, 0x0000ff00, true)
  v.setUint32(100, 0x000000ff, true)
  v.setUint32(104, 0xff000000, true)
  v.setUint32(108, 0x1000, true)
  const px = new Uint8Array(buf, 128)
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = data[i * 4 + 2]
    px[i * 4 + 1] = data[i * 4 + 1]
    px[i * 4 + 2] = data[i * 4]
    px[i * 4 + 3] = data[i * 4 + 3]
  }
  return buf
}
