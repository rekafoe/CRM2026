import { fontFamilyCompactKey, fontFamilyNamesMatch, normalizeFontFamilyName } from './fontFamilyNormalize'

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

export function extractUsedFontFamiliesFromDesignState(designState: unknown): string[] {
  if (!designState || typeof designState !== 'object' || Array.isArray(designState)) return []
  const pages = (designState as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return []
  const families = new Set<string>()
  for (const page of pages) {
    if (!page || typeof page !== 'object') continue
    const fabricJSON = (page as Record<string, unknown>).fabricJSON
    walkFabric(fabricJSON, (obj) => {
      const ff = normalizeFontFamilyName(String(obj.fontFamily ?? ''))
      if (ff) families.add(ff)
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
      if (!current) return
      const canonical = aliasToCanonical.get(fontFamilyCompactKey(current))
      if (canonical) {
        obj.fontFamily = canonical
      }
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
