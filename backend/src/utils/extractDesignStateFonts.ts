import { fontFamilyNamesMatch, normalizeFontFamilyName } from './fontFamilyNormalize'

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
}

export function buildRequiredFontEntries(input: {
  families: string[]
  globalByFamily: Map<string, { id: number; url: string; format: string }>
  bundledFonts?: BundledTemplateFont[]
}): RequiredFontEntry[] {
  const bundled = input.bundledFonts ?? []
  return input.families.map((family) => {
    const global = [...input.globalByFamily.entries()].find(([key]) => fontFamilyNamesMatch(key, family))?.[1]
    if (global) {
      return {
        family,
        source: 'global' as const,
        fontId: global.id,
        url: global.url,
        format: global.format,
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
