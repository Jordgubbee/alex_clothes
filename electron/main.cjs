const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { spawn } = require('child_process')

const isDev = !app.isPackaged
const DATA = app.getPath('userData')
const SETTINGS = path.join(DATA, 'settings.json')
const CACHE = path.join(DATA, 'cache')
const PEDS = path.join(DATA, 'peds')
// Blender kan inte läsa filer inuti app.asar, därför packas skriptet upp bredvid.
const BRIDGE = path.join(__dirname, 'blender_bridge.py').replace('app.asar', 'app.asar.unpacked')
const EXTRACT = path.join(__dirname, 'extract_freemode.ps1').replace('app.asar', 'app.asar.unpacked')
const BUILD_YMT = path.join(__dirname, 'build_ymt.ps1').replace('app.asar', 'app.asar.unpacked')
// CodeWalker.Core (MIT) följer med appen, så användaren behöver inte installera CodeWalker.
const BUNDLED_CW = isDev ? path.join(__dirname, '..', 'vendor', 'gtareader') : path.join(process.resourcesPath, 'gtareader')
const PED_MODELS = { male: 'mp_m_freemode_01', female: 'mp_f_freemode_01' }

for (const d of [CACHE, PEDS]) fs.mkdirSync(d, { recursive: true })

let win

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'))
  } catch {
    return {}
  }
}
function writeSettings(s) {
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2))
}

// Letar upp senaste Blender-versionen i de vanliga installationsmapparna.
function detectBlender() {
  const roots = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation'),
    'C:\\Program Files (x86)\\Steam\\steamapps\\common',
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
  ]
  const found = []
  for (const root of roots) {
    let dirs = []
    try {
      dirs = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const d of dirs) {
      if (!/blender/i.test(d)) continue
      const exe = path.join(root, d, 'blender.exe')
      if (fs.existsSync(exe)) found.push({ exe, version: parseFloat((d.match(/(\d+\.\d+)/) || [0, 0])[1]) })
    }
  }
  found.sort((a, b) => b.version - a.version)
  return found[0]?.exe || null
}

const HOME = app.getPath('home')
const firstExisting = (list) => list.find((p) => p && fs.existsSync(p)) || null

function detectGta() {
  return firstExisting(
    [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
      'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
      'C:\\Program Files\\Epic Games\\GTAV',
      'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
      'E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
      'D:\\Games\\Grand Theft Auto V',
    ].filter((p) => fs.existsSync(path.join(p, 'x64v.rpf')))
  )
}

function toolPath(key, detect) {
  const s = readSettings()
  if (s[key] && fs.existsSync(s[key])) return s[key]
  const found = detect()
  if (found) writeSettings({ ...readSettings(), [key]: found })
  return found
}

// Kör ett av PowerShell-skripten och returnerar texten efter ALEX_OK.
function runPs(script, args) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true })
    let text = ''
    p.stdout.on('data', (d) => (text += d))
    p.stderr.on('data', (d) => (text += d))
    p.on('error', reject)
    p.on('close', () => {
      const ok = text.match(/ALEX_OK ?(.*)/)
      if (ok) resolve(ok[1].trim())
      else reject(new Error((text.match(/ALEX_ERR (.*)/) || [0, 'CodeWalker svarade inte.'])[1].trim()))
    })
  })
}

const hasCw = (dir) => dir && fs.existsSync(path.join(dir, 'CodeWalker.Core.dll'))
function codewalkerPath() {
  const s = readSettings()
  return hasCw(s.codewalkerPath) ? s.codewalkerPath : BUNDLED_CW
}

// Sparar en färdig gubbe: 3D-modell + hudtexturer.
async function savePed(gender, files) {
  const models = files.filter((f) => /\.(ydd|ydr|yft)$/i.test(f.name))
  if (!models.some((f) => /\.yd[dr]$/i.test(f.name))) throw new Error('Välj minst en .ydd från freemode-mappen (t.ex. head_000_r.ydd, uppr_000_r.ydd, lowr_000_r.ydd).')
  const glb = await convert(models)
  fs.writeFileSync(path.join(PEDS, `${gender}.glb`), glb)
  const tdir = path.join(PEDS, `${gender}_ytd`)
  fs.rmSync(tdir, { recursive: true, force: true })
  fs.mkdirSync(tdir)
  for (const f of files.filter((f) => /\.ytd$/i.test(f.name))) fs.writeFileSync(path.join(tdir, path.basename(f.name)), Buffer.from(f.data))
}

