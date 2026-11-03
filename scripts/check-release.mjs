// Stoppar en release om installationsfilerna är trasiga. Ett avbrutet NSIS-bygge kan lämna
// en fil på ~128 kB som ser rätt ut men inte går att installera.
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const MIN = 50 * 1024 * 1024
const files = readdirSync('release').filter((f) => /^alex_clothes-.*\.exe$/.test(f))
let bad = files.length === 0
for (const f of files) {
  const size = statSync(join('release', f)).size
  const ok = size >= MIN
  if (!ok) bad = true
  console.log(`${ok ? 'OK  ' : 'FEL '} ${f}  ${(size / 1024 / 1024).toFixed(1)} MB`)
}
if (bad) {
  console.error('Installationsfilerna är trasiga eller saknas – bygg om innan du publicerar.')
  process.exit(1)
}
