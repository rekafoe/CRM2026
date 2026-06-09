/** Нормализация font-family для сопоставления с библиотекой CRM. */
export function normalizeFontFamilyName(value: string | undefined | null): string {
  if (!value) return ''
  const first = String(value).split(',')[0]?.trim() ?? ''
  return first.replace(/^['"]|['"]$/g, '').trim()
}

/** Ключ сравнения: без пробелов/дефисов, lower — HappyTimeTwo = Happy Time Two. */
export function fontFamilyCompactKey(value: string | undefined | null): string {
  return normalizeFontFamilyName(value).toLowerCase().replace(/[\s_-]+/g, '')
}

export function fontFamilyNamesMatch(a: string | undefined, b: string | undefined): boolean {
  const na = fontFamilyCompactKey(a)
  const nb = fontFamilyCompactKey(b)
  if (!na || !nb) return false
  return na === nb
}

/** Эвристика: HappyTime.woff2 → Happy Time */
export function guessFontFamilyFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  const spaced = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced || base
}
