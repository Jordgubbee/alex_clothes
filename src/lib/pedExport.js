// Export av egna peds som en hel, fungerande ped: pedens alla filer (.yft, .ydd, .ytd, .ymt …) med
// dina ändringar, en uppdaterad .ymt om du lagt till nya plagg, och peds.meta om det är en addon-ped.
import { categoryByKey, PEDS } from './categories'
import { desktop } from './desktop'
import { t } from './i18n'
import { readYTD } from './ytd'

// Pedens filer heter utan prefix i appen (uppr_000_u.ydd). I stream-mappen får de pedens namn
// framför: s_m_y_cop_01^uppr_000_u.ydd, och props s_m_y_cop_01_p^p_head_000.ydd. Filer som redan
// heter som peden (s_m_y_cop_01.ydd, s_m_y_cop_01.yft, s_m_y_cop_01_p.ytd …) behåller sitt namn.
export function streamName(model, name) {
  const lower = name.toLowerCase()
  if (lower.startsWith(`${model.toLowerCase()}.`) || lower.startsWith(`${model.toLowerCase()}_p.`)) return name
  return /^p_/i.test(name) ? `${model}_p^${name}` : `${model}^${name}`
}

// Peden har allt i en fil (s_m_y_cop_01.ydd) eller en fil per plagg (uppr_000_u.ydd).
export const isCompoundPed = (model, names) => names.some((n) => n.toLowerCase() === `${model.toLowerCase()}.ydd`)

// Hur många modeller peden själv har per del (uppr: 3 betyder uppr_000–002).
export function pedDrawableCounts(names) {
  const counts = {}
  for (const n of names) {
    const m = n.toLowerCase().match(/^(p_[a-z]+|[a-z]+)_(\d{3})(_[ru])?\.ydd$/)
    if (m) counts[m[1]] = Math.max(counts[m[1]] || 0, parseInt(m[2], 10) + 1)
  }
  return counts
}

const TEXTURE = (texId) => `<Item><texId value="${texId}" /><distribution value="255" /></Item>`
const DRAWABLE = (n, skin) =>
  `<Item><propMask value="${skin ? 17 : 1}" /><numAlternatives value="0" /><aTexData itemType="CPVTextureData">${TEXTURE(skin ? 1 : 0).repeat(n)}</aTexData><clothData><ownsCloth value="false" /></clothData></Item>`
const COMP_INFO = (comp, drawable) =>
  `<Item><pedXml_audioID>none</pedXml_audioID><pedXml_audioID2>none</pedXml_audioID2><pedXml_expressionMods>0 0 0 0 0</pedXml_expressionMods><flags value="0" /><inclusions>0</inclusions><exclusions>0</exclusions><pedXml_vfxComps>PV_COMP_HEAD</pedXml_vfxComps><pedXml_flags value="0" /><pedXml_compIdx value="${comp}" /><pedXml_drawblIdx value="${drawable}" /></Item>`

const parse = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error(t('Pedens .ymt gick inte att läsa.'))
  return doc
}
const fragment = (doc, xml) => doc.importNode(parse(xml).documentElement, true)
const kids = (el, name) => [...(el?.children || [])].filter((c) => c.tagName === name)
const child = (el, name) => kids(el, name)[0]

/**
 * Lägger in pedens plagg i dess .ymt (CPedVariationInfo): nya modeller läggs till efter pedens egna,
 * och antalet färgvarianter följer plagget. Returnerar null om inget behöver ändras.
 */
