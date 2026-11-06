// Export av egna peds som en hel, fungerande ped: pedens alla filer (.yft, .ydd, .ytd, .ymt …) med
// dina ändringar, en uppdaterad .ymt om du lagt till nya plagg, och peds.meta om det är en addon-ped.
import { categoryByKey, PEDS } from './categories'
import { desktop } from './desktop'
import { t } from './i18n'

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

  // Delarna i id-ordning, availComp pekar på deras plats, numAvailTex = alla färgvarianter i delen.
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
  return new XMLSerializer().serializeToString(doc)
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

/**
 * Lägger hela peden i resursen. written: sökvägar (små bokstäver) som exporten redan skrivit –
 * dina ändrade plagg och texturer – så att de inte skrivs över av pedens original.
 * Returnerar posten till peds.meta om peden är en addon-ped, annars null.
 */
export async function bundlePed({ root, dir, gender, items, written, lowercase = false, onProgress }) {
  const L = (p) => (lowercase ? p.toLowerCase() : p)
  const model = PEDS[gender].model
  const files = await desktop.customPedFiles(model)
  const names = files.map((f) => f.name)
  const info = await desktop.pedExportInfo(model)
  const compound = isCompoundPed(model, names)

  // Pedens .ymt uppdateras när du lagt till plagg eller färgvarianter (bara peds med en fil per plagg).
  const ymt = files.find((f) => f.name.toLowerCase() === `${model.toLowerCase()}.ymt`)
  if (ymt && !compound && items.length) {
    onProgress?.(t('Uppdaterar {f}…', { f: `${model}.ymt` }))
    const xml = patchPedYmt(await desktop.ymtToXml(ymt.data), items)
    if (xml) {
      const [built] = await desktop.buildYmt([{ name: ymt.name, xml }])
      const path = L(`${dir}/${ymt.name}`)
      root.file(path, built.data)
      written.add(path.toLowerCase())
    }
  }

  for (const f of files) {
    const path = L(`${dir}/${streamName(model, f.name)}`)
    if (written.has(path.toLowerCase())) continue
    root.file(path, f.data)
    written.add(path.toLowerCase())
  }
  if (!info.addon) return null
  return pedsMetaItem(model, info.pedsMeta, names.some((n) => /^p_|_p\.(ydd|ytd)$/i.test(n)))
}
