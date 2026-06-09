import path from 'path'
import PizZip from 'pizzip'
import { detectFontFormat, isFontUploadExtension, saveBufferToUploads } from '../config/upload'
import {
  fontFamilyCompactKey,
  guessFontFamilyFromFilename,
  isGenericFontFamily,
} from '../utils/fontFamilyNormalize'
import type { BundledTemplateFont } from '../utils/extractDesignStateFonts'
import {
  parseImportedSvgLayers,
  type PrepressFromSvgGuides,
  type SvgRect,
  type SvgText,
} from './designTemplateSvgParse'

const IMPORTED_TEMPLATE_SCENE_SCALE = 3
const MAX_IMPORTED_SVG_PAGES = 99

type ParsedSvg = ReturnType<typeof parseImportedSvgLayers>

type ImportFile = {
  buffer?: Buffer
  originalname?: string
  mimetype?: string
}

export type StoredImportedSvgPage = {
  originalName: string
  previewUrl: string
  normalizedFileUrl: string
  normalizedOriginalName: string
  normalizedSize: number
  parsed: ParsedSvg
  designPage: {
    fabricJSON: {
      version: string
      objects: Array<Record<string, unknown>>
      background: string
    }
  }
  prepress?: Record<string, unknown>
}

export type ImportedSvgTemplateDocument = {
  pageWidthMm: number
  pageHeightMm: number
  pageCount: number
  previewUrl: string
  normalizedFormat: 'svg' | 'svg-zip'
  normalizedFileUrl: string
  normalizedOriginalName: string
  normalizedSize: number
  pages: StoredImportedSvgPage[]
  bundledFonts: BundledTemplateFont[]
}

export function isSupportedNormalizedTemplateExt(ext: string): boolean {
  return ext === '.svg' || ext === '.zip'
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '')
}

function toFabricRect(rect: SvgRect) {
  return {
    type: 'rect',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: rect.scene.x,
    top: rect.scene.y,
    width: rect.scene.width,
    height: rect.scene.height,
    fill: '#eef2f7',
    stroke: '#2563eb',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    rx: 6,
    ry: 6,
    id: rect.name,
    isPhotoField: true,
    photoFieldFilled: false,
    photoFieldFw: rect.scene.width,
    photoFieldFh: rect.scene.height,
  }
}

function toFabricTextStyles(
  text: string,
  segments: NonNullable<SvgText['textStyles']>,
  baseFontSizePx: number,
): Record<number, Record<number, Record<string, unknown>>> | undefined {
  const lines = text.split('\n')
  const lineStartOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStartOffsets.push(offset)
    offset += line.length + 1
  }
  const out: Record<number, Record<number, Record<string, unknown>>> = {}
  for (const seg of segments) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineStart = lineStartOffsets[lineIndex]!
      const lineText = lines[lineIndex] ?? ''
      const lineEnd = lineStart + lineText.length
      if (seg.end <= lineStart || seg.start >= lineEnd) continue
      const charIndex = Math.max(0, seg.start - lineStart)
      const patch: Record<string, unknown> = {}
      if (seg.fontFamily) patch.fontFamily = seg.fontFamily
      if (seg.fontWeight) patch.fontWeight = seg.fontWeight
      if (seg.fontStyle) patch.fontStyle = seg.fontStyle
      if (seg.fill) patch.fill = seg.fill
      if (seg.fontSize != null && Math.abs(seg.fontSize - baseFontSizePx) > 0.5) {
        patch.fontSize = Math.max(6, seg.fontSize)
      }
      if (Object.keys(patch).length === 0) continue
      out[lineIndex] ??= {}
      out[lineIndex]![charIndex] = patch
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function toFabricText(item: SvgText) {
  const fontSizePx = Math.max(6, item.scene.fontSize)
  const angle = item.angle ?? 0
  const originX = item.textAnchor === 'middle' ? 'center' : item.textAnchor === 'end' ? 'right' : 'left'
  const textAlign = item.textAnchor === 'end' ? 'right' : item.textAnchor === 'middle' ? 'center' : 'left'
  const top = Math.abs(angle) > 0.5
    ? item.scene.y
    : item.scene.y - fontSizePx * 0.8
  const maxLineLen = Math.max(...item.text.split('\n').map((line) => line.length), 1)
  const defaultWidth = Math.max(120, maxLineLen * fontSizePx * 0.55)
  const styles = item.textStyles?.length
    ? toFabricTextStyles(item.text, item.textStyles, fontSizePx)
    : undefined
  const baseFontFamily = item.textStyles?.[0]?.fontFamily?.trim()
    || item.fontFamily?.trim()
    || 'Arial'
  const base = {
    version: '6.0.0',
    originX,
    originY: 'top' as const,
    left: item.scene.x,
    top,
    text: item.text,
    fontSize: fontSizePx,
    fontFamily: baseFontFamily,
    fill: item.fill?.trim() || '#111827',
    textAlign,
    id: item.name,
    ...(item.fontWeight ? { fontWeight: item.fontWeight } : {}),
    ...(item.fontStyle ? { fontStyle: item.fontStyle } : {}),
    ...(styles ? { styles } : {}),
    ...(Math.abs(angle) > 0.5 ? { angle } : {}),
  }
  const useTextbox = item.text.includes('\n')
    || ((item.textAnchor === 'middle' || item.textAnchor === 'end') && Boolean(item.frameWidthScene))
  if (useTextbox) {
    return {
      ...base,
      type: 'textbox',
      width: item.frameWidthScene ?? defaultWidth,
    }
  }
  return {
    ...base,
    type: 'i-text',
  }
}