export function patchPedYmt(xml, items) {
  const doc = parse(xml)
  const root = doc.documentElement
  const availEl = child(root, 'availComp')
  const avail = availEl.textContent.trim().split(/\s+/).map(Number)
  const compData = child(root, 'aComponentData3')
  const compItems = kids(compData, 'Item')
  // Delarna som finns, per komponent-id (0–11).
  const comps = new Map()
  avail.forEach((idx, id) => idx !== 255 && compItems[idx] && comps.set(id, compItems[idx]))
  let changed = false

  for (const item of items) {
    const cat = categoryByKey(item.category)
    if (!cat || cat.prop) continue
    let comp = comps.get(cat.id)
    if (!comp) {
      comp = fragment(doc, `<Item><numAvailTex value="0" /><aDrawblData3 itemType="CPVDrawblData"></aDrawblData3></Item>`)
      comps.set(cat.id, comp)
      changed = true
    }
    const list = child(comp, 'aDrawblData3')
    const drawables = kids(list, 'Item')
    const n = Math.max(1, item.textures.length)
    if (item.slot > drawables.length) throw new Error(t('{x}: nummer {n} hoppar över ett nummer. Nästa lediga är {f}.', { x: `${t(cat.label)} · ${item.name}`, n: item.slot, f: drawables.length }))
    if (item.slot === drawables.length) {
      list.appendChild(fragment(doc, DRAWABLE(n, item.skin)))
      changed = true
      continue
    }
    const tex = child(drawables[item.slot], 'aTexData')
    const have = kids(tex, 'Item')
    const texId = child(have[0], 'texId')?.getAttribute('value') || (item.skin ? '1' : '0')
    if (have.length === n) continue
    for (const extra of have.slice(n)) tex.removeChild(extra)
    for (let i = have.length; i < n; i++) tex.appendChild(fragment(doc, TEXTURE(texId)))
    changed = true
  }
  if (!changed) return null
  finishYmt(doc, comps)
  return new XMLSerializer().serializeToString(doc)
}

// Delarna i id-ordning, availComp pekar på deras plats, numAvailTex = alla färgvarianter i delen,
// och en compInfos-rad per modell.
function finishYmt(doc, comps) {
  const root = doc.documentElement
  const availEl = child(root, 'availComp')
  const compData = child(root, 'aComponentData3')
  while (compData.firstChild) compData.removeChild(compData.firstChild)
  const ids = [...comps.keys()].sort((a, b) => a - b)
  const order = new Array(12).fill(255)
  ids.forEach((id, i) => {
    const comp = comps.get(id)
    const total = kids(child(comp, 'aDrawblData3'), 'Item').reduce((sum, d) => sum + kids(child(d, 'aTexData'), 'Item').length, 0)
    child(comp, 'numAvailTex').setAttribute('value', String(total))
    compData.appendChild(comp)
    order[id] = i
  })
  availEl.textContent = order.join(' ')

  // compInfos: en rad per modell (komponent, nummer). Nya modeller får standardvärden.
  const infos = child(root, 'compInfos')
  if (infos) {
    const have = new Map(kids(infos, 'Item').map((el) => [`${child(el, 'pedXml_compIdx').getAttribute('value')}:${child(el, 'pedXml_drawblIdx').getAttribute('value')}`, el]))
    for (const id of ids) {
      const count = kids(child(comps.get(id), 'aDrawblData3'), 'Item').length
      for (let d = 0; d < count; d++) if (!have.has(`${id}:${d}`)) have.set(`${id}:${d}`, fragment(doc, COMP_INFO(id, d)))
    }
    while (infos.firstChild) infos.removeChild(infos.firstChild)
    const key = (k) => k.split(':').map(Number)
    for (const k of [...have.keys()].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1])) infos.appendChild(have.get(k))
  }
}

// ---- Pedens utseende i spelet ----
// GTA ger peden modell 000 och färg A, eller slumpar bland pedens varianter. Därför blir varianten du
// valt i Ped-menyn (eller den du har ändrat) nr 000/A i exporten, och med "lås" tas pedens andra
// varianter av den delen bort ur .ymt, så att spelet inte kan välja originalet.
export const COMP_KEYS = ['head', 'berd', 'hair', 'uppr', 'lowr', 'hand', 'feet', 'teef', 'accs', 'task', 'decl', 'jbib']
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

function ymtComps(doc) {
  const root = doc.documentElement
  const avail = child(root, 'availComp').textContent.trim().split(/\s+/).map(Number)
  const compItems = kids(child(root, 'aComponentData3'), 'Item')
  const comps = new Map()
  avail.forEach((idx, id) => idx !== 255 && compItems[idx] && comps.set(id, compItems[idx]))
  return comps
}

