import {
  fontFamilyCompactKey,
  fontFamilyNamesMatch,
  isGenericFontFamily,
  normalizeFontFamilyName,
} from './fontFamilyNormalize'

type FabricObj = Record<string, unknown>

function walkFabric(value: unknown, visit: (obj: FabricObj) => void): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const obj = value as FabricObj
  const type = String(obj.type ?? '').toLowerCase()
  if (type === 'i-text' || type === 'textbox' || type === 'text') {
    visit(obj)
  }
  for (const key of ['objects', '_objects']) {
    const children = obj[key]
    if (Array.isArray(children)) children.forEach((c) => walkFabric(c, visit))
  }
  walkFabric(obj.clipPath, visit)
}

function collectFontFamiliesFromFabricText(obj: FabricObj, families: Set<string>): void {
  const ff = normalizeFontFamilyName(String(obj.fontFamily ?? ''))
  if (ff) families.add(ff)
  const styles = obj.styles
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return
  for (const line of Object.values(styles as Record<string, unknown>)) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) continue
    for (const style of Object.values(line as Record<string, unknown>)) {
      if (!style || typeof style !== 'object' || Array.isArray(style)) continue
      const segFont = normalizeFontFamilyName(String((style as FabricObj).fontFamily ?? ''))
      if (segFont) families.add(segFont)
    }
  }
}

function walkFabricTextStyles(obj: FabricObj, visit: (style: FabricObj) => void): void {
  const styles = obj.styles
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return
  for (const line of Object.values(styles as Record<string, unknown>)) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) continue
    for (const style of Object.values(line as Record<string, unknown>)) {
      if (style && typeof style === 'object' && !Array.isArray(style)) visit(style as FabricObj)
    }
  }
}