function toFabricBackground(src: string, scene: { width: number; height: number }, sceneScale: number) {
  const safeScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1
  return {
    type: 'image',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    width: scene.width / safeScale,
    height: scene.height / safeScale,
    scaleX: safeScale,
    scaleY: safeScale,
    src,
    crossOrigin: 'anonymous',
    selectable: false,
    evented: false,
    id: 'locked_bg',
    isBackground: true,
    backgroundFit: 'page',
    backgroundSceneScale: safeScale,
  }
}

export function layerDebug(parsed: ParsedSvg) {
  return {
    photo: parsed.photoRects.map((r) => ({ name: r.name, svg: r.svg, mm: { x: r.x, y: r.y, width: r.width, height: r.height }, scene: r.scene })),
    text: parsed.textItems.map((t) => ({ name: t.name, text: t.text, textAnchor: t.textAnchor, svg: t.svg, mm: { x: t.x, y: t.y, fontSize: t.fontSize }, scene: t.scene })),
    guides: parsed.guideRectsMm,
  }
}

function buildImportedPrepress(
  hints: PrepressFromSvgGuides,
  guideKeys: Partial<Record<'trim' | 'bleed' | 'safe', unknown>>,
): Record<string, unknown> | undefined {
  if (Object.keys(guideKeys).length === 0) return undefined
  return {
    bleedMm: hints.bleedMm,
    safeZoneMm: hints.safeZoneMm,
    showBleed: Boolean(guideKeys.bleed ?? guideKeys.trim),
    showTrim: Boolean(guideKeys.trim),
    showSafeZone: Boolean(guideKeys.safe),
    cutMarks: true,
  }
}

function importError(message: string, warnings: string[]): never {
  throw Object.assign(new Error(message), {
    importErrors: [message],
    importWarnings: warnings,
  })
}

function sortPageEntryNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function shouldSkipZipEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, '/')
  const basename = path.posix.basename(normalized)
  return normalized.startsWith('__MACOSX/')
    || basename.startsWith('.')
    || basename.startsWith('~')
}

function readZipFontEntries(
  file: ImportFile,
  templateName: string,
  warnings: string[],
): BundledTemplateFont[] {
  if (!file.buffer?.length) return []
  let zip: PizZip
  try {
    zip = new PizZip(file.buffer)
  } catch {
    return []
  }

  const fonts: BundledTemplateFont[] = []
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || shouldSkipZipEntry(name)) continue
    const normalized = name.replace(/\\/g, '/')
    const basename = path.posix.basename(normalized)
    const ext = path.extname(basename).toLowerCase()
    if (!isFontUploadExtension(ext)) continue
    const inFontsFolder = /(?:^|\/)fonts\//i.test(normalized)
    if (!inFontsFolder && Object.keys(zip.files).some((k) => /fonts\//i.test(k.replace(/\\/g, '/')))) {
      continue
    }
    const buffer = entry.asNodeBuffer()
    const stored = saveBufferToUploads(buffer, basename, `${templateName}-font`)
    if (!stored) continue
    const family = guessFontFamilyFromFilename(basename)
    fonts.push({
      family,
      source: 'bundled',
      filename: stored.filename,
      url: `/api/uploads/${stored.filename}`,
      format: detectFontFormat(basename),
    })
  }

  if (fonts.length > 0) {
    warnings.push(`Импорт ZIP: найдено файлов шрифтов: ${fonts.length}.`)
  }
  return fonts
}