// Antal färger per modell för varje del: { head: [2, 2, 2], uppr: [3, 1] }.
export function ymtLayout(xml) {
  const out = {}
  for (const [id, comp] of ymtComps(parse(xml))) out[COMP_KEYS[id]] = kids(child(comp, 'aDrawblData3'), 'Item').map((d) => kids(child(d, 'aTexData'), 'Item').length)
  return out
}

/**
 * Vilken variant varje del får i spelet: valet i Ped-menyn, annars den modell (och färg) du har ändrat,
 * annars 000/A. layout: pedens egna modeller (ymtLayout). Delar där du lagt till nya plagg låses aldrig,
 * så att de nya plaggen går att välja i klädmenyn.
 * Returnerar { ops: { head: { drawable, letter, lock } }, hidden: ['berd'] }.
 */
export function resolvePedLook({ layout, look = {}, items = [], lock = true }) {
  const ops = {}
  const hidden = []
  for (const [key, drawables] of Object.entries(layout)) {
    const mine = items.filter((i) => i.category === key)
    const choice = look[key]
    if (choice?.slot < 0) hidden.push(key)
    let drawable = 0
    let letter = 'a'
    // Bara delar du valt eller ändrat låses – resten (t.ex. armarnas hudfärg) väljer spelet som vanligt.
    let picked = false
    if (choice && choice.slot >= 0 && choice.slot < drawables.length) {
      drawable = choice.slot
      letter = choice.letter || 'a'
      picked = true
    } else {
      const edited = mine.filter((i) => i.slot < drawables.length && i.textures.some((x) => x.edited))
      if (edited.length === 1) {
        drawable = edited[0].slot
        const letters = edited[0].textures.map((x, n) => (x.edited ? LETTERS[n] : null)).filter(Boolean)
        if (letters.length === 1) letter = letters[0]
        picked = true
      }
    }
    if (LETTERS.indexOf(letter) >= (drawables[drawable] || 1)) letter = 'a'
    const addon = mine.some((i) => i.slot >= drawables.length)
    const doLock = lock && picked && !addon && (drawables.length > 1 || (drawables[drawable] || 1) > 1)
    if (drawable !== 0 || letter !== 'a' || doLock) ops[key] = { drawable, letter, lock: doLock }
  }
  return { ops, hidden }
}

// Nytt nummer och ny bokstav för en del: den valda varianten byter plats med 000/A.
// Returnerar null om varianten tas bort (låst del).
function remap(op, n, letter) {
  const num = n === op.drawable ? 0 : n === 0 ? op.drawable : n
  let l = letter
  if (letter && num === 0) l = letter === op.letter ? 'a' : letter === 'a' ? op.letter : letter
  if (op.lock && (num !== 0 || (l && l !== 'a'))) return null
  return { num, letter: l }
}

const pad = (n) => String(n).padStart(3, '0')

/**
 * Nytt namn för en modell eller färgtextur (head_001_r, head_diff_001_b_whi, med eller utan .ydd/.ytd).
 * Samma namn tillbaka om delen inte påverkas, null om den tas bort. Normal- och spec-texturer behåller
 * sina namn – modellerna pekar på dem med namn.
 */
export function lookName(name, ops) {
  const ydd = name.match(/^([a-z]+)_(\d{3})(_[ru])?(\.ydd)?$/i)
  if (ydd) {
    const op = ops[ydd[1].toLowerCase()]
    if (!op) return name
    const r = remap(op, parseInt(ydd[2], 10), null)
    return r && `${ydd[1]}_${pad(r.num)}${ydd[3] || ''}${ydd[4] || ''}`
  }
  const tex = name.match(/^([a-z]+)_diff_(\d{3})_([a-z])((?:_[a-z]+)?)(\.ytd)?$/i)
  if (tex) {
    const op = ops[tex[1].toLowerCase()]
    if (!op) return name
    const r = remap(op, parseInt(tex[2], 10), tex[3].toLowerCase())
    return r && `${tex[1]}_diff_${pad(r.num)}_${r.letter}${tex[4]}${tex[5] || ''}`
  }
  return name
}