const readDir = (dir) => fs.readdirSync(dir).map((name) => ({ name, data: fs.readFileSync(path.join(dir, name)) }))

function blenderPath() {
  const s = readSettings()
  if (s.blenderPath && fs.existsSync(s.blenderPath)) return s.blenderPath
  const found = detectBlender()
  if (found) writeSettings({ ...s, blenderPath: found })
  return found
}

// Kör bryggskriptet i bakgrunden och returnerar texten efter ALEX_OK.
function runBridge(args, { background = true, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const exe = blenderPath()
    if (!exe) return reject(new Error('Hittar inte Blender. Välj blender.exe under Inställningar.'))
    const argv = [...(background ? ['-b'] : []), '--python', BRIDGE, '--', ...args]
    const p = spawn(exe, argv, { windowsHide: background })
    let out = ''
    let partial = ''
    p.stdout.on('data', (d) => {
      out += d
      if (onLine) {
        const lines = (partial + d).split(/\r?\n/)
        partial = lines.pop()
        lines.forEach(onLine)
      }
      const m = out.match(/ALEX_OK ?(.*)/)
      if (!background && m) resolve(m[1].trim())
    })
    p.stderr.on('data', (d) => (out += d))
    p.on('error', reject)
    p.on('close', () => {
      // Hela utskriften sparas så att fel går att felsöka i efterhand.
      try {
        fs.writeFileSync(path.join(DATA, 'blender-last.log'), `${argv.join(' ')}\n\n${out}`)
      } catch {
        // Loggen är bara ett hjälpmedel.
      }
      const okm = out.match(/ALEX_OK ?(.*)/)
      const errm = out.match(/ALEX_ERR (.*)/)
      if (okm) resolve(okm[1].trim())
      else reject(new Error(errm ? errm[1].trim() : 'Blender avslutades utan svar.'))
    })
  })
}

const hash = (buffers) => {
  const h = crypto.createHash('sha1')
  for (const b of buffers) h.update(Buffer.from(b))
  return h.digest('hex')
}

// Skriver filerna i en egen tillfällig mapp så att Sollumz hittar .yft-skelettet bredvid.
function writeTemp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-'))
  return { dir, paths: files.map((f) => {
    const p = path.join(dir, path.basename(f.name))
    fs.writeFileSync(p, Buffer.from(f.data))
    return p
  }) }
}

