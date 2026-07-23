/** Нормализация font-family для сопоставления с библиотекой CRM. */

const FONT_VENDOR_PREFIX_RE = /^(?:ofont\.ru|dafont\.com|fontsquirrel)[_-]+/i

/** Стилевые хвосты в имени family (не часть семейства вроде Arial Black). */
const FONT_STYLE_SUFFIX_RE = /[\s_-]+(regular|normal|medium|bold|italic|oblique|light|thin|semibold|semilight|demibold|extrabold|extralight|ultralight|ultrabold|book|roman)$/i
const FONT_STYLE_CAMEL_RE = /(?<=[a-z])(Regular|Normal|Medium|Bold|Italic|Oblique|Light|Thin|SemiBold|Demibold|ExtraBold|ExtraLight|UltraLight|UltraBold|Book|Roman)$/

export function stripFontVendorPrefixes(value: string): string {
  let name = value.trim()
  for (let i = 0; i < 2; i += 1) {
    const next = name.replace(FONT_VENDOR_PREFIX_RE, '').trim()
    if (next === name) break
    name = next
  }
  return name
}

function stripTrailingFontStyleTokens(value: string): string {
  let name = value.trim()
  for (let i = 0; i < 3; i += 1) {
    const next = name
      .replace(FONT_STYLE_SUFFIX_RE, '')
      .replace(FONT_STYLE_CAMEL_RE, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (next === name || !next) break
    name = next
  }
  return name
}

export function normalizeFontFamilyName(value: string | undefined | null): string {
  if (!value) return ''
  const first = String(value).split(',')[0]?.trim() ?? ''
  const unquoted = first.replace(/^['"]|['"]$/g, '').trim()
  return stripFontVendorPrefixes(unquoted)
}

/** Ключ сравнения: без пробелов/дефисов, lower — HappyTimeTwo = Happy Time Two. */
export function fontFamilyCompactKey(value: string | undefined | null): string {
  return normalizeFontFamilyName(value).toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Имя без (kerning)/(opentype), одиночного суффикса « S» / « R» и стилевых хвостов Bold/Italic.
 * Sign That S (kerning) → Sign That; ofont.ru_Shampanskoe Bold → Shampanskoe.
 */
export function fontFamilyLooseMatchName(value: string | undefined | null): string {
  let name = normalizeFontFamilyName(value)
  if (!name) return ''
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (/\s+[A-Z]$/.test(name)) {
    name = name.replace(/\s+[A-Z]$/, '').trim()
  }
  name = stripTrailingFontStyleTokens(name)
  return name
}

/** Ключ «мягкого» сопоставления для библиотеки CRM и SVG. */
export function fontFamilyBaseCompactKey(value: string | undefined | null): string {
  return fontFamilyLooseMatchName(value).toLowerCase().replace(/[\s_-]+/g, '')
}

export function fontFamilyNamesMatch(a: string | undefined, b: string | undefined): boolean {
  const na = fontFamilyCompactKey(a)
  const nb = fontFamilyCompactKey(b)
  if (na && nb && na === nb) return true
  const ba = fontFamilyBaseCompactKey(a)
  const bb = fontFamilyBaseCompactKey(b)
  if (!ba || !bb) return false
  return ba === bb
}

const GENERIC_FONT_KEYS = new Set([
  'arial', 'helvetica', 'sans-serif', 'serif', 'times', 'timesnewroman',
  'courier', 'couriernew', 'symbol', 'default',
])

/** Arial / Helvetica / системные generic — как в Corel «заглушка», не кастомный шрифт. */
export function isGenericFontFamily(family: string | undefined | null): boolean {
  if (!family?.trim()) return true
  return GENERIC_FONT_KEYS.has(fontFamilyCompactKey(family))
}

/** Family не задан вовсе (пустая строка) — можно ставить Arial или fallback по text_*. */
export function isUnsetFontFamily(family: string | undefined | null): boolean {
  return !normalizeFontFamilyName(family)
}

function titleCaseFontWords(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((word) => (
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  )).join(' ')
}

/** Эвристика: HappyTime.woff2 → Happy Time, ceremoniousone.ttf → Ceremonious One */
export function guessFontFamilyFromFilename(filename: string): string {
  let base = filename.replace(/\.[^.]+$/, '').trim()
  if (!base) return ''
  // ofont.ru_Shampanskoe script → Shampanskoe script
  base = stripFontVendorPrefixes(base)
  let spaced = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d+)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!/\s/.test(spaced)) {
    spaced = spaced.replace(
      /([a-z]{3,})(one|two|three|four|five|six|seven|eight|nine|ten)$/i,
      '$1 $2',
    )
  }
  spaced = stripTrailingFontStyleTokens(spaced)
  return titleCaseFontWords(spaced) || base
}
