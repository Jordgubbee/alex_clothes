import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore, useSelectedItem, useSelectedTexture } from '../lib/store'
import { dab, stroke, cloneDab, healRect, pickColor, applyFilter, filterString, normRect, resizeCanvas, averageColor } from '../lib/paint'
import { cloneCanvas, fileToCanvases, canvasToBlob, extOf } from '../lib/images'
import { download } from '../lib/exporter'
import { emit, on, uvCache } from '../lib/bus'
import { importFiles } from '../lib/importer'
import { filesFromDrop } from '../lib/files'
import { composite, flatten, hitLayer, layerHandles, newImageLayer, newTextLayer, trimTransparent, ensureBase } from '../lib/layers'
import { IMPORT_ACCEPT, Thumb } from './Sidebar'
import { variantLetter } from '../lib/categories'
import LayersPanel from './LayersPanel'
import { Button, Icon, Slider, FilePick, Input } from './ui'
import { useT } from '../lib/i18n'

const TOOLS = [
  { id: 'layer', short: 'Flytta', icon: 'pointer', label: 'Flytta lager – dra, skala i hörnen, rotera i handtaget', key: 'v' },
  { id: 'move', short: 'Hand', icon: 'move', label: 'Flytta vy', key: 'h' },
  { id: 'select', short: 'Markera', icon: 'select', label: 'Markera område', key: 'm' },
  { id: 'heal', short: 'Ta bort', icon: 'heal', label: 'Ta bort logga – dra en ruta över loggan', key: 'j' },
  { id: 'clone', short: 'Klona', icon: 'clone', label: 'Klonstämpel – Alt+klick väljer källa', key: 's' },
  { id: 'brush', short: 'Pensel', icon: 'brush', label: 'Pensel', key: 'b' },
  { id: 'eraser', short: 'Sudd', icon: 'eraser', label: 'Suddgummi (gör genomskinligt)', key: 'e' },
  { id: 'fill', short: 'Fyll', icon: 'fill', label: 'Fyll ruta med färg', key: 'g' },
  { id: 'text', short: 'Text', icon: 'text', label: 'Text – klicka där texten ska stå', key: 't' },
  { id: 'image', short: 'Logga', icon: 'image', label: 'Logga – klicka där loggan ska stå', key: 'l' },
  { id: 'picker', short: 'Pipett', icon: 'picker', label: 'Pipett – hämta färg', key: 'i' },
]
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp']

const ADJUST_DEFAULT = { hue: 0, saturation: 100, brightness: 100, contrast: 100 }
const HISTORY_LIMIT = 20
const histories = new Map()
const historyOf = (id) => {
  if (!histories.has(id)) histories.set(id, { undo: [], redo: [] })
  return histories.get(id)
}