function readSvgEntries(file: ImportFile, ext: string, warnings: string[]): Array<{ name: string; svg: string }> {
  if (!file.buffer?.length) importError('Файл не загружен или пустой.', warnings)
  if (ext === '.svg') {
    return [{ name: file.originalname || 'page-1.svg', svg: file.buffer.toString('utf8') }]
  }

  let zip: PizZip
  try {
    zip = new PizZip(file.buffer)
  } catch {
    importError('Не удалось прочитать ZIP с SVG-страницами.', warnings)
  }

  const svgEntries = Object.entries(zip.files)
    .filter(([name, entry]) => !entry.dir && path.extname(name).toLowerCase() === '.svg' && !shouldSkipZipEntry(name))
    .sort(([a], [b]) => sortPageEntryNames(a, b))

  const entries = svgEntries
    .slice(0, MAX_IMPORTED_SVG_PAGES)
    .map(([name, entry]) => ({ name, svg: entry.asText() }))

  if (entries.length === 0) {
    importError('В ZIP не найдено SVG-страниц. Добавьте файлы .svg в корень или папку архива.', warnings)
  }
  if (svgEntries.length > MAX_IMPORTED_SVG_PAGES) {
    warnings.push(`Импорт ограничен ${MAX_IMPORTED_SVG_PAGES} страницами: лишние SVG из ZIP пропущены.`)
  }
  return entries
}

function samePageSize(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.2
}

function matchBundledFontToTextLayer(
  textName: string,
  bundled: BundledTemplateFont[],
): BundledTemplateFont | undefined {
  const suffixKey = fontFamilyCompactKey(textName.replace(/^text_/i, ''))
  if (!suffixKey) return undefined
  return bundled.find((font) => {
    const familyKey = fontFamilyCompactKey(font.family)
    const fileKey = fontFamilyCompactKey(guessFontFamilyFromFilename(font.filename))
    return familyKey.includes(suffixKey) || suffixKey.includes(familyKey)
      || fileKey.includes(suffixKey) || suffixKey.includes(fileKey)
  })
}

function collectNonGenericFontFamilies(parsed: ReturnType<typeof parseImportedSvgLayers>): string[] {
  const families = new Set<string>()
  for (const item of parsed.textItems) {
    if (!isGenericFontFamily(item.fontFamily) && item.fontFamily?.trim()) {
      families.add(item.fontFamily.trim())
    }
  }
  return [...families]
}

function warnFontsNotInBundledZip(
  usedFamilies: string[],
  bundledFonts: BundledTemplateFont[],
  warnings: string[],
  pageIndex: number,
): void {
  if (usedFamilies.length === 0 || bundledFonts.length === 0) return
  const bundledKeys = new Set(bundledFonts.map((font) => fontFamilyCompactKey(font.family)))
  const notInZip = usedFamilies.filter((family) => !bundledKeys.has(fontFamilyCompactKey(family)))
  if (notInZip.length > 0) {
    warnings.push(
      `Страница ${pageIndex + 1}: в SVG шрифты «${notInZip.join('», «')}» не совпадают с папкой fonts/ `
      + `(в ZIP: ${bundledFonts.map((f) => f.family).join(', ')}). `
      + 'Добавьте файлы с тем же family_name в библиотеку CRM (/adminpanel/design-fonts).',
    )
  }
}

function applyBundledFontFallbacks(
  parsed: ReturnType<typeof parseImportedSvgLayers>,
  bundledFonts: BundledTemplateFont[],
  warnings: string[],
  pageIndex: number,
): void {
  if (bundledFonts.length === 0) return

  for (const layer of parsed.interactiveLayers) {
    if (layer.kind !== 'text') continue
    const text = layer.data
    if (!isGenericFontFamily(text.fontFamily)) continue

    const matched = matchBundledFontToTextLayer(text.name, bundledFonts)
    if (matched) {
      text.fontFamily = matched.family
      continue
    }
    if (bundledFonts.length === 1) {
      text.fontFamily = bundledFonts[0].family
      warnings.push(
        `Страница ${pageIndex + 1}: для ${text.name} применён единственный шрифт из ZIP (${bundledFonts[0].family}).`,
      )
    }
  }

  const unresolved = parsed.textItems.filter((item) => isGenericFontFamily(item.fontFamily))
  if (unresolved.length > 0) {
    warnings.push(
      `Страница ${pageIndex + 1}: для ${unresolved.map((t) => t.name).join(', ')} не найден font-family в SVG. `
      + `В ZIP: ${bundledFonts.map((f) => f.family).join(', ')}. `
      + 'Проверьте экспорт (font-family на слое) или имя text_<шрифт>.',
    )
  }
}

