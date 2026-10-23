import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useStore } from '../lib/store'
import { extOf } from '../lib/images'
import { on, emit, uvCache } from '../lib/bus'
import { desktop, importPedFromGta, pedsFromGta, pedFromFolder, texKey, texFamily } from '../lib/desktop'
import { Button, FilePick } from './ui'
import { useT } from '../lib/i18n'

// GTA:s freemode-gubbe har sin rot vid höften, ungefär en meter över fötterna.
const GTA_ROOT_HEIGHT = 1.0

async function loadModel(file) {
  const ext = extOf(file.name)
  const buf = await file.arrayBuffer()
  let obj
  if (ext === 'obj') obj = new OBJLoader().parse(new TextDecoder().decode(buf))
  else if (ext === 'fbx') obj = new FBXLoader().parse(buf, '')
  else if (ext === 'glb' || ext === 'gltf') obj = (await new GLTFLoader().parseAsync(buf, '')).scene
  else throw new Error('Förhandsvisning stöder .ydd (via Sollumz), .obj, .fbx och .glb')
  const wrap = new THREE.Group()
  wrap.add(obj)
  // glTF är alltid Y-upp i meter. Andra format från GTA-verktyg är ofta Z-upp och ibland i cm.
  if (ext !== 'glb' && ext !== 'gltf') {
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
    if (size.z > size.y * 1.4) obj.rotation.x = -Math.PI / 2
    if (Math.max(size.x, size.y, size.z) > 20) obj.scale.multiplyScalar(0.01)
  }
  return wrap
}

function collectUV(obj, isGlb) {
  const segs = []
  obj.traverse((m) => {
    const g = m.geometry
    const uv = g?.attributes?.uv
    if (!uv) return
    const idx = g.index
    const tri = idx ? idx.count / 3 : uv.count / 3
    for (let t = 0; t < tri; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      for (const [p, q] of [[a, b], [b, c], [c, a]]) segs.push(uv.getX(p), isGlb ? 1 - uv.getY(p) : uv.getY(p), uv.getX(q), isGlb ? 1 - uv.getY(q) : uv.getY(q))
    }
  })
  return new Float32Array(segs)
}

