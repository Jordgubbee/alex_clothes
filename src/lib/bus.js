// Lättviktiga händelser mellan 2D- och 3D-vyn som inte behöver gå via React.
export const bus = new EventTarget()
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }))
export const on = (type, fn) => {
  const h = (e) => fn(e.detail)
  bus.addEventListener(type, h)
  return () => bus.removeEventListener(type, h)
}

// UV-linjer per plagg, satta av 3D-vyn när en modell laddats. Värden: Float32Array [u0,v0,u1,v1,...]
export const uvCache = new Map()
