const { contextBridge, ipcRenderer } = require('electron')

// Allt som webbsidan får göra mot datorn går genom det här objektet.
contextBridge.exposeInMainWorld('alex', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  pickBlender: () => ipcRenderer.invoke('settings:pickBlender'),
  checkBlender: () => ipcRenderer.invoke('blender:check'),
  convert: (files, gender) => ipcRenderer.invoke('blender:convert', files, gender),
  materials: (gender, ydd) => ipcRenderer.invoke('blender:materials', { gender, ydd }),
  buildYtd: (name, textures) => ipcRenderer.invoke('blender:ytd', { name, textures }),
  convertMany: (jobs) => ipcRenderer.invoke('blender:convertMany', jobs),
  onConverted: (fn) => {
    const h = (_e, d) => fn(d)
    ipcRenderer.on('convert:done', h)
    return () => ipcRenderer.removeListener('convert:done', h)
  },
  buildYmt: (jobs) => ipcRenderer.invoke('ymt:build', jobs),
  mergeTextures: (args) => ipcRenderer.invoke('blender:merge', args),
  editInBlender: (itemId, files, gender) => ipcRenderer.invoke('blender:edit', { itemId, files, gender }),
  onEdited: (fn) => {
    const h = (_e, d) => fn(d)
    ipcRenderer.on('blender:edited', h)
    return () => ipcRenderer.removeListener('blender:edited', h)
  },
  getPed: (gender) => ipcRenderer.invoke('ped:get', gender),
  setPed: (gender, files) => ipcRenderer.invoke('ped:set', { gender, files }),
  clearPed: (gender) => ipcRenderer.invoke('ped:clear', gender),
  pedsFromGta: () => ipcRenderer.invoke('ped:fromGta'),
  pedFromFolder: (gender) => ipcRenderer.invoke('ped:fromFolder', gender),
  pickFolder: (key) => ipcRenderer.invoke('settings:pickFolder', key),
  onPedProgress: (fn) => {
    const h = (_e, d) => fn(d)
    ipcRenderer.on('ped:progress', h)
    return () => ipcRenderer.removeListener('ped:progress', h)
  },
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
})
