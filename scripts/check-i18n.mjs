// Kontrollerar att varje text i t('…') / tr('…') och alla etiketter har översättning till alla språk.
//   node scripts/check-i18n.mjs          -> listar saknade
//   node scripts/check-i18n.mjs --keys   -> skriver alla nycklar som JSON
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { DICT } from '../src/lib/i18n.dict.js'

const LANGS = ['no', 'da', 'fi', 'en']
const files = []
const walk = (d) =>
  readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.(jsx?|mjs)$/.test(f) && files.push(join(d, f))))
walk('src')

const keys = new Set()
const call = /\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g
const label = /label: '((?:[^'\\]|\\.)*)'/g
const group = /group: '((?:[^'\\]|\\.)*)'/g
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(call)) keys.add(m[1].replace(/\\'/g, "'"))
  // Etiketter som översätts när de visas: kategorier, grupper, verktyg och kön.
  if (/categories\.js$|TextureEditor\.jsx$|layers\.js$/.test(f)) for (const m of s.matchAll(label)) keys.add(m[1])
  if (/categories\.js$/.test(f)) for (const m of s.matchAll(group)) keys.add(m[1])
  if (/TextureEditor\.jsx$/.test(f)) for (const m of s.matchAll(/short: '((?:[^'\\]|\\.)*)'/g)) keys.add(m[1])
}
keys.add('Justera färger')

if (process.argv.includes('--keys')) {
  console.log(JSON.stringify([...keys].sort(), null, 1))
} else {
  const missing = [...keys].filter((k) => LANGS.some((l) => !DICT[k]?.[l]))
  const unused = Object.keys(DICT).filter((k) => !keys.has(k))
  for (const k of missing) console.log('SAKNAS:', k, LANGS.filter((l) => !DICT[k]?.[l]).join(','))
  for (const k of unused) console.log('OANVÄND:', k)
  console.log(`${keys.size} texter, ${missing.length} saknas, ${unused.length} oanvända`)
  process.exit(missing.length ? 1 : 0)
}
