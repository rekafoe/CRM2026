import { linkedFontPropsFromStored } from './fontFileMetadata'
import {
  fontFamilyBaseCompactKey,
  fontFamilyCompactKey,
  fontFamilyNamesMatch,
  isUnsetFontFamily,
  normalizeFontFamilyName,
} from './fontFamilyNormalize'
import { collectFontFamiliesFromTextField, type TextStyleRun } from './textStyleRuns'

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
  collectFontFamiliesFromTextField(obj, families)
}

function walkFabricTextStyleRuns(obj: FabricObj, visit: (run: TextStyleRun) => void): void {
  const runs = obj.textStyleRuns
  if (!Array.isArray(runs)) return
  for (const run of runs) {
    if (run && typeof run === 'object' && !Array.isArray(run)) visit(run as TextStyleRun)
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
  name_aliases?: string[]
  weight?: string
  style?: string
}

export type RequiredFontEntry = {
  family: string
  source: 'global' | 'bundled' | 'missing'
  fontId?: number
  url?: string
  format?: string
  name_aliases?: string[]
  weight?: string
  style?: string
}

export type GlobalFontRef = {
  id: number
  url: string
  format: string
  /** Каноническое имя в библиотеке CRM (family_name). */
  family: string
  name_aliases?: string[]
  weight?: string
  style?: string
}

export function matchBundledFontByFamily(
  family: string,
  bundled: BundledTemplateFont[],
): BundledTemplateFont | undefined {
  const targetKey = fontFamilyCompactKey(family)
  const targetBase = fontFamilyBaseCompactKey(family)
  if (!targetKey && !targetBase) return undefined
  return bundled.find((b) => {
    const names = [b.family, ...(b.name_aliases ?? [])].filter(Boolean)
    return names.some((name) => {
      if (fontFamilyNamesMatch(name, family)) return true
      const k = fontFamilyCompactKey(name)
      const base = fontFamilyBaseCompactKey(name)
      return Boolean((targetKey && k === targetKey) || (targetBase && base === targetBase))
    })
  })
}

export function bundledFontsToLibraryLinks(
  bundled: BundledTemplateFont[] | undefined,
): Array<{ family_name: string; name_aliases?: string[]; weight?: string; style?: string }> {
  if (!bundled?.length) return []
  return bundled
    .filter((b) => Boolean(b?.family?.trim()))
    .map((b) => ({
      family_name: b.family,
      name_aliases: b.name_aliases,
      weight: b.weight,
      style: b.style,
    }))
}

export function buildRequiredFontEntries(input: {
  families: string[]
  globalByFamily: Map<string, GlobalFontRef>
  bundledFonts?: BundledTemplateFont[]
}): RequiredFontEntry[] {
  const bundled = input.bundledFonts ?? []
  return input.families.map((family) => {
    const global = input.globalByFamily.get(fontFamilyCompactKey(family))
      ?? input.globalByFamily.get(fontFamilyBaseCompactKey(family))
    if (global) {
      return {
        family: global.family,
        source: 'global' as const,
        fontId: global.id,
        url: global.url,
        format: global.format,
        name_aliases: global.name_aliases,
        ...(global.weight ? { weight: global.weight } : {}),
        ...(global.style ? { style: global.style } : {}),
      }
    }
    const bundledMatch = matchBundledFontByFamily(family, bundled)
    if (bundledMatch) {
      return {
        family: normalizeFontFamilyName(bundledMatch.family) || family,
        source: 'bundled' as const,
        url: bundledMatch.url,
        format: bundledMatch.format,
        ...(bundledMatch.name_aliases?.length ? { name_aliases: bundledMatch.name_aliases } : {}),
        ...(bundledMatch.weight ? { weight: bundledMatch.weight } : {}),
        ...(bundledMatch.style ? { style: bundledMatch.style } : {}),
      }
    }
    return { family, source: 'missing' as const }
  })
}

export function hasMissingRequiredFonts(entries: RequiredFontEntry[]): boolean {
  return entries.some((e) => e.source === 'missing')
}

type LibraryFontRef = { family_name: string; name_aliases?: string[] }

/**
 * Точное сопоставление text_<hint> с family_name / aliases.
 * Без substring includes — иначе text_time ложно матчит Happy Time.
 */
function matchLibraryFontToTextLayer(
  textId: string,
  libraryFonts: LibraryFontRef[],
): string | undefined {
  const suffixRaw = textId.replace(/^text_/i, '')
  const suffixKey = fontFamilyCompactKey(suffixRaw)
  const suffixBase = fontFamilyBaseCompactKey(suffixRaw)
  if (!suffixKey && !suffixBase) return undefined
  for (const font of libraryFonts) {
    const canonical = normalizeFontFamilyName(font.family_name)
    if (!canonical) continue
    const names = [canonical, ...(font.name_aliases ?? [])]
    for (const name of names) {
      if (fontFamilyNamesMatch(name, suffixRaw)) return canonical
      const familyKey = fontFamilyCompactKey(name)
      const familyBase = fontFamilyBaseCompactKey(name)
      if (
        (suffixKey && familyKey && familyKey === suffixKey)
        || (suffixBase && familyBase && familyBase === suffixBase)
      ) {
        return canonical
      }
    }
  }
  return undefined
}

/**
 * Для text_* без font-family в SVG (пустая строка) подставляет шрифт из библиотеки
 * по имени слоя: text_voguella → Voguella.
 * Arial из Corel не трогаем — это явная заглушка экспорта, не «пусто».
 */
export function applyLibraryFontFallbacksToDesignState(
  designState: unknown,
  libraryFonts: LibraryFontRef[],
): unknown {
  if (!designState || typeof designState !== 'object' || Array.isArray(designState)) return designState
  const pages = (designState as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return designState

  const applyFabric = (value: unknown): void => {
    walkFabric(value, (obj) => {
      const id = String(obj.id ?? '')
      if (!id.toLowerCase().startsWith('text_')) return
      const matched = libraryFonts.length > 0
        ? matchLibraryFontToTextLayer(id, libraryFonts)
        : undefined
      const currentFamily = String(obj.fontFamily ?? '')
      if (matched && isUnsetFontFamily(currentFamily)) {
        obj.fontFamily = matched
      } else if (isUnsetFontFamily(String(obj.fontFamily ?? ''))) {
        obj.fontFamily = 'Arial'
      }
      walkFabricTextStyles(obj, (style) => {
        const segFamily = String(style.fontFamily ?? '')
        if (matched && isUnsetFontFamily(segFamily)) {
          style.fontFamily = matched
        } else if (isUnsetFontFamily(segFamily)) {
          style.fontFamily = 'Arial'
        }
      })
      walkFabricTextStyleRuns(obj, (run) => {
        const segFamily = String(run.fontFamily ?? '')
        if (matched && isUnsetFontFamily(segFamily)) {
          run.fontFamily = matched
        } else if (isUnsetFontFamily(segFamily)) {
          run.fontFamily = 'Arial'
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

type LibraryFontLink = { family_name: string; name_aliases?: string[]; weight?: string; style?: string }

function libraryFontByName(fonts: LibraryFontLink[]): Map<string, LibraryFontLink> {
  const map = new Map<string, LibraryFontLink>()
  for (const font of fonts) {
    const canonical = normalizeFontFamilyName(font.family_name)
    if (!canonical) continue
    const names = [canonical, ...(font.name_aliases ?? [])]
    for (const name of names) {
      for (const key of [fontFamilyCompactKey(name), fontFamilyBaseCompactKey(name)]) {
        if (key && !map.has(key)) map.set(key, font)
      }
    }
  }
  return map
}

function applyLibraryFontLink(
  record: FabricObj,
  inheritedFamily: string | undefined,
  fontsByName: Map<string, LibraryFontLink>,
  keepVariant = false,
): string | undefined {
  const raw = normalizeFontFamilyName(String(record.fontFamily ?? '')) || inheritedFamily || ''
  if (!raw) return inheritedFamily
  const font = fontsByName.get(fontFamilyCompactKey(raw)) ?? fontsByName.get(fontFamilyBaseCompactKey(raw))
  const canonical = font ? normalizeFontFamilyName(font.family_name) : ''
  if (record.fontFamily && canonical) record.fontFamily = canonical
  if (keepVariant || record.fontVariantPinned === true) return canonical || raw
  const linked = font ? linkedFontPropsFromStored(font.weight, font.style) : null
  if (linked) {
    record.fontWeight = linked.fontWeight
    record.fontStyle = linked.fontStyle
  }
  return canonical || raw
}

/** Приводит fontFamily к имени из библиотеки и ставит вес/стиль загруженного файла. */
export function normalizeDesignStateFontFamilies(
  designState: unknown,
  libraryFonts: LibraryFontLink[],
): unknown {
  if (!designState || typeof designState !== 'object' || Array.isArray(designState)) return designState
  const pages = (designState as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return designState

  const fontsByName = libraryFontByName(libraryFonts)

  const normalizeFabric = (value: unknown): void => {
    walkFabric(value, (obj) => {
      const family = applyLibraryFontLink(obj, undefined, fontsByName)
      const keepVariant = obj.fontVariantPinned === true
      walkFabricTextStyles(obj, (style) => {
        applyLibraryFontLink(style, family, fontsByName, keepVariant)
      })
      walkFabricTextStyleRuns(obj, (run) => {
        applyLibraryFontLink(run as FabricObj, family, fontsByName, keepVariant)
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