export function extractUsedFontFamiliesFromDesignState(designState: unknown): string[] {
  if (!designState || typeof designState !== 'object' || Array.isArray(designState)) return []
  const pages = (designState as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return []
  const families = new Set<string>()
  for (const page of pages) {
    if (!page || typeof page !== 'object') continue
    const fabricJSON = (page as Record<string, unknown>).fabricJSON
    walkFabric(fabricJSON, (obj) => {
      collectFontFamiliesFromFabricText(obj, families)
    })
  }
  return [...families].sort((a, b) => a.localeCompare(b, 'ru'))
}

export type BundledTemplateFont = {
  family: string
  source: 'bundled'
  filename: string
  url: string
  format?: string
}

export type RequiredFontEntry = {
  family: string
  source: 'global' | 'bundled' | 'missing'
  fontId?: number
  url?: string
  format?: string
  name_aliases?: string[]
}

export type GlobalFontRef = {
  id: number
  url: string
  format: string
  /** Каноническое имя в библиотеке CRM (family_name). */
  family: string
  name_aliases?: string[]
}

export function buildRequiredFontEntries(input: {
  families: string[]
  globalByFamily: Map<string, GlobalFontRef>
  bundledFonts?: BundledTemplateFont[]
}): RequiredFontEntry[] {
  const bundled = input.bundledFonts ?? []
  return input.families.map((family) => {
    const global = input.globalByFamily.get(fontFamilyCompactKey(family))
    if (global) {
      return {
        family: global.family,
        source: 'global' as const,
        fontId: global.id,
        url: global.url,
        format: global.format,
        name_aliases: global.name_aliases,
      }
    }
    const bundledMatch = bundled.find((b) => fontFamilyNamesMatch(b.family, family))
    if (bundledMatch) {
      return {
        family,
        source: 'bundled' as const,
        url: bundledMatch.url,
        format: bundledMatch.format,
      }
    }
    return { family, source: 'missing' as const }
  })
}

export function hasMissingRequiredFonts(entries: RequiredFontEntry[]): boolean {
  return entries.some((e) => e.source === 'missing')
}

type LibraryFontRef = { family_name: string; name_aliases?: string[] }

function matchLibraryFontToTextLayer(
  textId: string,
  libraryFonts: LibraryFontRef[],
): string | undefined {
  const suffixKey = fontFamilyCompactKey(textId.replace(/^text_/i, ''))
  if (!suffixKey) return undefined
  for (const font of libraryFonts) {
    const canonical = normalizeFontFamilyName(font.family_name)
    if (!canonical) continue
    const names = [canonical, ...(font.name_aliases ?? [])]
    for (const name of names) {
      const familyKey = fontFamilyCompactKey(name)
      if (!familyKey) continue
      if (familyKey.includes(suffixKey) || suffixKey.includes(familyKey)) {
        return canonical
      }
    }
  }
  return undefined
}

/**
 * Для text_* без font-family в SVG (Arial в fabricJSON) подставляет шрифт из библиотеки CRM
 * по имени слоя: text_voguella → Voguella.
 */
export function applyLibraryFontFallbacksToDesignState(
  designState: unknown,
  libraryFonts: LibraryFontRef[],
): unknown {
  if (!libraryFonts.length) return designState
  if (!designState || typeof designState !== 'object' || Array.isArray(designState)) return designState
  const pages = (designState as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return designState

  const applyFabric = (value: unknown): void => {
    walkFabric(value, (obj) => {
      const id = String(obj.id ?? '')
      if (!id.toLowerCase().startsWith('text_')) return
      const matched = matchLibraryFontToTextLayer(id, libraryFonts)
      if (!matched) return
      if (isGenericFontFamily(String(obj.fontFamily ?? ''))) {
        obj.fontFamily = matched
      }
      walkFabricTextStyles(obj, (style) => {
        if (isGenericFontFamily(String(style.fontFamily ?? ''))) {
          style.fontFamily = matched
        }
      })
    })
  }

  const nextPages = pages.map((page) => {
    if (!page || typeof page !== 'object') return page
    const fabricJSON = (page as Record<string, unknown>).fabricJSON
    if (!fabricJSON || typeof fabricJSON !== 'object') return page
    const cloned = JSON.parse(JSON.stringify(fabricJSON)) as Record<string, unknown>
    applyFabric(cloned)
    return { ...(page as Record<string, unknown>), fabricJSON: cloned }
  })

  return { ...(designState as Record<string, unknown>), pages: nextPages }
}

/** Приводит fontFamily в fabricJSON к family_name из библиотеки по алиасам (имя в SVG ≠ имя в файле). */
export function normalizeDesignStateFontFamilies(
  designState: unknown,
  libraryFonts: Array<{ family_name: string; name_aliases?: string[] }>,
): unknown {
  if (!designState || typeof designState !== 'object' || Array.isArray(designState)) return designState
  const pages = (designState as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return designState

  const aliasToCanonical = new Map<string, string>()
  for (const font of libraryFonts) {
    const canonical = normalizeFontFamilyName(font.family_name)
    if (!canonical) continue
    const names = [canonical, ...(font.name_aliases ?? [])]
    for (const name of names) {
      const key = fontFamilyCompactKey(name)
      if (key) aliasToCanonical.set(key, canonical)
    }
  }

  const normalizeFabric = (value: unknown): void => {
    walkFabric(value, (obj) => {
      const current = normalizeFontFamilyName(String(obj.fontFamily ?? ''))
      if (current) {
        const canonical = aliasToCanonical.get(fontFamilyCompactKey(current))
        if (canonical) obj.fontFamily = canonical
      }
      walkFabricTextStyles(obj, (style) => {
        const segFont = normalizeFontFamilyName(String(style.fontFamily ?? ''))
        if (!segFont) return
        const canonical = aliasToCanonical.get(fontFamilyCompactKey(segFont))
        if (canonical) style.fontFamily = canonical
      })
    })
  }

  const nextPages = pages.map((page) => {
    if (!page || typeof page !== 'object') return page
    const fabricJSON = (page as Record<string, unknown>).fabricJSON
    if (!fabricJSON || typeof fabricJSON !== 'object') return page
    const cloned = JSON.parse(JSON.stringify(fabricJSON)) as Record<string, unknown>
    normalizeFabric(cloned)
    return { ...(page as Record<string, unknown>), fabricJSON: cloned }
  })

  return { ...(designState as Record<string, unknown>), pages: nextPages }
}