async function convert(files) {
  const key = hash(files.map((f) => f.data))
  const out = path.join(CACHE, `${key}.glb`)
  if (!fs.existsSync(out)) {
    const { dir, paths } = writeTemp(files)
    try {
      // .yft används bara som skelett; den ska inte importeras som modell.
      const args = ['convert', out, ...paths.filter((p) => !p.toLowerCase().endsWith('.yft'))]
      // En ny körning om Blender krånglar en gång (t.ex. om en annan Blender höll på samtidigt).
      await runBridge(args).catch(() => runBridge(args))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  return fs.readFileSync(out)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#121212',
    title: 'alex_clothes',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (isDev) win.loadURL('http://localhost:5178')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('settings:get', () => ({
  ...readSettings(),
  blenderPath: blenderPath(),
  gtaPath: toolPath('gtaPath', detectGta),
  codewalkerPath: codewalkerPath(),
  codewalkerBundled: codewalkerPath() === BUNDLED_CW,
}))
ipcMain.handle('settings:pickBlender', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Välj blender.exe', filters: [{ name: 'Blender', extensions: ['exe'] }], properties: ['openFile'] })
  if (r.canceled) return null
  writeSettings({ ...readSettings(), blenderPath: r.filePaths[0] })
  return r.filePaths[0]
})
ipcMain.handle('blender:check', async () => {
  try {
    return { ok: true, mode: await runBridge(['check']), blender: blenderPath() }
  } catch (e) {
    return { ok: false, error: e.message, blender: blenderPath() }
  }
})
ipcMain.handle('blender:convert', (_e, files, gender) => convert(gender ? withSkeleton(files, gender) : files))

// Freemode-skelettet (.yft) som plocades ut ur spelet. Läggs bredvid plagget så att Sollumz
// läser in benen rätt och viktningen bevaras när plagget sparas igen.
function skeletonFor(gender) {
  const model = PED_MODELS[gender]
  const p = model && path.join(PEDS, 'gta_files', model, `${model}.yft`)
  return p && fs.existsSync(p) ? { name: `${model}.yft`, data: fs.readFileSync(p) } : null
}
const withSkeleton = (files, gender) => {
  // Props (hattar, glasögon …) sitter på ett ben och ska inte läsas in mot hela skelettet.
  if (files.some((f) => /(^|\^)p_[a-z]+_\d{3}/i.test(f.name))) return files
  const skel = skeletonFor(gender)
  return skel && !files.some((f) => /\.yft$/i.test(f.name)) ? [...files, skel] : files
}

// Konverterar många plagg i en Blender-start. Varje färdigt plagg skickas direkt till fönstret
// ('convert:done'), så att 3D-vyn fylls på medan resten fortfarande byggs.
ipcMain.handle('blender:convertMany', async (_e, jobs) => {
  const send = (d) => win?.webContents.send('convert:done', d)
  const pending = []
  const dirs = []
  for (const job of jobs) {
    const files = withSkeleton(job.files, job.gender)
    const key = hash(files.map((f) => f.data))
    const glb = path.join(CACHE, `${key}.glb`)
    const mats = path.join(CACHE, `${key}.mats.json`)
    if (fs.existsSync(glb) && fs.existsSync(mats)) {
      send({ id: job.id, glb: fs.readFileSync(glb), materials: JSON.parse(fs.readFileSync(mats, 'utf8')) })
      continue
    }
    const { dir, paths } = writeTemp(files)
    dirs.push(dir)
    pending.push({ id: job.id, glb, mats, inputs: paths.filter((p) => !/\.yft$/i.test(p)) })
  }
  if (!pending.length) return { converted: 0 }
  const listDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-batch-'))
  dirs.push(listDir)
  const list = path.join(listDir, 'jobs.json')
  fs.writeFileSync(list, JSON.stringify(pending.map((p) => ({ inputs: p.inputs, glb: p.glb }))))
  try {
    await runBridge(['batch', list], {
      onLine: (line) => {
        const done = line.match(/^ALEX_DONE (.*)/)
        const fail = line.match(/^ALEX_FAIL (.*)/)
        if (done) {
          const { i, materials } = JSON.parse(done[1])
          const p = pending[i]
          fs.writeFileSync(p.mats, JSON.stringify(materials))
          send({ id: p.id, glb: fs.readFileSync(p.glb), materials })
        } else if (fail) {
          const { i, error } = JSON.parse(fail[1])
          send({ id: pending[i].id, error })
        }
      },
    })
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
  }
  return { converted: pending.length }
})

// Slår ihop flera texturer till en i modellen (UV flyttas till rutor i en atlas).
ipcMain.handle('blender:merge', async (_e, { gender, ydd, spec }) => {
  const { dir, paths } = writeTemp(withSkeleton([ydd], gender))
  try {
    const specPath = path.join(dir, 'spec.json')
    fs.writeFileSync(specPath, JSON.stringify(spec))
    const out = await runBridge(['merge', paths[0], path.join(dir, 'out'), specPath])
    return { name: path.basename(out), data: fs.readFileSync(out) }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

ipcMain.handle('blender:materials', async (_e, { gender, ydd }) => {
  const key = hash([ydd.data])
  const cache = path.join(CACHE, `${key}.materials.json`)
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'))
  const { dir, paths } = writeTemp(withSkeleton([ydd], gender))
  try {
    const list = JSON.parse(await runBridge(['materials', paths[0]]))
    fs.writeFileSync(cache, JSON.stringify(list))
    return list
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Bygger .ymt (CPedVariationInfo) från XML med CodeWalker och läser tillbaka varje fil som kontroll.
ipcMain.handle('ymt:build', async (_e, jobs) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-ymt-'))
  try {
    const lines = jobs.map((j, i) => {
      const xml = path.join(dir, `${i}.ymt.xml`)
      fs.writeFileSync(xml, j.xml, 'utf8')
      return `${xml}|${path.join(dir, `${i}.ymt`)}`
    })
    fs.writeFileSync(path.join(dir, 'jobs.txt'), lines.join('\n'))
    await runPs(BUILD_YMT, ['-CodeWalker', codewalkerPath(), '-Jobs', path.join(dir, 'jobs.txt')])
    return jobs.map((j, i) => ({ name: j.name, data: fs.readFileSync(path.join(dir, `${i}.ymt`)) }))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

ipcMain.handle('blender:ytd', async (_e, { name, textures }) => {
  const { dir, paths } = writeTemp(textures)
  try {
    const out = await runBridge(['ytd', dir, name, ...paths])
    return fs.readFileSync(out)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Öppnar plagget i Blender. När användaren klickar "Skicka till alex_clothes" skickas den nya .ydd:n tillbaka.
ipcMain.handle('blender:edit', async (_e, { itemId, files, gender }) => {
  const { dir, paths } = writeTemp(withSkeleton(files, gender))
  const outDir = path.join(dir, 'out')
  fs.mkdirSync(outDir)
  const ydd = paths.find((p) => p.toLowerCase().endsWith('.ydd'))
  await runBridge(['edit', ydd, outDir], { background: false })
  const timer = setInterval(() => {
    const done = path.join(outDir, '.done')
    if (!fs.existsSync(done)) return
    fs.rmSync(done)
    const found = fs.readdirSync(outDir).filter((f) => f.toLowerCase().endsWith('.ydd'))
    if (!found.length) return win?.webContents.send('blender:edited', { itemId, error: 'Sollumz skapade ingen .ydd.' })
    const file = found[0]
    win?.webContents.send('blender:edited', { itemId, name: file, data: fs.readFileSync(path.join(outDir, file)) })
  }, 700)
  setTimeout(() => clearInterval(timer), 1000 * 60 * 60 * 6)
  return true
})

// Basmodeller (freemode-gubbarna) sparas så att de laddas direkt nästa gång.
ipcMain.handle('ped:get', (_e, gender) => {
  const glb = path.join(PEDS, `${gender}.glb`)
  if (!fs.existsSync(glb)) return null
  const textures = []
  const tdir = path.join(PEDS, `${gender}_ytd`)
  if (fs.existsSync(tdir)) for (const f of fs.readdirSync(tdir)) textures.push({ name: f, data: fs.readFileSync(path.join(tdir, f)) })
  return { glb: fs.readFileSync(glb), textures }
})
ipcMain.handle('ped:set', async (_e, { gender, files }) => {
  await savePed(gender, files)
  return true
})

// Hämtar båda freemode-gubbarna direkt ur användarens GTA V via CodeWalker, med originalskelettet (.yft).
ipcMain.handle('ped:fromGta', async () => {
  const gta = toolPath('gtaPath', detectGta)
  if (!gta) throw new Error('Hittar inte GTA V. Välj spelmappen under Inställningar.')
  const out = path.join(PEDS, 'gta_files')
  fs.rmSync(out, { recursive: true, force: true })
  await runPs(EXTRACT, ['-CodeWalker', codewalkerPath(), '-Gta', gta, '-Out', out])
  const done = []
  for (const [gender, model] of Object.entries(PED_MODELS)) {
    const dir = path.join(out, model)
    if (!fs.existsSync(dir)) continue
    win?.webContents.send('ped:progress', `Sollumz bygger ${model}…`)
    await savePed(gender, readDir(dir))
    done.push(gender)
  }
  return done
})

// Läser in en mapp som exporterats från OpenIV (t.ex. hela mp_m_freemode_01-mappen).
ipcMain.handle('ped:fromFolder', async (_e, gender) => {
  const r = await dialog.showOpenDialog(win, { title: `Välj mappen ${PED_MODELS[gender]}`, properties: ['openDirectory'] })
  if (r.canceled) return false
  const files = readDir(r.filePaths[0]).filter((f) => /^(mp_[mf]_freemode_01\.yft|(head|uppr|lowr|feet)_000_[ru]\.ydd|(head|uppr|lowr|feet)_diff_000_a_(whi|uni)\.ytd)$/i.test(f.name))
  await savePed(gender, files)
  return true
})

ipcMain.handle('settings:pickFolder', async (_e, key) => {
  const titles = { gtaPath: 'Välj GTA V-mappen (där GTA5.exe ligger)', codewalkerPath: 'Välj CodeWalker-mappen' }
  const r = await dialog.showOpenDialog(win, { title: titles[key], properties: ['openDirectory'] })
  if (r.canceled) return null
  writeSettings({ ...readSettings(), [key]: r.filePaths[0] })
  return r.filePaths[0]
})
ipcMain.handle('ped:clear', (_e, gender) => {
  fs.rmSync(path.join(PEDS, `${gender}.glb`), { force: true })
  fs.rmSync(path.join(PEDS, `${gender}_ytd`), { recursive: true, force: true })
  return true
})
ipcMain.handle('open:external', (_e, url) => shell.openExternal(url))

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