export default function TextureEditor() {
  const item = useSelectedItem()
  const tex = useSelectedTexture()
  const touchTexture = useStore((s) => s.touchTexture)
  const notify = useStore((s) => s.notify)
  const setLayers = useStore((s) => s.setLayers)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const selectLayer = useStore((s) => s.selectLayer)
  const tr = useT()

  const [tool, setTool] = useState('heal')
  const [size, setSize] = useState(40)
  const [hardness, setHardness] = useState(0.6)
  const [opacity, setOpacity] = useState(1)
  const [color, setColor] = useState('#ffffff')
  const [textDefaults, setTextDefaults] = useState({ text: 'POLIS', font: 'Arial Black', size: 96, color: '#ffffff' })
  const [stamp, setStamp] = useState(null)
  const [adjust, setAdjust] = useState(ADJUST_DEFAULT)
  const [showUV, setShowUV] = useState(true)
  const [showLayers, setShowLayers] = useState(true)
  const [selection, setSelection] = useState(null)
  const [cloneSrc, setCloneSrc] = useState(null)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [, force] = useState(0)

  const wrapRef = useRef()
  const hostRef = useRef()
  const overlayRef = useRef()
  const uvRef = useRef()
  const drag = useRef(null)
  const cursor = useRef(null)
  const spaceDown = useRef(false)
  const dirtyRaf = useRef(0)

  const canvas = tex?.canvas
  const layers = tex?.layers || []
  const selectedLayer = layers.find((L) => L.id === selectedLayerId) || null
  // Penseln och de andra pixelverktygen målar på plagget under lagren.
  const target = () => tex.base || canvas

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !canvas) return
    canvas.className = 'absolute inset-0 h-full w-full checker'
    canvas.style.imageRendering = 'auto'
    host.prepend(canvas)
    return () => canvas.remove()
  }, [canvas])

  const fit = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap || !canvas) return
    const { width, height } = wrap.getBoundingClientRect()
    const zoom = Math.min((width - 48) / canvas.width, (height - 48) / canvas.height)
    setView({ zoom, x: (width - canvas.width * zoom) / 2, y: (height - canvas.height * zoom) / 2 })
  }, [canvas])

  useEffect(() => {
    fit()
    setSelection(null)
  }, [tex?.id, canvas?.width, canvas?.height, fit, showLayers])

  useEffect(() => {
    if (canvas) canvas.style.filter = tool === 'adjust' && !selection ? filterString(adjust) : ''
  }, [tool, adjust, canvas, selection])

  // Under ett penseldrag: rita ihop lagren igen och låt 3D-vyn uppdatera en gång per bildruta.
  const markDirty = useCallback(() => {
    if (dirtyRaf.current) return
    dirtyRaf.current = requestAnimationFrame(() => {
      dirtyRaf.current = 0
      if (!tex) return
      composite(tex)
      emit('texture-dirty', tex.id)
    })
  }, [tex])

  const commit = useCallback(() => {
    if (!tex) return
    composite(tex)
    touchTexture(tex.id)
  }, [tex, touchTexture])

  // Historik: pixlar i plagget + lagren, så att både penseldrag och lagerändringar kan ångras.
  const snapshot = useCallback(() => {
    const t = target()
    return { img: t.getContext('2d').getImageData(0, 0, t.width, t.height), layers: tex.layers ? [...tex.layers] : null }
  }, [tex, canvas]) // eslint-disable-line react-hooks/exhaustive-deps

  const pushHistory = useCallback(() => {
    const h = historyOf(tex.id)
    h.undo.push(snapshot())
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift()
    h.redo = []
    force((n) => n + 1)
  }, [tex, snapshot])

  const restore = useCallback(
    (from, to) => {
      const h = historyOf(tex.id)
      const snap = h[from].pop()
      if (!snap) return
      h[to].push(snapshot())
      const t = target()
      if (snap.img.width !== t.width || snap.img.height !== t.height) {
        t.width = snap.img.width
        t.height = snap.img.height
      }
      t.getContext('2d').putImageData(snap.img, 0, 0)
      if (tex.base) tex.layers = snap.layers || []
      if (selectedLayerId && !tex.layers?.some((L) => L.id === selectedLayerId)) selectLayer(null)
      commit()
      force((n) => n + 1)
    },
    [tex, snapshot, commit, selectedLayerId, selectLayer] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const undo = () => tex && restore('undo', 'redo')
  const redo = () => tex && restore('redo', 'undo')

  // Ändra lager med ångra-stöd.
  const changeLayers = useCallback(
    (next, selectId) => {
      pushHistory()
      setLayers(tex.id, next, selectId)
    },
    [tex, pushHistory, setLayers]
  )

  const addLayer = useCallback(
    (L) => {
      ensureBase(tex)
      changeLayers([...(tex.layers || []), L], L.id)
      setTool('layer')
    },
    [tex, changeLayers]
  )

  const addImageLayer = useCallback(
    (img, at, name) => {
      const trimmed = trimTransparent(img)
      // Loggan får plats i en fjärdedel av texturen från början.
      const k = Math.min(1, (canvas.width * 0.25) / trimmed.width, (canvas.height * 0.25) / trimmed.height)
      addLayer(newImageLayer(trimmed, { x: at?.x ?? canvas.width / 2, y: at?.y ?? canvas.height / 2, scale: k, name: name || tr('Logga') }))
    },
    [canvas, addLayer, tr]
  )

  // ---- Overlay: UV-nät, markering, klonkälla, penselmarkör, lagerhandtag ----
  const drawOverlay = useCallback(() => {
    const o = overlayRef.current
    if (!o || !canvas) return
    if (o.width !== canvas.width || o.height !== canvas.height) {
      o.width = canvas.width
      o.height = canvas.height
    }
    const ctx = o.getContext('2d')
    ctx.clearRect(0, 0, o.width, o.height)
    const lw = 1 / view.zoom
    const rect = drag.current?.rect || selection
    if (rect) {
      ctx.lineWidth = lw * 1.5
      ctx.setLineDash([6 * lw, 4 * lw])
      ctx.strokeStyle = '#fff'
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = '#000'
      ctx.lineDashOffset = 5 * lw
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      ctx.setLineDash([])
    }
    if (cloneSrc && tool === 'clone') {
      const p = drag.current?.cloneAt || cloneSrc
      ctx.strokeStyle = '#e8a33d'
      ctx.lineWidth = lw * 1.5
      ctx.beginPath()
      ctx.moveTo(p.x - 8 * lw, p.y)
      ctx.lineTo(p.x + 8 * lw, p.y)
      ctx.moveTo(p.x, p.y - 8 * lw)
      ctx.lineTo(p.x, p.y + 8 * lw)
      ctx.stroke()
    }
    const c = cursor.current
    if (c && ['brush', 'eraser', 'clone'].includes(tool)) {
      ctx.lineWidth = lw
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(c.x, c.y, size / 2, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (selectedLayer && selectedLayer.visible) {
      const { corners, top, rotate } = layerHandles(selectedLayer, view.zoom)
      ctx.lineWidth = lw * 1.5
      ctx.strokeStyle = '#e8a33d'
      ctx.beginPath()
      corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(rotate.x, rotate.y)
      ctx.stroke()
      const hs = 5 * lw
      ctx.fillStyle = '#fff'
      for (const p of corners) {
        ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2)
        ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2)
      }
      ctx.beginPath()
      ctx.arc(rotate.x, rotate.y, hs * 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }, [canvas, view.zoom, selection, cloneSrc, tool, size, selectedLayer])

  // UV-nätet har ett eget lager som bara ritas om när zoom eller modell ändras – inte vid varje musrörelse.
  const drawUV = useCallback(() => {
    const o = uvRef.current
    if (!o || !canvas) return
    if (o.width !== canvas.width || o.height !== canvas.height) {
      o.width = canvas.width
      o.height = canvas.height
    }
    const ctx = o.getContext('2d')
    ctx.clearRect(0, 0, o.width, o.height)
    const uv = item && uvCache.get(item.id)
    if (!showUV || !uv) return
    ctx.strokeStyle = 'rgba(232,163,61,0.55)'
    ctx.lineWidth = 1 / view.zoom
    ctx.beginPath()
    const flip = !item.flipUV
    for (let i = 0; i < uv.length; i += 4) {
      const v0 = flip ? 1 - uv[i + 1] : uv[i + 1]
      const v1 = flip ? 1 - uv[i + 3] : uv[i + 3]
      ctx.moveTo(fract(uv[i]) * o.width, fract(v0) * o.height)
      ctx.lineTo(fract(uv[i + 2]) * o.width, fract(v1) * o.height)
    }
    ctx.stroke()
  }, [canvas, item?.id, item?.flipUV, showUV, view.zoom, canvas?.width, canvas?.height]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(drawUV, [drawUV])
  useEffect(() => on('uv', drawUV), [drawUV])

  useEffect(drawOverlay, [drawOverlay, tex?.version])

  // ---- Pekare ----
  const toTex = (e) => {
    const r = hostRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height }
  }

  const layerPointerDown = (p) => {
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 10 / view.zoom
    if (selectedLayer) {
      const { corners, rotate } = layerHandles(selectedLayer, view.zoom)
      if (near(p, rotate)) {
        pushHistory()
        drag.current = { layerRotate: true, id: selectedLayer.id, start: selectedLayer }
        return
      }
      if (corners.some((c) => near(p, c))) {
        pushHistory()
        drag.current = { layerScale: true, id: selectedLayer.id, start: selectedLayer, d0: Math.hypot(p.x - selectedLayer.x, p.y - selectedLayer.y) }
        return
      }
    }
    const hit = [...layers].reverse().find((L) => hitLayer(L, p.x, p.y))
    if (!hit) {
      selectLayer(null)
      return
    }
    selectLayer(hit.id)
    pushHistory()
    drag.current = { layerMove: true, id: hit.id, start: hit, p0: p }
  }

  const onPointerDown = (e) => {
    if (!canvas) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toTex(e)
    const panning = tool === 'move' || e.button === 1 || spaceDown.current
    if (panning) {
      drag.current = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      return
    }
    if (e.button !== 0) return
    const ctx = target().getContext('2d')
    switch (tool) {
      case 'layer':
        layerPointerDown(p)
        break
      case 'brush':
      case 'eraser':
        pushHistory()
        ctx.save()
        if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
        dab(ctx, p.x, p.y, size, hardness, color, opacity)
        drag.current = { paint: true, last: p, ctx }
        markDirty()
        break
      case 'clone':
        if (e.altKey) {
          setCloneSrc(p)
          return
        }
        if (!cloneSrc) {
          notify(tr('Håll Alt och klicka där du vill kopiera tyg ifrån först.'))
          return
        }
        pushHistory()
        drag.current = { clone: true, last: p, source: cloneCanvas(target()), dx: cloneSrc.x - p.x, dy: cloneSrc.y - p.y }
        cloneDab(ctx, drag.current.source, p.x, p.y, drag.current.dx, drag.current.dy, size, hardness, opacity)
        markDirty()
        break
      case 'heal':
      case 'fill':
      case 'select':
      case 'adjust':
        drag.current = { rectStart: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } }
        break
      case 'text':
        addLayer(newTextLayer({ ...textDefaults, name: textDefaults.text, x: p.x, y: p.y }))
        break
      case 'image':
        if (!stamp) {
          notify(tr('Välj en bild först i verktygsfältet.'))
          return
        }
        addImageLayer(stamp.canvas, p, stamp.name)
        break
      case 'picker':
        setColor(pickColor(canvas.getContext('2d'), p.x, p.y))
        setTool('brush')
        break
    }
  }

  const moveLayer = (d, p, e) => {
    const L = d.start
    let patch
    if (d.layerMove) patch = { x: L.x + p.x - d.p0.x, y: L.y + p.y - d.p0.y }
    if (d.layerScale) patch = { scale: Math.max(0.01, (L.scale * Math.hypot(p.x - L.x, p.y - L.y)) / Math.max(1, d.d0)) }
    if (d.layerRotate) {
      let rot = (Math.atan2(p.y - L.y, p.x - L.x) * 180) / Math.PI + 90
      if (e.shiftKey) rot = Math.round(rot / 15) * 15
      patch = { rot: ((rot + 540) % 360) - 180 }
    }
    // Direkt på objektet under draget (snabbt), store uppdateras när man släpper.
    tex.layers = tex.layers.map((x) => (x.id === d.id ? { ...x, ...patch } : x))
    markDirty()
    force((n) => n + 1)
  }

  const onPointerMove = (e) => {
    if (!canvas) return
    const p = toTex(e)
    cursor.current = p
    const d = drag.current
    if (d?.pan) {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }))
    } else if (d?.paint) {
      stroke(d.last, p, size, (x, y) => dab(d.ctx, x, y, size, hardness, color, opacity))
      d.last = p
      markDirty()
    } else if (d?.clone) {
      const ctx = target().getContext('2d')
      stroke(d.last, p, size, (x, y) => cloneDab(ctx, d.source, x, y, d.dx, d.dy, size, hardness, opacity))
      d.last = p
      d.cloneAt = { x: p.x + d.dx, y: p.y + d.dy }
      markDirty()
    } else if (d?.layerMove || d?.layerScale || d?.layerRotate) {
      moveLayer(d, p, e)
    } else if (d?.rectStart) {
      d.rect = normRect(d.rectStart, p)
    }
    drawOverlay()
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !canvas) return
    const ctx = target().getContext('2d')
    if (d.paint) {
      d.ctx.restore()
      commit()
    } else if (d.clone) {
      commit()
    } else if (d.layerMove || d.layerScale || d.layerRotate) {
      setLayers(tex.id, tex.layers)
    } else if (d.rect) {
      const r = clampRect(d.rect, canvas)
      if (r.w < 2 || r.h < 2) {
        setSelection(null)
      } else if (tool === 'heal') {
        pushHistory()
        healRect(ctx, r)
        commit()
      } else if (tool === 'fill') {
        pushHistory()
        ctx.save()
        ctx.globalAlpha = opacity
        ctx.fillStyle = color
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.restore()
        commit()
      } else setSelection(r)
    }
    drawOverlay()
  }

  const onWheel = (e) => {
    if (!canvas) return
    const r = wrapRef.current.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    setView((v) => {
      const zoom = Math.min(32, Math.max(0.05, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      const k = zoom / v.zoom
      return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
    })
  }

  // Släpp bilder på texturen = nya loggalager. Andra filer importeras som vanligt.
  const onDrop = async (e) => {
    e.preventDefault()
    const files = await filesFromDrop(e.dataTransfer)
    const images = files.filter((f) => IMAGE_EXTS.includes(extOf(f.name)))
    const rest = files.filter((f) => !IMAGE_EXTS.includes(extOf(f.name)))
    if (canvas && images.length) {
      const p = toTex(e)
      for (const f of images) {
        try {
          const [{ canvas: img }] = await fileToCanvases(f)
          addImageLayer(img, p, f.name.replace(/\.[^.]+$/, ''))
        } catch (err) {
          notify(err.message, 'error')
        }
      }
    }
    if (rest.length) importFiles(rest, item.id)
  }

  // Klistra in en bild (Ctrl+V) som ett nytt lager.
  useEffect(() => {
    const paste = async (e) => {
      if (!canvas || e.target.closest?.('input, textarea')) return
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      const [{ canvas: img }] = await fileToCanvases(new File([file], 'inklistrad.png'))
      addImageLayer(img, null, tr('Inklistrad bild'))
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [canvas, addImageLayer, tr])

  // ---- Tangentbord ----
  useEffect(() => {
    const down = (e) => {
      if (e.target?.closest?.('input, textarea, select')) return
      if (e.code === 'Space') spaceDown.current = true
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (selectedLayer && tex) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          changeLayers(layers.filter((L) => L.id !== selectedLayer.id), null)
          return
        }
        if (mod && e.key.toLowerCase() === 'd') {
          e.preventDefault()
          const copy = { ...selectedLayer, id: `${selectedLayer.id}c${Date.now() % 100000}`, x: selectedLayer.x + 20, y: selectedLayer.y + 20 }
          changeLayers([...layers, copy], copy.id)
          return
        }
        if (mod && e.key.toLowerCase() === 'e') {
          e.preventDefault()
          pushHistory()
          flatten(tex, selectedLayer.id)
          selectLayer(null)
          touchTexture(tex.id)
          return
        }
        const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
        if (nudge) {
          e.preventDefault()
          const k = e.shiftKey ? 10 : 1
          setLayers(tex.id, layers.map((L) => (L.id === selectedLayer.id ? { ...L, x: L.x + nudge[0] * k, y: L.y + nudge[1] * k } : L)))
          return
        }
      }
      if (mod || e.altKey) return
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t) setTool(t.id)
      if (e.key === '[') setSize((s) => Math.max(1, Math.round(s * 0.85)))
      if (e.key === ']') setSize((s) => Math.min(800, Math.round(s * 1.18) + 1))
      if (e.key === 'Escape') {
        setSelection(null)
        selectLayer(null)
      }
      if (e.key === '0') fit()
    }
    const up = (e) => e.code === 'Space' && (spaceDown.current = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  const applyAdjust = () => {
    pushHistory()
    canvas.style.filter = ''
    applyFilter(target(), filterString(adjust), selection)
    setAdjust(ADJUST_DEFAULT)
    commit()
  }

  // Storlek, spegling och rotation gäller hela texturen – lagren bränns in först.
  const flattenAll = () => {
    if (tex.layers?.length) {
      flatten(tex)
      selectLayer(null)
    }
  }

  const doResize = (n) => {
    if (!n || (n === canvas.width && n === canvas.height)) return
    pushHistory()
    flattenAll()
    resizeCanvas(target(), n, n)
    commit()
    fit()
  }

  const transform = (mode) => {
    pushHistory()
    flattenAll()
    const t = target()
    const src = cloneCanvas(t)
    if (mode === 'rotate') {
      t.width = src.height
      t.height = src.width
    }
    const ctx = t.getContext('2d')
    ctx.save()
    ctx.clearRect(0, 0, t.width, t.height)
    if (mode === 'flipX') ctx.setTransform(-1, 0, 0, 1, t.width, 0)
    if (mode === 'flipY') ctx.setTransform(1, 0, 0, -1, 0, t.height)
    if (mode === 'rotate') ctx.setTransform(0, 1, -1, 0, t.width, 0)
    ctx.drawImage(src, 0, 0)
    ctx.restore()
    commit()
    if (mode === 'rotate') fit()
  }

  const clearSelection = (mode) => {
    if (!selection) return
    pushHistory()
    const ctx = target().getContext('2d')
    if (mode === 'erase') ctx.clearRect(selection.x, selection.y, selection.w, selection.h)
    if (mode === 'heal') healRect(ctx, selection)
    if (mode === 'avg') {
      ctx.fillStyle = averageColor(ctx, { x: selection.x - 4, y: selection.y - 4, w: selection.w + 8, h: 4 })
      ctx.fillRect(selection.x, selection.y, selection.w, selection.h)
    }
    commit()
  }

  if (!item)
    return useStore.getState().items.length ? (
      <Empty title={tr('Inget plagg valt')} text={tr('Välj ett plagg i listan till vänster för att redigera det.')} onFiles={(f) => importFiles(f)} />
    ) : (
      <Empty title={tr('Börja här')} text={tr('Importera kläder från OpenIV, CodeWalker eller ett befintligt klädpaket. Inget laddas på gubben förrän du klickar på ett plagg.')} onFiles={(f) => importFiles(f)} big />
    )
  if (!tex) return <Empty title={tr('Plagget har ingen textur')} text={tr('Dra in en .ytd, .dds eller .png – eller klicka nedan.')} onFiles={(f) => importFiles(f, item.id)} />

  if (!canvas)
    return (
      <div className="flex h-full items-center justify-center bg-ink-950 text-[13px] text-ink-400">
        <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
        {tr('Laddar texturen…')}
      </div>
    )

  const h = historyOf(tex.id)
  const currentTool = TOOLS.find((x) => x.id === tool)
  const cursorStyle = tool === 'move' ? 'grab' : tool === 'layer' ? 'default' : ['brush', 'eraser', 'clone'].includes(tool) ? 'none' : 'crosshair'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <VariantStrip item={item} tex={tex} />
      <OptionsBar
        {...{ tool, size, setSize, hardness, setHardness, opacity, setOpacity, color, setColor, textDefaults, setTextDefaults, stamp, setStamp, adjust, setAdjust, applyAdjust, selection, clearSelection, cloneSrc, notify, showLayers, setShowLayers }}
        label={tr(tool === 'adjust' ? 'Justera färger' : currentTool?.label)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[60px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-800 bg-ink-900 py-1.5">
          {TOOLS.map((x) => (
            <ToolButton key={x.id} active={tool === x.id} title={`${tr(x.label)} (${x.key.toUpperCase()})`} onClick={() => setTool(x.id)} label={tr(x.short)}>
              <Icon name={x.icon} />
            </ToolButton>
          ))}
          <div className="my-1 h-px w-8 bg-ink-800" />
          <ToolButton active={tool === 'adjust'} title={tr('Justera färger (nyans, mättnad, ljus)')} onClick={() => setTool('adjust')} label={tr('Färger')}>
            <span className="text-[11px] font-bold">Aa</span>
          </ToolButton>
        </div>

        <div
          ref={wrapRef}
          className="relative min-w-0 flex-1 overflow-hidden bg-ink-950"
          style={{ cursor: cursorStyle }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            cursor.current = null
            drawOverlay()
          }}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div
            ref={hostRef}
            className="absolute left-0 top-0 origin-top-left shadow-[0_0_0_1px_#2e2e2e]"
            style={{ width: canvas.width, height: canvas.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          >
            <canvas ref={uvRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
        </div>

        {showLayers && (
          <LayersPanel
            tex={tex}
            layers={layers}
            selected={selectedLayer}
            onSelect={(id) => {
              selectLayer(id)
              if (id) setTool('layer')
            }}
            onChange={changeLayers}
            onLive={(id, patch) => useStore.getState().updateLayer(tex.id, id, patch)}
            onBeforeLive={pushHistory}
            onAddText={() => addLayer(newTextLayer({ ...textDefaults, name: textDefaults.text, x: canvas.width / 2, y: canvas.height / 2 }))}
            onAddImage={(img, name) => addImageLayer(img, null, name)}
            onFlatten={(id) => {
              pushHistory()
              flatten(tex, id)
              selectLayer(null)
              touchTexture(tex.id)
            }}
          />
        )}
      </div>

      <div className="flex h-9 items-center gap-1 border-t border-ink-800 bg-ink-900 px-2 text-xs text-ink-400">
        <Button variant="ghost" size="icon" title={tr('Ångra (Ctrl+Z)')} onClick={undo} disabled={!h.undo.length}>
          <Icon name="undo" />
        </Button>
        <Button variant="ghost" size="icon" title={tr('Gör om (Ctrl+Y)')} onClick={redo} disabled={!h.redo.length}>
          <Icon name="redo" />
        </Button>
        <div className="mx-1 h-4 w-px bg-ink-800" />
        <Button variant="ghost" size="icon" title={tr('Anpassa (0)')} onClick={fit}>
          <Icon name="fit" />
        </Button>
        <span className="w-12 tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <label className="ml-2 flex items-center gap-1.5">
          <input type="checkbox" checked={showUV} onChange={(e) => setShowUV(e.target.checked)} />
          {tr('UV-nät')}
        </label>
        <div className="flex-1" />
        <span className="truncate tabular-nums">
          {tex.name} · {canvas.width}×{canvas.height}
        </span>
        <Button variant="ghost" size="sm" title={tr('Spegla vågrätt')} onClick={() => transform('flipX')}>↔</Button>
        <Button variant="ghost" size="sm" title={tr('Spegla lodrätt')} onClick={() => transform('flipY')}>↕</Button>
        <Button variant="ghost" size="sm" title={tr('Rotera 90°')} onClick={() => transform('rotate')}>90°</Button>
        <select className="ml-2 h-6 rounded border border-ink-700 bg-ink-900 px-1 text-xs text-ink-200" value="" onChange={(e) => doResize(parseInt(e.target.value, 10))}>
          <option value="">{tr('Ändra storlek…')}</option>
          {[256, 512, 1024, 2048, 4096].map((n) => (
            <option key={n} value={n}>
              {n}×{n}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" title={tr('Spara texturen som PNG')} onClick={async () => download(await canvasToBlob(canvas), `${tex.name}.png`)}>
          <Icon name="download" /> PNG
        </Button>
      </div>
    </div>
  )
}

function ToolButton({ active, title, onClick, label, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex w-[52px] flex-col items-center gap-0.5 rounded-md py-1.5 ${active ? 'bg-ink-700 text-accent' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-100'}`}
    >
      {children}
      <span className="max-w-full truncate text-[9.5px] leading-none">{label}</span>
    </button>
  )
}

// Färgvarianterna (a, b, c …) syns alltid ovanför texturen – klicka för att byta vilken du redigerar.
function VariantStrip({ item, tex }) {
  const t = useT()
  const selectTexture = useStore((s) => s.selectTexture)
  const insertTexture = useStore((s) => s.insertTexture)
  return (
    <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-900 px-3 py-1.5">
      <span className="shrink-0 text-[11px] font-medium text-ink-400">{t('Färgvariant')}</span>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {item.textures.map((x, i) => (
          <button
            key={x.id}
            title={x.name}
            onClick={() => selectTexture(x.id)}
            className={`relative shrink-0 rounded-md p-0.5 ${x.id === tex.id ? 'bg-accent' : 'bg-ink-800 hover:bg-ink-700'}`}
          >
            <Thumb tex={x} />
            <span className="absolute bottom-0.5 left-0.5 rounded-sm bg-black/70 px-1 font-mono text-[10px] text-white">{variantLetter(i)}</span>
          </button>
        ))}
        <button
          title={t('Duplicera som ny färgvariant')}
          onClick={() => tex.canvas && insertTexture(item.id, tex.id, { name: `${tex.name}_kopia`, canvas: cloneCanvas(tex.canvas) })}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-100"
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  )
}

function OptionsBar(p) {
  const t = useT()
  const brushLike = ['brush', 'eraser', 'clone'].includes(p.tool)
  const td = p.textDefaults
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-800 bg-ink-900 px-3 py-1.5">
      <span className="text-xs font-medium text-ink-200">{p.label}</span>
      {brushLike && (
        <>
          <Inline label={t('Storlek')} value={p.size} min={1} max={400} onChange={p.setSize} />
          <Inline label={t('Hårdhet')} value={p.hardness} min={0} max={1} step={0.05} onChange={p.setHardness} format={(v) => `${Math.round(v * 100)}%`} />
        </>
      )}
      {['brush', 'eraser', 'clone', 'fill'].includes(p.tool) && (
        <Inline label={t('Täckning')} value={p.opacity} min={0.05} max={1} step={0.05} onChange={p.setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      {['brush', 'fill'].includes(p.tool) && <ColorInput value={p.color} onChange={p.setColor} />}
      {p.tool === 'clone' && <span className="text-xs text-ink-400">{p.cloneSrc ? t('Källa vald. Måla över loggan.') : t('Alt + klick för att välja var tyget ska kopieras från.')}</span>}
      {p.tool === 'heal' && <span className="text-xs text-ink-400">{t('Dra en ruta tätt runt loggan eller texten. Upprepa i mindre rutor för bästa resultat.')}</span>}
      {p.tool === 'layer' && <span className="text-xs text-ink-400">{t('Klicka på en text eller logga. Dra för att flytta, hörnen skalar, den runda pricken roterar (Skift = 15°). Pilar flyttar 1 px.')}</span>}
      {p.tool === 'text' && (
        <>
          <Input value={td.text} onChange={(e) => p.setTextDefaults({ ...td, text: e.target.value })} className="!h-7 !w-40" />
          <ColorInput value={td.color} onChange={(color) => p.setTextDefaults({ ...td, color })} />
          <span className="text-xs text-ink-400">{t('Klicka på texturen – texten blir ett lager du kan ändra i panelen till höger.')}</span>
        </>
      )}
      {p.tool === 'image' && (
        <>
          <FilePick
            size="sm"
            accept=".png,.jpg,.jpeg,.webp,.dds"
            onFiles={async ([f]) => {
              try {
                const [{ canvas }] = await fileToCanvases(f)
                p.setStamp({ canvas, name: f.name.replace(/\.[^.]+$/, '') })
              } catch (e) {
                p.notify(e.message, 'error')
              }
            }}
          >
            {p.stamp ? t('Byt bild') : t('Välj bild…')}
          </FilePick>
          <span className="text-xs text-ink-400">{t('Eller dra in en PNG direkt på texturen, eller klistra in med Ctrl+V.')}</span>
        </>
      )}
      {p.tool === 'adjust' && (
        <>
          <Inline label={t('Nyans')} value={p.adjust.hue} min={-180} max={180} onChange={(v) => p.setAdjust({ ...p.adjust, hue: v })} format={(v) => `${v}°`} />
          <Inline label={t('Mättnad')} value={p.adjust.saturation} min={0} max={250} onChange={(v) => p.setAdjust({ ...p.adjust, saturation: v })} format={(v) => `${v}%`} />
          <Inline label={t('Ljus')} value={p.adjust.brightness} min={0} max={200} onChange={(v) => p.setAdjust({ ...p.adjust, brightness: v })} format={(v) => `${v}%`} />
          <Inline label={t('Kontrast')} value={p.adjust.contrast} min={0} max={200} onChange={(v) => p.setAdjust({ ...p.adjust, contrast: v })} format={(v) => `${v}%`} />
          <Button size="sm" variant="primary" onClick={p.applyAdjust}>
            {p.selection ? t('Verkställ på markering') : t('Verkställ')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => p.setAdjust(ADJUST_DEFAULT)}>
            {t('Återställ')}
          </Button>
        </>
      )}
      {p.tool === 'select' && (
        <>
          <span className="text-xs text-ink-400">{p.selection ? t('Med markeringen:') : t('Dra för att markera ett område.')}</span>
          {p.selection && (
            <>
              <Button size="sm" onClick={() => p.clearSelection('heal')}>
                {t('Ta bort logga')}
              </Button>
              <Button size="sm" onClick={() => p.clearSelection('avg')}>
                {t('Fyll med tygfärg')}
              </Button>
              <Button size="sm" onClick={() => p.clearSelection('erase')}>
                {t('Gör genomskinlig')}
              </Button>
            </>
          )}
        </>
      )}
      <div className="flex-1" />
      <Button size="sm" variant={p.showLayers ? 'default' : 'ghost'} onClick={() => p.setShowLayers(!p.showLayers)}>
        {t('Lager')}
      </Button>
    </div>
  )
}

function Inline({ label, ...rest }) {
  return (
    <div className="w-36">
      <Slider label={label} {...rest} />
    </div>
  )
}

export function ColorInput({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-400">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-ink-700 bg-transparent" />
      <span className="font-mono text-ink-300">{value}</span>
    </label>
  )
}

function Empty({ title, text, onFiles, big }) {
  const t = useT()
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 border border-dashed border-ink-800 bg-ink-950 p-8 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault()
        onFiles(await filesFromDrop(e.dataTransfer))
      }}
    >
      <p className={`font-medium text-ink-100 ${big ? 'text-lg' : 'text-sm'}`}>{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-400">{text}</p>
      <div className="mt-1 flex gap-2">
        <FilePick multiple accept={IMPORT_ACCEPT} onFiles={onFiles} variant={big ? 'primary' : 'default'} className={big ? '!h-10 !px-5' : ''}>
          {big ? t('Importera filer') : t('Välj filer…')}
        </FilePick>
        <FilePick folder onFiles={onFiles} className={big ? '!h-10 !px-5' : ''}>
          {big ? t('Importera mapp') : t('Välj mapp…')}
        </FilePick>
      </div>
    </div>
  )
}

const fract = (v) => v - Math.floor(v)
const clampRect = (r, c) => {
  const x = Math.max(0, r.x)
  const y = Math.max(0, r.y)
  return { x, y, w: Math.min(c.width, r.x + r.w) - x, h: Math.min(c.height, r.y + r.h) - y }
}