// Samma byte i .ymt: modellernas och färgernas ordning, och compInfos.
export function applyLookToYmt(xml, ops) {
  if (!Object.keys(ops).length) return xml
  const doc = parse(xml)
  const comps = ymtComps(doc)
  for (const [key, op] of Object.entries(ops)) {
    const id = COMP_KEYS.indexOf(key)
    const comp = comps.get(id)
    if (!comp) continue
    const list = child(comp, 'aDrawblData3')
    const drawables = kids(list, 'Item')
    const chosen = drawables[op.drawable]
    if (!chosen) continue
    if (op.drawable !== 0) {
      const first = drawables[0]
      const marker = doc.createComment('')
      list.replaceChild(marker, chosen)
      list.replaceChild(chosen, first)
      list.replaceChild(first, marker)
    }
    const texList = child(chosen, 'aTexData')
    const texs = kids(texList, 'Item')
    const li = LETTERS.indexOf(op.letter)
    if (li > 0 && texs[li]) {
      const marker = doc.createComment('')
      texList.replaceChild(marker, texs[li])
      texList.replaceChild(texs[li], texs[0])
      texList.replaceChild(texs[0], marker)
    }
    if (op.lock) {
      for (const d of kids(list, 'Item').slice(1)) list.removeChild(d)
      for (const x of kids(texList, 'Item').slice(1)) texList.removeChild(x)
    }
    const infos = child(doc.documentElement, 'compInfos')
    for (const el of kids(infos, 'Item')) {
      if (child(el, 'pedXml_compIdx')?.getAttribute('value') !== String(id)) continue
      const idx = child(el, 'pedXml_drawblIdx')
      const n = parseInt(idx.getAttribute('value'), 10)
      const num = n === op.drawable ? 0 : n === 0 ? op.drawable : n
      if (op.lock && num !== 0) infos.removeChild(el)
      else idx.setAttribute('value', String(num))
    }
  }
  finishYmt(doc, comps)
  return new XMLSerializer().serializeToString(doc)
}

// Omdöpningar inuti en ped med allt i en fil: modellerna (head_001_r) och färgtexturerna i .ytd.
// Modeller tas aldrig bort här – .ymt bestämmer vilka spelet använder.
function compoundRenames(ops, layout, textureNames) {
  const ydd = []
  for (const [key, op] of Object.entries(ops)) {
    if (op.drawable === 0) continue
    for (const sfx of ['_r', '_u']) {
      ydd.push({ from: `${key}_${pad(op.drawable)}${sfx}`, to: `${key}_000${sfx}` })
      ydd.push({ from: `${key}_000${sfx}`, to: `${key}_${pad(op.drawable)}${sfx}` })
    }
  }
  const ytd = []
  for (const name of textureNames) {
    const next = lookName(name, Object.fromEntries(Object.entries(ops).map(([k, op]) => [k, { ...op, lock: false }])))
    if (next && next !== name) ytd.push({ from: name, to: next })
  }
  return { ydd, ytd }
}