export default function Viewer3D() {
  const mountRef = useRef()
  const ctx = useRef(null)
  const gender = useStore((s) => s.gender)
  const basePed = useStore((s) => s.basePed)
  const pedTextures = useStore((s) => s.pedTextures)
  const pedBusy = useStore((s) => s.pedBusy)
  const items = useStore((s) => s.items)
  const outfit = useStore((s) => s.outfit)
  const selectedItemId = useStore((s) => s.selectedItemId)
  const selectedTextureId = useStore((s) => s.selectedTextureId)
  const setBasePed = useStore((s) => s.setBasePed)
  const notify = useStore((s) => s.notify)
  const blender = useStore((s) => s.blender)
  const t = useT()
  const [showBody, setShowBody] = useState(true)
  const [onlySelected, setOnlySelected] = useState(true)
  const [wire, setWire] = useState(false)
  const [spin, setSpin] = useState(false)
  const [light, setLight] = useState('studio')

  // ---- Scen ----
  useEffect(() => {
    const mount = mountRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x161616)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
    camera.position.set(0, 1.1, 3.4)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.95, 0)
    controls.enableDamping = true
    controls.update()

    const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 1.6)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2, 3, 2.5)
    const rim = new THREE.DirectionalLight(0xffffff, 1)
    rim.position.set(-2, 2, -3)
    scene.add(hemi, key, rim, new THREE.GridHelper(4, 16, 0x333333, 0x222222))

    // Allt från GTA ligger i gtaRoot, som lyfts så att fötterna står på golvet.
    const gtaRoot = new THREE.Group()
    gtaRoot.position.y = GTA_ROOT_HEIGHT
    const plainRoot = new THREE.Group()
    const turn = new THREE.Group()
    turn.add(gtaRoot, plainRoot)
    scene.add(turn)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()

    let raf
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (ctx.current.spin) turn.rotation.y += 0.006
      controls.update()
      renderer.render(scene, camera)
    }
    ctx.current = { scene, camera, controls, renderer, turn, gtaRoot, plainRoot, ped: null, models: new Map(), textures: new Map(), spin: false, lights: { hemi, key, rim } }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    ctx.current.spin = spin
    if (!spin) ctx.current.turn.rotation.y = 0
  }, [spin])

  useEffect(() => {
    const { hemi, key, rim } = ctx.current.lights
    const presets = { studio: [1.6, 2.2, 1], dag: [2.4, 3, 0.6], natt: [0.5, 0.9, 1.6] }
    ;[hemi.intensity, key.intensity, rim.intensity] = presets[light]
    ctx.current.scene.background.set(light === 'dag' ? 0x2a2d30 : 0x161616)
  }, [light])

  // ---- Basmodell ----
  useEffect(() => {
    const c = ctx.current
    if (c.ped) c.ped.removeFromParent()
    const file = basePed[gender]
    if (!file) {
      c.ped = placeholderBody()
      c.plainRoot.add(c.ped)
      c.ped.visible = showBody
      return
    }
    let alive = true
    const fromGta = extOf(file.name) === 'glb'
    loadModel(file)
      .then((obj) => {
        if (!alive) return
        const byName = new Map(pedTextures[gender].map((t) => [texKey(t.name), t.canvas]))
        obj.traverse((m) => {
          if (!m.isMesh) return
          const canvas = byName.get(texKey(m.material?.name || ''))
          const map = canvas ? new THREE.CanvasTexture(canvas) : m.material?.map || null
          if (map) {
            map.colorSpace = THREE.SRGBColorSpace
            map.flipY = canvas ? !fromGta : map.flipY
          }
          m.material = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xb08a72, roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.35 })
        })
        if (fromGta) {
          // Fötterna på golvet, oavsett exakt rot-höjd.
          const box = new THREE.Box3().setFromObject(obj)
          c.gtaRoot.position.y = -box.min.y
          c.gtaRoot.add(obj)
        } else c.plainRoot.add(obj)
        obj.visible = showBody
        c.ped = obj
      })
      .catch((e) => notify(`${t('Basmodell')}: ${e.message}`, 'error'))
    return () => {
      alive = false
      c.gtaRoot.position.y = GTA_ROOT_HEIGHT
    }
  }, [basePed, gender, pedTextures, notify]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctx.current.ped) ctx.current.ped.visible = showBody
  }, [showBody])

  // ---- Plagg ----
  useEffect(() => {
    const c = ctx.current
    // Som i spelet: ett plagg per kategori (det senast valda), så att plaggen inte ligger i lager på varandra.
    const visible = items.filter((i) => i.gender === gender && i.preview && (onlySelected ? i.id === selectedItemId : outfit[`${i.gender}:${i.category}`] === i.id))
    const wanted = new Set(visible.map((i) => i.id))
    for (const [id, entry] of c.models) {
      if (!wanted.has(id) || entry.file !== items.find((i) => i.id === id)?.preview) {
        entry.group.removeFromParent()
        c.models.delete(id)
        if (!wanted.has(id)) uvCache.delete(id)
      }
    }
    for (const item of visible) {
      let entry = c.models.get(item.id)
      if (!entry) {
        entry = { file: item.preview, group: new THREE.Group(), isGlb: ['glb', 'gltf'].includes(extOf(item.preview.name)) }
        c.models.set(item.id, entry)
        ;(extOf(item.preview.name) === 'glb' && item.previewFromYdd ? c.gtaRoot : c.plainRoot).add(entry.group)
        loadModel(item.preview)
          .then((obj) => {
            if (c.models.get(item.id) !== entry) return
            uvCache.set(item.id, collectUV(obj, entry.isGlb))
            entry.group.add(obj)
            emit('uv', item.id)
            emit('refresh-3d')
          })
          .catch((e) => notify(`${item.name}: ${e.message}`, 'error'))
      }
      entry.group.position.set(...item.offset)
      entry.group.scale.setScalar(item.scale)
      entry.group.visible = !item.hidden
      applyTexture(c, entry, item, item.id === selectedItemId ? selectedTextureId : null, wire)
    }
  }, [items, gender, selectedItemId, selectedTextureId, onlySelected, wire, notify, outfit])

  useEffect(
    () =>
      on('refresh-3d', () => {
        const c = ctx.current
        const st = useStore.getState()
        for (const [id, entry] of c.models) {
          const item = st.items.find((i) => i.id === id)
          if (item) applyTexture(c, entry, item, id === st.selectedItemId ? st.selectedTextureId : null, wire)
        }
      }),
    [wire]
  )

  useEffect(
    () =>
      on('texture-dirty', (texId) => {
        const t = ctx.current.textures.get(texId)
        if (t) t.needsUpdate = true
      }),
    []
  )

  const camTo = (angle, height = 1.1, target = 0.95, dist = 3.4) => {
    const { camera, controls, turn } = ctx.current
    setSpin(false)
    turn.rotation.y = 0
    camera.position.set(Math.sin(angle) * dist, height, Math.cos(angle) * dist)
    controls.target.set(0, target, 0)
  }

  const screenshot = () => {
    const a = document.createElement('a')
    a.href = ctx.current.renderer.domElement.toDataURL('image/png')
    a.download = 'alex_clothes_3d.png'
    a.click()
  }

  const canGta = desktop && blender?.ok

  return (
    <div className="relative h-full min-h-0 bg-ink-950">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
        <Toggle on={showBody} set={setShowBody}>{t('Kropp')}</Toggle>
        <Toggle on={!onlySelected} set={(on) => setOnlySelected(!on)}>{t('Visa hela outfiten')}</Toggle>
        <Toggle on={wire} set={setWire}>{t('Trådnät')}</Toggle>
        <Toggle on={spin} set={setSpin}>{t('Snurra')}</Toggle>
        <select value={light} onChange={(e) => setLight(e.target.value)} className="h-7 rounded-md border border-ink-800 bg-ink-900/90 px-1.5 text-xs text-ink-300">
          <option value="studio">{t('Ljus: studio')}</option>
          <option value="dag">{t('Ljus: dag')}</option>
          <option value="natt">{t('Ljus: natt')}</option>
        </select>
      </div>
      <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-1">
        <Button size="sm" onClick={() => camTo(0)}>{t('Fram')}</Button>
        <Button size="sm" onClick={() => camTo(Math.PI / 2)}>{t('Sida')}</Button>
        <Button size="sm" onClick={() => camTo(Math.PI)}>{t('Bak')}</Button>
        <Button size="sm" title={t('Zooma på överkroppen')} onClick={() => camTo(0, 1.35, 1.3, 1.6)}>{t('Överkropp')}</Button>
        <Button size="sm" title={t('Zooma på fötterna')} onClick={() => camTo(0, 0.4, 0.2, 1.3)}>{t('Fötter')}</Button>
        <Button size="sm" title={t('Spara bild')} onClick={screenshot}>{t('Bild')}</Button>
      </div>
      {pedBusy && <div className="absolute right-3 top-12 rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-ink-300">{pedBusy}</div>}
      {!basePed[gender] && !pedBusy && (
        <div className="absolute bottom-3 left-3 max-w-sm rounded-md border border-ink-700 bg-ink-900/95 p-3 text-xs leading-relaxed text-ink-300">
          <p className="mb-1 font-medium text-ink-100">{t('Använd GTA:s riktiga {p}', { p: gender === 'male' ? 'mp_m_freemode_01' : 'mp_f_freemode_01' })}</p>
          <p className="mb-2 text-ink-400">
            {t('Hämtas direkt ur ditt GTA V med originalskelettet (.yft) – eller välj mappen du exporterat från OpenIV.')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {canGta && (
              <>
                <Button size="sm" variant="primary" onClick={pedsFromGta}>
                  {t('Hämta från mitt GTA')}
                </Button>
                <Button size="sm" onClick={() => pedFromFolder(gender)}>
                  {t('Välj mapp…')}
                </Button>
                <FilePick size="sm" multiple accept=".ydd,.yft,.ytd" onFiles={(f) => importPedFromGta(gender, f)}>
                  {t('Välj filer…')}
                </FilePick>
              </>
            )}
            <FilePick size="sm" accept=".obj,.fbx,.glb,.gltf" onFiles={([f]) => setBasePed(gender, f)}>
              {canGta ? '.obj/.fbx' : t('Välj .obj/.fbx/.glb')}
            </FilePick>
          </div>
          {desktop && !blender?.ok && <p className="mt-2 text-accent">{t('Blender + Sollumz hittades inte – se Inställningar.')}</p>}
        </div>
      )}
    </div>
  )
}

