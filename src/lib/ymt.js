// Skapar CPedVariationInfo (.ymt) och ShopPedApparel (.meta) för ett addon-klädpaket,
// i exakt samma format som befintliga FiveM-paket (verifierat mot riktiga .ymt-filer).

export const ANCHORS = { 0: 'ANCHOR_HEAD', 1: 'ANCHOR_EYES', 2: 'ANCHOR_EARS', 6: 'ANCHOR_LEFT_WRIST', 7: 'ANCHOR_RIGHT_WRIST' }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * components: { [compId]: [{ skin: bool, textures: n }] }  – i ordning 000, 001, …
 * props:      { [anchorId]: [{ textures: n }] }
 */
export function buildYmtXml({ dlc, components, props }) {
  const L = []
  const present = Object.keys(components).map(Number).filter((c) => components[c].length).sort((a, b) => a - b)
  const avail = Array.from({ length: 12 }, (_, c) => (present.includes(c) ? present.indexOf(c) : 255))

  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push(`<CPedVariationInfo name="${esc(dlc)}">`)
  L.push(' <bHasTexVariations value="true" />')
  L.push(' <bHasDrawblVariations value="true" />')
  L.push(' <bHasLowLODs value="false" />')
  L.push(' <bIsSuperLOD value="false" />')
  L.push(` <availComp>${avail.join(' ')}</availComp>`)

  if (present.length) {
    L.push(' <aComponentData3 itemType="CPVComponentData">')
    for (const c of present) {
      const list = components[c]
      L.push('  <Item>')
      // numAvailTex är en byte i spelet. Befintliga paket räknar runt vid 256 (t.ex. 381 → 125), så vi gör likadant.
      L.push(`   <numAvailTex value="${list.reduce((s, d) => s + d.textures, 0) % 256}" />`)
      L.push('   <aDrawblData3 itemType="CPVDrawblData">')
      for (const d of list) {
        // _r (hud) = propMask 17 och texId 1 (_whi). _u = 1 och 0 (_uni).
        L.push('    <Item>')
        L.push(`     <propMask value="${d.skin ? 17 : 1}" />`)
        L.push('     <numAlternatives value="0" />')
        L.push('     <aTexData itemType="CPVTextureData">')
        for (let t = 0; t < d.textures; t++) {
          L.push('      <Item>')
          L.push(`       <texId value="${d.skin ? 1 : 0}" />`)
          L.push('       <distribution value="255" />')
          L.push('      </Item>')
        }
        L.push('     </aTexData>')
        L.push('     <clothData>')
        L.push('      <ownsCloth value="false" />')
        L.push('     </clothData>')
        L.push('    </Item>')
      }
      L.push('   </aDrawblData3>')
      L.push('  </Item>')
    }
    L.push(' </aComponentData3>')
  } else L.push(' <aComponentData3 itemType="CPVComponentData" />')

  L.push(' <aSelectionSets itemType="CPedSelectionSet" />')

  if (present.length) {
    L.push(' <compInfos itemType="CComponentInfo">')
    for (const c of present) {
      components[c].forEach((_, i) => {
        L.push('  <Item>')
        L.push('   <pedXml_audioID>none</pedXml_audioID>')
        L.push('   <pedXml_audioID2>none</pedXml_audioID2>')
        L.push('   <pedXml_expressionMods>0 0 0 0 0</pedXml_expressionMods>')
        L.push('   <flags value="0" />')
        L.push('   <inclusions>0</inclusions>')
        L.push('   <exclusions>0</exclusions>')
        L.push('   <pedXml_vfxComps>PV_COMP_HEAD</pedXml_vfxComps>')
        L.push('   <pedXml_flags value="0" />')
        L.push(`   <pedXml_compIdx value="${c}" />`)
        L.push(`   <pedXml_drawblIdx value="${i}" />`)
        L.push('  </Item>')
      })
    }
    L.push(' </compInfos>')
  } else L.push(' <compInfos itemType="CComponentInfo" />')

  const anchors = Object.keys(props).map(Number).filter((a) => props[a].length).sort((a, b) => a - b)
  const totalProps = anchors.reduce((s, a) => s + props[a].length, 0)
  L.push(' <propInfo>')
  L.push(`  <numAvailProps value="${totalProps}" />`)
  if (totalProps) {
    L.push('  <aPropMetaData itemType="CPedPropMetaData">')
    for (const a of anchors) {
      props[a].forEach((p, i) => {
        L.push('   <Item>')
        L.push('    <audioId>none</audioId>')
        L.push('    <expressionMods>0 0 0 0 0</expressionMods>')
        L.push('    <texData itemType="CPedPropTexData">')
        for (let t = 0; t < p.textures; t++) {
          L.push('     <Item>')
          L.push('      <inclusions>0</inclusions>')
          L.push('      <exclusions>0</exclusions>')
          L.push('      <texId value="0" />')
          L.push('      <inclusionId value="0" />')
          L.push('      <exclusionId value="0" />')
          L.push('      <distribution value="255" />')
          L.push('     </Item>')
        }
        L.push('    </texData>')
        L.push('    <renderFlags />')
        L.push('    <propFlags value="0" />')
        L.push('    <flags value="0" />')
        L.push(`    <anchorId value="${a}" />`)
        L.push(`    <propId value="${i}" />`)
        L.push('    <stickyness value="0" />')
        L.push('   </Item>')
      })
    }
    L.push('  </aPropMetaData>')
    L.push('  <aAnchors itemType="CAnchorProps">')
    for (const a of anchors) {
      L.push('   <Item>')
      L.push(`    <props>${props[a].map((p) => p.textures).join(' ')}</props>`)
      L.push(`    <anchor>${ANCHORS[a]}</anchor>`)
      L.push('   </Item>')
    }
    L.push('  </aAnchors>')
  } else {
    L.push('  <aPropMetaData itemType="CPedPropMetaData" />')
    L.push('  <aAnchors itemType="CAnchorProps" />')
  }
  L.push(' </propInfo>')
  L.push(` <dlcName>${esc(dlc)}</dlcName>`)
  L.push('</CPedVariationInfo>')
  return L.join('\n') + '\n'
}

export function buildShopMeta({ ped, dlc, female }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ShopPedApparel>
    <pedName>${ped}</pedName>
    <dlcName>${esc(dlc)}</dlcName>
    <fullDlcName>${ped}_${esc(dlc)}</fullDlcName>
    <eCharacter>${female ? 'SCR_CHAR_MULTIPLAYER_F' : 'SCR_CHAR_MULTIPLAYER'}</eCharacter>
    <creatureMetaData>mp_creaturemetadata_${female ? 'f' : 'm'}_${esc(dlc)}</creatureMetaData>
    <pedOutfits>
    </pedOutfits>
    <pedComponents>
    </pedComponents>
    <pedProps>
    </pedProps>
</ShopPedApparel>
`
}

// GTA:s namn-hash (joaat), samma som spelet använder för dlcName.
export function joaat(s) {
  let h = 0
  for (const ch of s.toLowerCase()) {
    h = (h + ch.charCodeAt(0)) >>> 0
    h = (h + (h << 10)) >>> 0
    h = (h ^ (h >>> 6)) >>> 0
  }
  h = (h + (h << 3)) >>> 0
  h = (h ^ (h >>> 11)) >>> 0
  h = (h + (h << 15)) >>> 0
  return h
}
