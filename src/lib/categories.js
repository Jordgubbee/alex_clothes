// GTA V freemode-komponenter. `key` är namnet som används i filnamnen i stream-mappen.
export const COMPONENTS = [
  { id: 11, key: 'jbib', label: 'Tröjor & jackor', group: 'Kläder' },
  { id: 8, key: 'accs', label: 'Undertröjor', group: 'Kläder' },
  { id: 4, key: 'lowr', label: 'Byxor', group: 'Kläder' },
  { id: 6, key: 'feet', label: 'Skor', group: 'Kläder' },
  { id: 1, key: 'berd', label: 'Masker', group: 'Kläder' },
  { id: 5, key: 'hand', label: 'Väskor', group: 'Kläder' },
  { id: 9, key: 'task', label: 'Skyddsvästar', group: 'Kläder' },
  { id: 10, key: 'decl', label: 'Dekaler', group: 'Kläder' },
  { id: 7, key: 'teef', label: 'Halsband & slips', group: 'Accessoarer' },
  { id: 3, key: 'uppr', label: 'Armar', group: 'Kropp' },
  { id: 2, key: 'hair', label: 'Frisyrer', group: 'Kropp' },
]

export const PROPS = [
  { id: 0, key: 'p_head', label: 'Hattar & kepsar', group: 'Props' },
  { id: 1, key: 'p_eyes', label: 'Glasögon', group: 'Props' },
  { id: 2, key: 'p_ears', label: 'Örhängen', group: 'Props' },
  { id: 6, key: 'p_lwrist', label: 'Klockor', group: 'Props' },
  { id: 7, key: 'p_rwrist', label: 'Armband', group: 'Props' },
]

export const ALL_CATEGORIES = [
  ...COMPONENTS.map((c) => ({ ...c, prop: false })),
  ...PROPS.map((c) => ({ ...c, prop: true })),
]

export const GROUPS = ['Kläder', 'Accessoarer', 'Props', 'Kropp']

export const categoryByKey = (key) => ALL_CATEGORIES.find((c) => c.key === key)

export const PEDS = {
  male: { model: 'mp_m_freemode_01', label: 'Kille' },
  female: { model: 'mp_f_freemode_01', label: 'Tjej' },
}

const pad3 = (n) => String(n).padStart(3, '0')
export const variantLetter = (i) => String.fromCharCode(97 + i)

// Filnamnen som GTA/FiveM förväntar sig för att ersätta ett plagg via stream-mappen.
export function streamNames({ gender, category, slot, textureIndex = 0, skin = false }) {
  const ped = PEDS[gender].model
  const cat = categoryByKey(category)
  const n = pad3(slot)
  if (cat.prop) {
    return {
      model: `${ped}_p^${cat.key}_${n}.ydd`,
      texture: `${ped}_p^${cat.key}_diff_${n}_${variantLetter(textureIndex)}.ytd`,
    }
  }
  return {
    model: `${ped}^${cat.key}_${n}_${skin ? 'r' : 'u'}.ydd`,
    texture: `${ped}^${cat.key}_diff_${n}_${variantLetter(textureIndex)}_${skin ? 'whi' : 'uni'}.ytd`,
  }
}

// Filnamn i ett addon-paket (samma som Durty Cloth Tool och befintliga FiveM-paket):
//   mp_m_freemode_01_<dlc>^jbib_000_u.ydd / mp_m_freemode_01_<dlc>^jbib_diff_000_a_uni.ytd
//   mp_m_freemode_01_p_<dlc>^p_head_000.ydd / mp_m_freemode_01_p_<dlc>^p_head_diff_000_a.ytd
export function addonNames({ gender, dlc, category, index, textureIndex = 0, skin = false }) {
  const ped = PEDS[gender].model
  const cat = categoryByKey(category)
  const n = pad3(index)
  if (cat.prop) {
    const col = `${ped}_p_${dlc}`
    return { collection: col, model: `${col}^${cat.key}_${n}.ydd`, texture: `${col}^${cat.key}_diff_${n}_${variantLetter(textureIndex)}.ytd` }
  }
  const col = `${ped}_${dlc}`
  return {
    collection: col,
    model: `${col}^${cat.key}_${n}_${skin ? 'r' : 'u'}.ydd`,
    texture: `${col}^${cat.key}_diff_${n}_${variantLetter(textureIndex)}_${skin ? 'whi' : 'uni'}.ytd`,
  }
}

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

// Paketnamn per kön enligt vald mall. {name} = paketets namn, {g} = m/f.
export const DLC_TEMPLATES = ['{name}', '{name}_clothes', '{name}_{g}_clothes', '{name}_{g}']
export const applyTemplate = (tpl, name, gender) => tpl.replace('{name}', slugify(name) || 'pack').replace('{g}', gender === 'female' ? 'f' : 'm')

// Försöker läsa kategori + nummer ur ett befintligt GTA-filnamn, t.ex. "jbib_005_u.ydd".
export function guessFromFilename(name) {
  const lower = name.toLowerCase()
  const m = lower.match(/(p_head|p_eyes|p_ears|p_lwrist|p_rwrist|berd|hair|uppr|lowr|hand|feet|teef|accs|task|decl|jbib)(?:_diff)?_(\d{3})/)
  if (!m) return null
  const g = { category: m[1], slot: parseInt(m[2], 10), skin: /_r\.ydd$|_whi\.ytd$/.test(lower) }
  if (lower.includes('mp_f_freemode')) g.gender = 'female'
  else if (lower.includes('mp_m_freemode')) g.gender = 'male'
  // Addon-paket: mp_f_freemode_01_ems_f_clothes^... eller mp_f_freemode_01_p_ems_f_clothes^...
  const dlc = lower.match(/mp_[mf]_freemode_01_(?:p_)?([a-z0-9_]+)\^/)
  if (dlc) g.dlc = dlc[1]
  return g
}