function canvasMap(c, entry, item, tex) {
  let map = c.textures.get(tex.id)
  const size = `${tex.canvas.width}x${tex.canvas.height}`
  if (!map || map.image !== tex.canvas || map.userData.size !== size) {
    map?.dispose()
    map = new THREE.CanvasTexture(tex.canvas)
    map.userData.size = size
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    c.textures.set(tex.id, map)
  }
  // glTF har UV-origo uppe till vänster, OBJ/FBX nere till vänster.
  const flipY = entry.isGlb ? !!item.flipUV : !item.flipUV
  // Ladda bara upp texturen till grafikkortet igen när den faktiskt har ändrats.
  if (map.userData.version !== tex.version || map.flipY !== flipY) {
    map.flipY = flipY
    map.userData.version = tex.version
    map.needsUpdate = true
  }
  return map
}

function applyTexture(c, entry, item, selectedTexId, wire) {
  const tex = item.textures.find((x) => x.id === selectedTexId) || item.textures[0]
  const map = tex?.canvas ? canvasMap(c, entry, item, tex) : null
  const family = tex ? texFamily(tex.name) : ''
  entry.group.traverse((m) => {
    if (!m.isMesh) return
    if (!m.userData.ownMat) {
      // Kom ihåg modellens egen textur – plagg med flera texturer visar rätt textur på varje del.
      m.userData.key = texKey(m.material?.name)
      m.userData.origMap = m.material?.map || null
      m.material = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.35 })
      m.userData.ownMat = true
    }
    let use = map
    const key = m.userData.key
    if ((item.materials?.length || 0) > 1 && key && texFamily(key) !== family) {
      const own = item.textures.find((x) => texKey(x.name) === key)
      use = own?.canvas ? canvasMap(c, entry, item, own) : m.userData.origMap
    }
    // Byt bara när något ändrats – needsUpdate bygger om shadern och är dyrt.
    if (m.material.map !== use || m.material.wireframe !== wire) {
      m.material.map = use
      m.material.color.set(use ? 0xffffff : 0x8a8a8a)
      m.material.wireframe = wire
      m.material.needsUpdate = true
    }
  })
}

// Enkel mannekäng när ingen riktig basmodell är laddad.
function placeholderBody() {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 })
  const part = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    g.add(m)
  }
  part(new THREE.SphereGeometry(0.11, 24, 16), 0, 1.62, 0)
  part(new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), 0, 1.2, 0)
  part(new THREE.CapsuleGeometry(0.06, 0.55, 4, 12), -0.25, 1.15, 0)
  part(new THREE.CapsuleGeometry(0.06, 0.55, 4, 12), 0.25, 1.15, 0)
  part(new THREE.CapsuleGeometry(0.08, 0.75, 4, 12), -0.1, 0.48, 0)
  part(new THREE.CapsuleGeometry(0.08, 0.75, 4, 12), 0.1, 0.48, 0)
  return g
}

function Toggle({ on, set, children }) {
  return (
    <button
      onClick={() => set(!on)}
      className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${on ? 'border-ink-600 bg-ink-700 text-ink-100' : 'border-ink-800 bg-ink-900/90 text-ink-400 hover:text-ink-200'}`}
    >
      {children}
    </button>
  )
}