// peds.meta för en addon-ped: pedens egen post om den fanns, annars en vanlig människo-ped.
export function pedsMetaItem(model, original, hasProps) {
  if (original) {
    try {
      const doc = parse(original)
      const own = [...doc.querySelectorAll('InitDatas > Item')].find((el) => child(el, 'Name')?.textContent.trim().toLowerCase() === model.toLowerCase())
      if (own) return new XMLSerializer().serializeToString(own)
    } catch {
      // En trasig peds.meta ersätts av standardposten nedan.
    }
  }
  const f = /^[a-z]+_f_/i.test(model)
  const g = f ? 'F' : 'M'
  return `<Item>
      <Name>${model}</Name>
      <PropsName>${hasProps ? `${model}_p` : 'null'}</PropsName>
      <ClipDictionaryName>move_${g.toLowerCase()}@generic</ClipDictionaryName>
      <BlendShapeFileName>null</BlendShapeFileName>
      <ExpressionSetName>expr_set_ambient_${f ? 'female' : 'male'}</ExpressionSetName>
      <ExpressionDictionaryName>default</ExpressionDictionaryName>
      <ExpressionName>null</ExpressionName>
      <Pedtype>CIV${f ? 'FEMALE' : 'MALE'}</Pedtype>
      <MovementClipSet>move_${g.toLowerCase()}@generic</MovementClipSet>
      <StrafeClipSet>move_ped_strafing</StrafeClipSet>
      <MovementToStrafeClipSet>move_ped_to_strafe</MovementToStrafeClipSet>
      <InjuredStrafeClipSet>move_strafe_injured</InjuredStrafeClipSet>
      <FullBodyDamageClipSet>dam_ko</FullBodyDamageClipSet>
      <AdditiveDamageClipSet>dam_ad</AdditiveDamageClipSet>
      <DefaultGestureClipSet>ANIM_GROUP_GESTURE_${g}_GENERIC</DefaultGestureClipSet>
      <FacialClipsetGroupName>facial_clipset_group_gen_${f ? 'female' : 'male'}</FacialClipsetGroupName>
      <DefaultVisemeClipSet>ANIM_GROUP_VISEMES_${g}_LO</DefaultVisemeClipSet>
      <SidestepClipSet>CLIP_SET_ID_INVALID</SidestepClipSet>
      <PoseMatcherName>${f ? 'Female' : 'Male'}</PoseMatcherName>
      <PoseMatcherProneName>${f ? 'Female' : 'Male'}_prone</PoseMatcherProneName>
      <GetupSetHash>NMBS_SLOW_GETUPS</GetupSetHash>
      <CreatureMetadataName>null</CreatureMetadataName>
      <DecisionMakerName>DEFAULT</DecisionMakerName>
      <MotionTaskDataSetName>STANDARD_PED</MotionTaskDataSetName>
      <DefaultTaskDataSetName>STANDARD_PED</DefaultTaskDataSetName>
      <PedCapsuleName>STANDARD_${f ? 'FEMALE' : 'MALE'}</PedCapsuleName>
      <PedLayoutName />
      <PedComponentSetName />
      <PedComponentClothName />
      <PedIKSettingsName />
      <TaskDataName />
      <IsStreamedGfx value="false" />
      <AmbulanceShouldRespond value="true" />
      <CanRideBikeWithNoHelmet value="false" />
      <CanSpawnInCar value="true" />
      <IsHeadBlendPed value="false" />
      <bOnlyBulkyItemVariations value="false" />
      <RelationshipGroup>CIV${f ? 'FEMALE' : 'MALE'}</RelationshipGroup>
      <NavCapabilitiesName>STANDARD_PED</NavCapabilitiesName>
      <PerceptionInfo>DEFAULT_PERCEPTION</PerceptionInfo>
      <DefaultBrawlingStyle>BS_AI</DefaultBrawlingStyle>
      <DefaultUnarmedWeapon>WEAPON_UNARMED</DefaultUnarmedWeapon>
      <Personality>Streamed_${f ? 'Female' : 'Male'}</Personality>
      <CombatInfo>DEFAULT</CombatInfo>
      <VfxInfoName>VFXPEDINFO_HUMAN_GENERIC</VfxInfoName>
      <AmbientClipsForFlee>FLEE</AmbientClipsForFlee>
      <Radio1>RADIO_GENRE_PUNK</Radio1>
      <Radio2>RADIO_GENRE_JAZZ</Radio2>
      <FUpOffset value="0.000000" />
      <RUpOffset value="0.000000" />
      <FFrontOffset value="0.000000" />
      <RFrontOffset value="0.147000" />
      <MinActivationImpulse value="20.000000" />
      <Stubble value="0.000000" />
      <HDDist value="3.000000" />
      <TargetingThreatModifier value="1.000000" />
      <KilledPerceptionRangeModifer value="-1.000000" />
      <Sexiness />
      <Age value="0" />
      <MaxPassengersInCar value="0" />
      <ExternallyDrivenDOFs />
      <PedVoiceGroup />
      <AnimalAudioObject />
      <AbilityType>SAT_NONE</AbilityType>
      <ThermalBehaviour>TB_WARM</ThermalBehaviour>
      <SuperlodType>SLOD_HUMAN</SuperlodType>
      <ScenarioPopStreamingSlot>SCENARIO_POP_STREAMING_NORMAL</ScenarioPopStreamingSlot>
      <DefaultSpawningPreference>DSP_NORMAL</DefaultSpawningPreference>
      <DefaultRemoveRangeMultiplier value="1.000000" />
      <AllowCloseSpawning value="false" />
    </Item>`
}