function buildPageFromSvg(input: {
  svg: string
  originalName: string
  pageIndex: number
  templateName: string
  warnings: string[]
  bundledFonts?: BundledTemplateFont[]
}): StoredImportedSvgPage {
  const parsed = parseImportedSvgLayers(sanitizeSvg(input.svg), { sceneScale: IMPORTED_TEMPLATE_SCENE_SCALE })
  const bundledFonts = input.bundledFonts ?? []
  applyBundledFontFallbacks(parsed, bundledFonts, input.warnings, input.pageIndex)
  warnFontsNotInBundledZip(collectNonGenericFontFamilies(parsed), bundledFonts, input.warnings, input.pageIndex)
  input.warnings.push(...parsed.warnings.map((warning) => `Страница ${input.pageIndex + 1}: ${warning}`))

  if (parsed.removalRanges.length > 0) {
    input.warnings.push(
      `Страница ${input.pageIndex + 1}: интерактивные и направляющие слои вырезаны из SVG-фона.`,
    )
  }

  const stored = saveBufferToUploads(
    Buffer.from(parsed.strippedSvg, 'utf8'),
    input.originalName,
    `${input.templateName}-page-${input.pageIndex + 1}`,
  )
  if (!stored) importError(`Не удалось сохранить SVG страницы ${input.pageIndex + 1}.`, input.warnings)

  const previewUrl = `/api/uploads/${stored.filename}`
  const prepress =
    parsed.prepressHints && Object.keys(parsed.guideRectsMm).length > 0
      ? buildImportedPrepress(parsed.prepressHints, parsed.guideRectsMm)
      : undefined

  return {
    originalName: input.originalName,
    previewUrl,
    normalizedFileUrl: previewUrl,
    normalizedOriginalName: stored.originalName,
    normalizedSize: stored.size,
    parsed,
    prepress,
    designPage: {
      fabricJSON: {
        version: '6.0.0',
        objects: [
          toFabricBackground(previewUrl, parsed.geometry.scenePx, parsed.geometry.sceneScale),
          ...parsed.interactiveLayers.map((layer) => (
            layer.kind === 'photo' ? toFabricRect(layer.data) : toFabricText(layer.data)
          )),
        ],
        background: 'white',
      },
    },
  }
}

export function buildImportedSvgTemplateDocument(
  file: ImportFile,
  templateName: string,
  warnings: string[],
): ImportedSvgTemplateDocument {
  const ext = path.extname(file.originalname || '').toLowerCase()
  const bundledFonts = ext === '.zip'
    ? readZipFontEntries(file, templateName, warnings)
    : []
  const entries = readSvgEntries(file, ext, warnings)
  const pages = entries.map((entry, index) => buildPageFromSvg({
    svg: entry.svg,
    originalName: path.basename(entry.name),
    pageIndex: index,
    templateName,
    warnings,
    bundledFonts,
  }))
  const first = pages[0]
  if (!first) importError('Не удалось собрать страницы шаблона.', warnings)

  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index]
    if (!samePageSize(first.parsed.widthMm, page.parsed.widthMm) || !samePageSize(first.parsed.heightMm, page.parsed.heightMm)) {
      importError(
        `Размер SVG страницы ${index + 1} (${page.parsed.widthMm}×${page.parsed.heightMm} мм) отличается от первой (${first.parsed.widthMm}×${first.parsed.heightMm} мм).`,
        warnings,
      )
    }
  }

  return {
    pageWidthMm: first.parsed.widthMm,
    pageHeightMm: first.parsed.heightMm,
    pageCount: pages.length,
    previewUrl: first.previewUrl,
    normalizedFormat: ext === '.zip' ? 'svg-zip' : 'svg',
    normalizedFileUrl: first.normalizedFileUrl,
    normalizedOriginalName: file.originalname || first.normalizedOriginalName,
    normalizedSize: file.buffer?.length ?? first.normalizedSize,
    pages,
    bundledFonts,
  }
}
