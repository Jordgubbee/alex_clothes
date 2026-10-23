// Översättningar. Svenska texten i koden är nyckeln; DICT ger de andra språken.
// scripts/check-i18n.mjs kontrollerar att varje t('…') finns översatt.
import { useStore } from './store'
import { DICT } from './i18n.dict'

export const LANGUAGES = [
  { id: 'sv', label: 'Swedish' },
  { id: 'no', label: 'Norwegian' },
  { id: 'da', label: 'Danish' },
  { id: 'fi', label: 'Finnish' },
  { id: 'en', label: 'English' },
]

export function translate(lang, key, vars) {
  let s = (lang !== 'sv' && DICT[key]?.[lang]) || key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v)
  return s
}

// Utanför React (t.ex. i exporten) läses språket direkt ur store.
export const t = (key, vars) => translate(useStore.getState().lang, key, vars)

// I komponenter: rendera om när språket byts.
export function useT() {
  const lang = useStore((s) => s.lang)
  return (key, vars) => translate(lang, key, vars)
}
