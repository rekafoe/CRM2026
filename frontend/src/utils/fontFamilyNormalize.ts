/** Синхронно с backend/src/utils/fontFamilyNormalize.ts */

export function normalizeFontFamilyName(value: string | undefined | null): string {
  if (!value) return '';
  const first = String(value).split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]|['"]$/g, '').trim();
}

export function fontFamilyCompactKey(value: string | undefined | null): string {
  return normalizeFontFamilyName(value).toLowerCase().replace(/[\s_-]+/g, '');
}

/** Sign That S (kerning) → Sign That — как в SVG после усечения скобок. */
export function fontFamilyLooseMatchName(value: string | undefined | null): string {
  let name = normalizeFontFamilyName(value);
  if (!name) return '';
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\s+[A-Z]$/.test(name)) {
    name = name.replace(/\s+[A-Z]$/, '').trim();
  }
  return name;
}

export function fontFamilyBaseCompactKey(value: string | undefined | null): string {
  return fontFamilyLooseMatchName(value).toLowerCase().replace(/[\s_-]+/g, '');
}

export function fontFamilyNamesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = fontFamilyCompactKey(a);
  const nb = fontFamilyCompactKey(b);
  if (na && nb && na === nb) return true;
  const ba = fontFamilyBaseCompactKey(a);
  const bb = fontFamilyBaseCompactKey(b);
  if (!ba || !bb) return false;
  return ba === bb;
}

function titleCaseFontWords(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((word) => (
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  )).join(' ')
}

/** HappyTime.woff2 → Happy Time, ceremoniousone.ttf → Ceremonious One */
export function guessFontFamilyFromFilename(filename: string): string {
  let base = filename.replace(/\.[^.]+$/, '').trim()
  if (!base) return ''
  // ofont.ru_Shampanskoe script → Shampanskoe script
  base = base.replace(/^ofont\.ru[_-]+/i, '')
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
  return titleCaseFontWords(spaced) || base
}