export const pedsMetaFile = (items) => `<?xml version="1.0" encoding="UTF-8"?>
<CPedModelInfo__InitDataList>
  <InitDatas>
    ${items.join('\n    ')}
  </InitDatas>
</CPedModelInfo__InitDataList>
`

const toArrayBuffer = (d) => (d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength))

/**
 * Lägger hela peden i resursen. written: Map(sökväg med små bokstäver → { path, data }) med det exporten
 * redan skrivit – dina ändrade plagg och texturer – som ersätter pedens original.
 * look: valen i Ped-menyn. lock: ta bort pedens andra varianter av delarna, så att spelet visar just det.
 * Returnerar { meta (posten till peds.meta för addon-peds, annars null), hidden (delar som inte kan döljas) }.
 */
export async function bundlePed({ root, dir, gender, items, look = {}, lock = true, written, lowercase = false, onProgress }) {
  const L = (p) => (lowercase ? p.toLowerCase() : p)
  const model = PEDS[gender].model
  const files = await desktop.customPedFiles(model)
  const names = files.map((f) => f.name)
  const info = await desktop.pedExportInfo(model)
  const compound = isCompoundPed(model, names)

  // Pedens filer, med dina ändrade plagg och texturer i stället för originalen.
  const final = new Map(files.map((f) => [f.name.toLowerCase(), { name: f.name, data: f.data }]))
  const prefix = `${dir}/`.toLowerCase()
  for (const [p, w] of written) {
    if (!p.startsWith(prefix) || p.slice(prefix.length).includes('/')) continue
    const name = w.path.slice(prefix.length).replace(/^[a-z0-9_]+\^/i, '')
    final.set(name.toLowerCase(), { name, data: w.data })
    root.remove(w.path)
  }

  // .ymt: nya plagg och färgvarianter (peds med en fil per plagg), och valt utseende som 000/A.
  let ops = {}
  let hidden = []
  const ymt = final.get(`${model.toLowerCase()}.ymt`)
  if (ymt) {
    onProgress?.(t('Uppdaterar {f}…', { f: `${model}.ymt` }))
    const original = await desktop.ymtToXml(ymt.data)
    ;({ ops, hidden } = resolvePedLook({ layout: ymtLayout(original), look, items, lock }))
    const own = items.filter((i) => !i.compound)
    let xml = (!compound && own.length && patchPedYmt(original, own)) || original
    xml = applyLookToYmt(xml, ops)
    if (xml !== original) ymt.data = (await desktop.buildYmt([{ name: ymt.name, xml }]))[0].data
  }

  // Filerna får de nya numren: valt utseende blir 000/A, låsta delars andra varianter tas bort.
  if (Object.keys(ops).length) {
    if (compound) {
      const ydd = final.get(`${model.toLowerCase()}.ydd`)
      const ytd = final.get(`${model.toLowerCase()}.ytd`)
      const texNames = ytd ? (await readYTD(toArrayBuffer(ytd.data), { decode: false })).map((x) => x.name) : []
      const ren = compoundRenames(ops, null, texNames)
      if (ydd && ren.ydd.length) ydd.data = await desktop.renameInFile('ydd', ydd.data, ren.ydd)
      if (ytd && ren.ytd.length) ytd.data = await desktop.renameInFile('ytd', ytd.data, ren.ytd)
    } else {
      const renamed = [...final.values()].map((f) => ({ ...f, name: lookName(f.name, ops) })).filter((f) => f.name)
      final.clear()
      for (const f of renamed) final.set(f.name.toLowerCase(), f)
    }
  }

  for (const f of final.values()) root.file(L(`${dir}/${streamName(model, f.name)}`), f.data)
  const meta = info.addon ? pedsMetaItem(model, info.pedsMeta, names.some((n) => /^p_|_p\.(ydd|ytd)$/i.test(n))) : null
  return { meta, hidden }
}
