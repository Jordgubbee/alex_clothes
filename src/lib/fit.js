// Passform: flytta, rotera, skala och "blås upp" ett plagg så att det sitter rätt på peden.
// Samma värden används i 3D-vyn och när passformen sparas i .ydd:n (Blender), så att det man ser
// är det man får i spelet. Koordinater i 3D-vyns system (glTF: Y uppåt, meter).
import * as THREE from 'three'

// Plaggets mittpunkt per plagg-id, satt av 3D-vyn när modellen laddats (behövs när passformen sparas i .ydd:n).
export const pivots = new Map()

export const IDENTITY_FIT ={ x: 0, y: 0, z: 0, rotY: 0, scale: 1, sx: 1, sy: 1, sz: 1, inflate: 0 }

// Äldre projekt hade bara offset + scale.
export function fitOf(item) {
  if (item.fit) return { ...IDENTITY_FIT, ...item.fit }
  const [x, y, z] = item.offset || [0, 0, 0]
  return { ...IDENTITY_FIT, x, y, z, scale: item.scale ?? 1 }
}

export const isIdentity = (f) => Object.keys(IDENTITY_FIT).every((k) => Math.abs((f[k] ?? IDENTITY_FIT[k]) - IDENTITY_FIT[k]) < 1e-6)

// Matrisen runt plaggets mittpunkt (pivot): M = T(pivot + t) · R(y) · S · T(−pivot).
export function fitMatrix(fit, pivot) {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(fit.rotY))
  const s = new THREE.Vector3(fit.scale * fit.sx, fit.scale * fit.sy, fit.scale * fit.sz)
  m.compose(new THREE.Vector3(pivot.x + fit.x, pivot.y + fit.y, pivot.z + fit.z), q, s)
  return m.multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
}

// Sparar originalpositionerna så att "blås upp" kan räknas om från början varje gång.
export function captureGeometry(obj) {
  obj.traverse((m) => {
    if (!m.isMesh || m.userData.origPos) return
    const g = m.geometry
    if (!g.attributes.normal) g.computeVertexNormals()
    m.userData.origPos = g.attributes.position.array.slice()
  })
}

// Flyttar varje vertex längs sin normal (meter). Positivt = tyget trycks ut från kroppen.
export function applyInflate(obj, meters) {
  obj.traverse((m) => {
    if (!m.isMesh || !m.userData.origPos) return
    const g = m.geometry
    const pos = g.attributes.position
    const nrm = g.attributes.normal
    const orig = m.userData.origPos
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] = orig[i * 3] + nrm.getX(i) * meters
      pos.array[i * 3 + 1] = orig[i * 3 + 1] + nrm.getY(i) * meters
      pos.array[i * 3 + 2] = orig[i * 3 + 2] + nrm.getZ(i) * meters
    }
    pos.needsUpdate = true
    g.computeBoundingSphere()
  })
}

// Värdena för Blender (Z uppåt): Blender (x, y, z) = glTF (x, −z, y).
// Rotation runt glTF:s Y = rotation runt Blenders Z.
export function fitForBlender(fit, pivot) {
  const toB = (v) => [v.x, -v.z, v.y]
  return {
    t: toB({ x: fit.x, y: fit.y, z: fit.z }),
    pivot: toB(pivot),
    rotZ: fit.rotY,
    scale: [fit.scale * fit.sx, fit.scale * fit.sz, fit.scale * fit.sy],
    inflate: fit.inflate / 1000,
  }
}
