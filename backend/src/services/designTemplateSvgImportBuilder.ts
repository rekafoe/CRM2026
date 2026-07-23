import path from 'path'
import PizZip from 'pizzip'
import { detectFontFormat, isFontUploadExtension, saveBufferToUploads } from '../config/upload'
import {
  fontFamilyCompactKey,
  guessFontFamilyFromFilename,
  isGenericFontFamily,
  isUnsetFontFamily,
} from '../utils/fontFamilyNormalize'
import { measureDesignFontText } from '../utils/designFontMetrics'
import type { BundledTemplateFont } from '../utils/extractDesignStateFonts'
import {
  parseImportedSvgLayers,
  type PrepressFromSvgGuides,
  type SvgDecor,
  type SvgRect,
  type SvgText,
} from './designTemplateSvgParse'

const IMPORTED_TEMPLATE_SCENE_SCALE_DEFAULT = 3
/** Визитки и мелкие форматы — выше sceneScale, чтобы превью/экран не мылились. */
const IMPORTED_TEMPLATE_SCENE_SCALE_SMALL = 6
const SMALL_FORMAT_LONG_SIDE_MM = 100

export function resolveImportedTemplateSceneScale(widthMm: number, heightMm: number): number {
  const longSide = Math.max(widthMm, heightMm)
  if (Number.isFinite(longSide) && longSide > 0 && longSide <= SMALL_FORMAT_LONG_SIDE_MM) {
    return IMPORTED_TEMPLATE_SCENE_SCALE_SMALL
  }
  return IMPORTED_TEMPLATE_SCENE_SCALE_DEFAULT
}

/** Быстрый peek мм из корневого <svg> — до полного parse, чтобы выбрать sceneScale. */
function peekSvgRootSizeMm(svg: string): { widthMm: number; heightMm: number } {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const attr = (name: string): string | undefined => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
    return m?.[1] ?? m?.[2]
  }
  const toMm = (raw: string | undefined): number | null => {
    if (!raw) return null
    const t = raw.trim()
    const mm = t.match(/^(-?\d+(?:\.\d+)?)\s*mm$/i)
    if (mm) return Number(mm[1])
    const num = t.match(/^(-?\d+(?:\.\d+)?)\s*(?:px)?$/i)
    if (num) return Number(num[1]) * (25.4 / 96)
    return null
  }
  const widthMm = toMm(attr('width'))
  const heightMm = toMm(attr('height'))
  if (widthMm != null && heightMm != null) return { widthMm, heightMm }
  const vb = (attr('viewBox') || '').trim().split(/\s+/).map(Number)
  if (vb.length === 4 && vb.every(Number.isFinite)) {
    return { widthMm: vb[2]! * (25.4 / 96), heightMm: vb[3]! * (25.4 / 96) }
  }
  return { widthMm: 90, heightMm: 50 }
}
const MAX_IMPORTED_SVG_PAGES = 99
const DEFAULT_MAX_IMPORTED_SVG_BYTES = 32 * 1024 * 1024
const ABSOLUTE_MAX_IMPORTED_SVG_BYTES = 64 * 1024 * 1024

function resolveMaxImportedSvgBytes(): number {
  const raw = Number(process.env.IMPORT_MAX_SVG_PAGE_BYTES)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_IMPORTED_SVG_BYTES
  return Math.min(Math.floor(raw), ABSOLUTE_MAX_IMPORTED_SVG_BYTES)
}

const MAX_IMPORTED_SVG_BYTES = resolveMaxImportedSvgBytes()
const MAX_IMPORTED_SVG_TAGS = 120000
const MAX_IMPORTED_SVG_GROUP_DEPTH = 128
const MAX_SVG_NODE_LIMITS: Record<'text' | 'tspan' | 'rect' | 'path', number> = {
  text: 20000,
  tspan: 80000,
  rect: 80000,
  path: 80000,
}

type ParsedSvg = ReturnType<typeof parseImportedSvgLayers>

type ImportFile = {
  buffer?: Buffer
  originalname?: string
  mimetype?: string
}

type BuildDocumentOptions = {
  trace?: boolean
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
    fill: '#bfdbfe',
    stroke: '#1e3a8a',
    strokeWidth: 2.5,
    strokeDashArray: [8, 4],
    rx: 6,
    ry: 6,
    id: rect.name,
    ...(rect.stackIndex != null ? { importStackIndex: rect.stackIndex } : {}),
    isPhotoField: true,
    photoFieldFilled: false,
    photoFieldFw: rect.scene.width,
    photoFieldFh: rect.scene.height,
  }
}

export type TextStyleRun = {
  start: number
  end: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fill?: string
  fontSize?: number
}

export function toTextStyleRuns(
  segments: NonNullable<SvgText['textStyles']>,
  baseFontSizePx: number,
): TextStyleRun[] | undefined {
  if (!segments.length) return undefined
  const runs: TextStyleRun[] = []
  for (const seg of segments) {
    const run: TextStyleRun = { start: seg.start, end: seg.end }
    if (seg.fontFamily) run.fontFamily = seg.fontFamily
    if (seg.fontWeight) run.fontWeight = seg.fontWeight
    if (seg.fontStyle) run.fontStyle = seg.fontStyle
    if (seg.fill) run.fill = seg.fill
    // fontSize в textStyles уже в scene px после parse; не подставляем сырые SVG units.
    if (seg.fontSize != null && seg.fontSize > baseFontSizePx + 0.5) {
      run.fontSize = Math.max(6, seg.fontSize)
    }
    if (run.fontFamily || run.fontWeight || run.fontStyle || run.fill || run.fontSize) {
      runs.push(run)
    }
  }
  return runs.length > 0 ? runs : undefined
}

function toFabricText(item: SvgText) {
  const fontSizePx = Math.max(6, item.scene.fontSize)
  const angle = item.angle ?? 0
  const originX = item.textAnchor === 'middle' ? 'center' : item.textAnchor === 'end' ? 'right' : 'left'
  const textAlign = item.textAnchor === 'end' ? 'right' : item.textAnchor === 'middle' ? 'center' : 'left'
  const top = Math.abs(angle) > 0.5
    ? item.scene.y
    : item.scene.y - (item.ascentScene ?? measureDesignFontText('M', fontSizePx, item.fontFamily)?.ascent ?? fontSizePx * 0.8)
  const textStyleRuns = item.textStyles?.length
    ? toTextStyleRuns(item.textStyles, fontSizePx)
    : undefined
  // Как в Corel: нет family → Arial. Arial из SVG не перезаписываем library/ZIP fallback.
  const baseFontFamily = item.textStyles?.[0]?.fontFamily?.trim()
    || item.fontFamily?.trim()
    || 'Arial'
  const baseFill = item.fill?.trim()
    || item.textStyles?.[0]?.fill?.trim()
    || '#111827'
  const baseFontWeight = item.fontWeight || item.textStyles?.[0]?.fontWeight
  const baseFontStyle = item.fontStyle || item.textStyles?.[0]?.fontStyle
  /**
   * frameWidthScene из SVG — приоритет. Math.max(frame, estimate) раньше всегда
   * раздувал поле, если estimate (maxLineLen * 0.7) был больше реального кадра.
   * Script/decorative — более щедрый estimate, когда frame неизвестен.
   */
  const looksScript = /script|ceremon|cursive|handwrit|calligraph|italic/i.test(baseFontFamily)
  const widthCoeff = looksScript ? 0.85 : 0.55
  const estimatedLineWidth = Math.max(...item.text.split('\n').map((line) => (
    measureDesignFontText(line, fontSizePx, baseFontFamily)?.width ?? Math.max(1, line.length) * fontSizePx * widthCoeff
  )))
  const defaultWidth = Math.max(120, estimatedLineWidth + fontSizePx * 0.9)
  const frameW = item.frameWidthScene
  const width = typeof frameW === 'number' && Number.isFinite(frameW) && frameW > 0
    ? Math.max(frameW, fontSizePx * 1.5)
    : defaultWidth
  return {
    version: '6.0.0',
    type: 'textbox',
    originX,
    originY: 'top' as const,
    left: item.scene.x,
    top,
    width,
    text: item.text,
    fontSize: fontSizePx,
    fontFamily: baseFontFamily,
    fill: baseFill,
    textAlign,
    id: item.name,
    ...(item.stackIndex != null ? { importStackIndex: item.stackIndex } : {}),
    ...(baseFontWeight ? { fontWeight: baseFontWeight } : {}),
    ...(baseFontStyle ? { fontStyle: baseFontStyle } : {}),
    ...(textStyleRuns ? { textStyleRuns } : {}),
    ...(Math.abs(angle) > 0.5 ? { angle } : {}),
  }
}

function toFabricPathCommands(pathData: string): Array<[string, ...number[]]> | null {
  const commands: Array<[string, ...number[]]> = []
  const tokenRe = /([a-zA-Z])([^a-zA-Z]*)/g
  const numberRe = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
  const arity: Record<string, number> = {
    M: 2,
    m: 2,
    L: 2,
    l: 2,
    H: 1,
    h: 1,
    V: 1,
    v: 1,
    C: 6,
    c: 6,
    S: 4,
    s: 4,
    Q: 4,
    q: 4,
    T: 2,
    t: 2,
    A: 7,
    a: 7,
    Z: 0,
    z: 0,
  }
  let token: RegExpExecArray | null
  while ((token = tokenRe.exec(pathData)) !== null) {
    const cmd = token[1]
    const args: number[] = []
    numberRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = numberRe.exec(token[2] ?? '')) !== null) {
      args.push(Number(m[0]))
    }
    const step = arity[cmd]
    if (step == null) continue
    if (step === 0) {
      commands.push([cmd])
      continue
    }
    for (let i = 0; i + step - 1 < args.length; i += step) {
      commands.push([cmd, ...args.slice(i, i + step)])
    }
  }
  return commands.length > 0 ? commands : null
}

function translateFabricPathCommands(
  commands: Array<[string, ...number[]]>,
  dx: number,
  dy: number,
): Array<[string, ...number[]]> {
  return commands.map(([cmd, ...args]) => {
    const lower = cmd.toLowerCase()
    if (lower === 'z') return [cmd] as [string, ...number[]]
    const absolute = cmd === lower ? false : true
    const out: [string, ...number[]] = [cmd]
    let i = 0
    while (i < args.length) {
      if (lower === 'h') {
        out.push(absolute ? args[i]! - dx : args[i]!)
        i += 1
        continue
      }
      if (lower === 'v') {
        out.push(absolute ? args[i]! - dy : args[i]!)
        i += 1
        continue
      }
      if (lower === 'c') {
        for (let j = 0; j < 6 && i + j < args.length; j += 1) {
          out.push(j % 2 === 0
            ? (absolute ? args[i + j]! - dx : args[i + j]!)
            : (absolute ? args[i + j]! - dy : args[i + j]!))
        }
        i += 6
        continue
      }
      if (lower === 's' || lower === 'q') {
        for (let j = 0; j < 4 && i + j < args.length; j += 1) {
          out.push(j % 2 === 0
            ? (absolute ? args[i + j]! - dx : args[i + j]!)
            : (absolute ? args[i + j]! - dy : args[i + j]!))
        }
        i += 4
        continue
      }
      if (lower === 'a') {
        for (let j = 0; j < 7 && i + j < args.length; j += 1) {
          if (j === 5) out.push(absolute ? args[i + j]! - dx : args[i + j]!)
          else if (j === 6) out.push(absolute ? args[i + j]! - dy : args[i + j]!)
          else out.push(args[i + j]!)
        }
        i += 7
        continue
      }
      out.push(absolute ? args[i]! - dx : args[i]!)
      if (i + 1 < args.length) out.push(absolute ? args[i + 1]! - dy : args[i + 1]!)
      i += 2
    }
    return out
  })
}

function toFabricDecor(item: SvgDecor): Record<string, unknown> {
  const base: Record<string, unknown> = {
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: item.scene.x,
    top: item.scene.y,
    width: item.scene.width,
    height: item.scene.height,
    id: item.name,
    ...(item.layerName ? { decorLayerName: item.layerName } : {}),
    ...(item.stackIndex != null ? { importStackIndex: item.stackIndex } : {}),
    isDecorElement: true,
    selectable: false,
    evented: false,
    // Без fill в SVG не подставляем тёмный дефолт — иначе page underlay / пустые фигуры
    // превращаются в чёрный прямоугольник на весь лист.
    fill: item.fill ?? 'transparent',
    ...(item.stroke ? { stroke: item.stroke } : {}),
    ...(item.strokeWidth != null ? { strokeWidth: item.strokeWidth } : {}),
    ...(item.opacity != null ? { opacity: item.opacity } : {}),
  }
  if (item.shape === 'image' && item.imageSrc) {
    const w = Math.max(Number(item.scene.width) || 0, 1)
    const h = Math.max(Number(item.scene.height) || 0, 1)
    return {
      version: '6.0.0',
      type: 'image',
      originX: 'left',
      originY: 'top',
      left: item.scene.x,
      top: item.scene.y,
      width: w,
      height: h,
      scaleX: 1,
      scaleY: 1,
      src: item.imageSrc,
      crossOrigin: 'anonymous',
      id: item.name,
      ...(item.layerName ? { decorLayerName: item.layerName } : {}),
      ...(item.stackIndex != null ? { importStackIndex: item.stackIndex } : {}),
      isDecorElement: true,
      selectable: false,
      evented: false,
      ...(item.opacity != null ? { opacity: item.opacity } : {}),
    }
  }
  if (item.shape === 'circle') {
    return {
      ...base,
      type: 'circle',
      radius: Math.max(0.5, Math.min(item.scene.width, item.scene.height) / 2),
      scaleX: item.scene.width / Math.max(1, Math.min(item.scene.width, item.scene.height)),
      scaleY: item.scene.height / Math.max(1, Math.min(item.scene.width, item.scene.height)),
    }
  }
  if (item.shape === 'path' && item.pathData) {
    const path = toFabricPathCommands(item.pathData)
    if (path) {
      // Path-команды в SVG user units; scene — в px холста. Без scale Fabric
      // пересчитает width/height из path и декор станет в ~sceneScale раз больше.
      const svgW = Math.max(Number(item.svg.width) || 0, 1e-6)
      const svgH = Math.max(Number(item.svg.height) || 0, 1e-6)
      return {
        ...base,
        type: 'path',
        path: translateFabricPathCommands(path, item.svg.x, item.svg.y),
        width: item.svg.width,
        height: item.svg.height,
        scaleX: item.scene.width / svgW,
        scaleY: item.scene.height / svgH,
      }
    }
  }
  return {
    ...base,
    type: 'rect',
    rx: 0,
    ry: 0,
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
    decor: parsed.interactiveLayers
      .filter((layer): layer is { kind: 'decor'; data: SvgDecor } => layer.kind === 'decor')
      .map((layer) => ({ name: layer.data.name, shape: layer.data.shape, svg: layer.data.svg, scene: layer.data.scene })),
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

function formatSvgSizeMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')
}

function importError(message: string, warnings: string[], code = 'IMPORT_ERROR'): never {
  const coded = `[${code}] ${message}`
  throw Object.assign(new Error(coded), {
    importErrors: [coded],
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

/** Папка размера: 204x204 / 204х204 / 148×210 */
const SIZE_FOLDER_RE = /^(\d+(?:[.,]\d+)?)\s*[xх×XХ]\s*(\d+(?:[.,]\d+)?)$/u

export function parseSizeFolderLabel(folder: string): { width: number; height: number } | null {
  const m = folder.trim().match(SIZE_FOLDER_RE)
  if (!m) return null
  const width = Number(String(m[1]).replace(',', '.'))
  const height = Number(String(m[2]).replace(',', '.'))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

function listZipSvgEntries(zip: PizZip): Array<{ name: string; svg: string }> {
  return Object.entries(zip.files)
    .filter(([name, entry]) => !entry.dir && path.extname(name).toLowerCase() === '.svg' && !shouldSkipZipEntry(name))
    .sort(([a], [b]) => sortPageEntryNames(a, b))
    .map(([name, entry]) => ({ name: name.replace(/\\/g, '/'), svg: entry.asText() }))
}

/**
 * Ищет сегмент пути вида 204x204 (на любой глубине: и `204x204/a.svg`, и `Свадьба/204x204/a.svg`).
 */
export function findSizeFolderSegment(entryPath: string): string | null {
  const parts = entryPath.replace(/\\/g, '/').split('/').filter(Boolean)
  for (const part of parts.slice(0, -1)) {
    // последний сегмент — имя файла; папки размера только среди родителей
    if (parseSizeFolderLabel(part)) return part
  }
  return null
}

/**
 * Если все SVG лежат в папках вида 204x204 (в т.ч. под одной обёрткой) — multi-size ZIP.
 * Иначе (SVG без size-папки) — обычный single-size ZIP.
 */
export function groupZipSvgEntriesBySizeFolder(
  entries: Array<{ name: string; svg: string }>,
): Map<string, Array<{ name: string; svg: string }>> | null {
  const nonFont = entries.filter((e) => !/(?:^|\/)fonts\//i.test(e.name))
  if (nonFont.length === 0) return null

  const groups = new Map<string, Array<{ name: string; svg: string }>>()
  let ungrouped = 0
  for (const entry of nonFont) {
    const folder = findSizeFolderSegment(entry.name)
    if (!folder) {
      ungrouped += 1
      continue
    }
    const list = groups.get(folder) ?? []
    list.push(entry)
    groups.set(folder, list)
  }

  if (groups.size === 0 || ungrouped > 0) return null
  return groups
}

export type ImportedSizeVariantDocument = {
  folderLabel: string
  hintWidthMm: number
  hintHeightMm: number
  document: ImportedSvgTemplateDocument
}

function buildDocumentFromSvgEntries(
  entries: Array<{ name: string; svg: string }>,
  templateName: string,
  warnings: string[],
  options: BuildDocumentOptions,
  bundledFonts: BundledTemplateFont[],
  normalizedFormat: 'svg' | 'svg-zip',
  originalName: string,
  bufferSize: number,
): ImportedSvgTemplateDocument {
  const pages = entries.slice(0, MAX_IMPORTED_SVG_PAGES).map((entry, index) => buildPageFromSvg({
    svg: entry.svg,
    originalName: path.basename(entry.name),
    pageIndex: index,
    templateName,
    warnings,
    bundledFonts,
    trace: options.trace === true,
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
    normalizedFormat,
    normalizedFileUrl: first.normalizedFileUrl,
    normalizedOriginalName: originalName || first.normalizedOriginalName,
    normalizedSize: bufferSize || first.normalizedSize,
    pages,
    bundledFonts,
  }
}

/** Multi-size ZIP → один документ на папку размера. */
export function buildImportedMultiSizeSvgDocuments(
  file: ImportFile,
  templateName: string,
  warnings: string[],
  options: BuildDocumentOptions = {},
): ImportedSizeVariantDocument[] | null {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (ext !== '.zip' || !file.buffer?.length) return null

  let zip: PizZip
  try {
    zip = new PizZip(file.buffer)
  } catch {
    return null
  }

  const allEntries = listZipSvgEntries(zip)
  const groups = groupZipSvgEntriesBySizeFolder(allEntries)
  if (!groups) return null

  const bundledFonts = readZipFontEntries(file, templateName, warnings)
  const variants: ImportedSizeVariantDocument[] = []
  const seenMm = new Set<string>()

  for (const [folderLabel, entries] of [...groups.entries()].sort(([a], [b]) => sortPageEntryNames(a, b))) {
    const hint = parseSizeFolderLabel(folderLabel)!
    const document = buildDocumentFromSvgEntries(
      entries,
      `${templateName}-${folderLabel}`,
      warnings,
      options,
      bundledFonts,
      'svg-zip',
      file.originalname || `${folderLabel}.zip`,
      file.buffer?.length ?? 0,
    )
    const mmKey = `${document.pageWidthMm.toFixed(1)}x${document.pageHeightMm.toFixed(1)}`
    if (seenMm.has(mmKey)) {
      importError(
        `В ZIP два размера с одинаковыми мм SVG (${document.pageWidthMm}×${document.pageHeightMm}): папка «${folderLabel}».`,
        warnings,
      )
    }
    seenMm.add(mmKey)

    if (
      Math.abs(document.pageWidthMm - hint.width) > 1.5
      || Math.abs(document.pageHeightMm - hint.height) > 1.5
    ) {
      warnings.push(
        `Папка «${folderLabel}»: мм из SVG (${document.pageWidthMm}×${document.pageHeightMm}) `
        + `отличаются от имени папки (${hint.width}×${hint.height}). Используем мм из SVG.`,
      )
    }

    variants.push({
      folderLabel,
      hintWidthMm: hint.width,
      hintHeightMm: hint.height,
      document,
    })
  }

  if (variants.length === 0) return null
  return variants
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

function countDrawableSvgNodes(svg: string): number {
  const matches = svg.match(/<(rect|circle|ellipse|path|polygon|polyline|line|image|text)\b/gi)
  return matches?.length ?? 0
}

function matchBundledFontToTextLayer(
  textName: string,
  bundled: BundledTemplateFont[],
): BundledTemplateFont | undefined {
  const rawSuffix = textName.replace(/^text_/i, '').trim()
  const suffixKey = fontFamilyCompactKey(rawSuffix)
  if (!suffixKey) return undefined
  const normalizedHint = rawSuffix.replace(/[_-]+/g, ' ')
  const hasExplicitFontHint = /\b(font|fnt|family|typeface)\b/i.test(normalizedHint)
  return bundled.find((font) => {
    const familyKey = fontFamilyCompactKey(font.family)
    const fileKey = fontFamilyCompactKey(guessFontFamilyFromFilename(font.filename))
    if (familyKey === suffixKey || fileKey === suffixKey) return true
    if (!hasExplicitFontHint) return false
    return familyKey.includes(suffixKey) || suffixKey.includes(familyKey)
      || fileKey.includes(suffixKey) || suffixKey.includes(fileKey)
  })
}

function collectNonGenericFontFamilies(parsed: ReturnType<typeof parseImportedSvgLayers>): string[] {
  const families = new Set<string>()
  const add = (family?: string) => {
    if (!isGenericFontFamily(family) && family?.trim()) {
      families.add(family.trim())
    }
  }
  for (const item of parsed.textItems) {
    add(item.fontFamily)
    for (const seg of item.textStyles ?? []) {
      add(seg.fontFamily)
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
    const matched = matchBundledFontToTextLayer(text.name, bundledFonts)
    // Только пустой family; Arial из Corel оставляем как есть.
    if (matched && isUnsetFontFamily(text.fontFamily)) {
      text.fontFamily = matched.family
    }
    if (matched && text.textStyles?.length) {
      for (const seg of text.textStyles) {
        if (isUnsetFontFamily(seg.fontFamily)) {
          seg.fontFamily = matched.family
        }
      }
    }
  }

  const unresolved = parsed.textItems.filter((item) => isUnsetFontFamily(item.fontFamily))
  if (unresolved.length > 0) {
    warnings.push(
      `Страница ${pageIndex + 1}: для ${unresolved.map((t) => t.name).join(', ')} не найден font-family в SVG `
      + `(будет Arial). В ZIP: ${bundledFonts.map((f) => f.family).join(', ')}. `
      + 'Проверьте экспорт или имя text_<шрифт>.',
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
  trace?: boolean
}): StoredImportedSvgPage {
  const svgBytes = Buffer.byteLength(input.svg, 'utf8')
  if (svgBytes > MAX_IMPORTED_SVG_BYTES) {
    importError(
      `SVG страницы ${input.pageIndex + 1} слишком большой (${formatSvgSizeMb(svgBytes)} МБ, лимит ${formatSvgSizeMb(MAX_IMPORTED_SVG_BYTES)} МБ). `
      + 'Часто это встроенные растровые изображения из Corel — упростите фон страницы или задайте IMPORT_MAX_SVG_PAGE_BYTES (до 64 МБ).',
      input.warnings,
      'SVG_SIZE_LIMIT_EXCEEDED',
    )
  }
  const tagApprox = (input.svg.match(/</g) ?? []).length
  if (tagApprox > MAX_IMPORTED_SVG_TAGS) {
    importError(
      `SVG страницы ${input.pageIndex + 1} слишком сложный (${tagApprox} тегов), лимит ${MAX_IMPORTED_SVG_TAGS}.`,
      input.warnings,
      'SVG_COMPLEXITY_LIMIT_EXCEEDED',
    )
  }
  const groupDepthApprox = (() => {
    const re = /<\/?g\b/gi
    let depth = 0
    let maxDepth = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(input.svg)) !== null) {
      const token = m[0]
      if (token.startsWith('</')) depth = Math.max(0, depth - 1)
      else {
        depth += 1
        if (depth > maxDepth) maxDepth = depth
      }
    }
    return maxDepth
  })()
  if (groupDepthApprox > MAX_IMPORTED_SVG_GROUP_DEPTH) {
    importError(
      `SVG страницы ${input.pageIndex + 1} слишком глубоко вложен (${groupDepthApprox}), лимит ${MAX_IMPORTED_SVG_GROUP_DEPTH}.`,
      input.warnings,
      'SVG_GROUP_DEPTH_LIMIT_EXCEEDED',
    )
  }
  for (const [tag, limit] of Object.entries(MAX_SVG_NODE_LIMITS) as Array<[keyof typeof MAX_SVG_NODE_LIMITS, number]>) {
    const re = new RegExp(`<${tag}\\b`, 'gi')
    const count = (input.svg.match(re) ?? []).length
    if (count > limit) {
      importError(
        `SVG страницы ${input.pageIndex + 1}: узлов <${tag}> ${count}, лимит ${limit}.`,
        input.warnings,
        'SVG_NODE_COUNT_LIMIT_EXCEEDED',
      )
    }
  }

  const sanitized = sanitizeSvg(input.svg)
  const peek = peekSvgRootSizeMm(sanitized)
  const sceneScale = resolveImportedTemplateSceneScale(peek.widthMm, peek.heightMm)
  const parsed = parseImportedSvgLayers(sanitized, {
    sceneScale,
    trace: input.trace === true,
  })
  const bundledFonts = input.bundledFonts ?? []
  applyBundledFontFallbacks(parsed, bundledFonts, input.warnings, input.pageIndex)
  warnFontsNotInBundledZip(collectNonGenericFontFamilies(parsed), bundledFonts, input.warnings, input.pageIndex)
  input.warnings.push(...parsed.warnings.map((warning) => `Страница ${input.pageIndex + 1}: ${warning}`))

  if (parsed.removalRanges.length > 0) {
    input.warnings.push(
      `Страница ${input.pageIndex + 1}: интерактивные и направляющие слои вырезаны из SVG-фона.`,
    )
  }
  const drawableInStripped = countDrawableSvgNodes(parsed.strippedSvg)
  if (!parsed.lockedBgDetected && drawableInStripped > 0) {
    input.warnings.push(
      `Страница ${input.pageIndex + 1}: в SVG-фоне осталось ${drawableInStripped} нераспознанных фигур (image/text/polygon и т.п.). Rect/circle/ellipse/path без подписи импортируются как decor_auto_*; для фона добавьте locked_bg / locked_bg_ на весь лист.`,
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
          ...(parsed.lockedBgDetected
            ? [toFabricBackground(previewUrl, parsed.geometry.scenePx, parsed.geometry.sceneScale)]
            : []),
          ...parsed.interactiveLayers.map((layer) => (
            layer.kind === 'photo'
              ? toFabricRect(layer.data)
              : layer.kind === 'text'
                ? toFabricText(layer.data)
                : toFabricDecor(layer.data)
          )),
        ],
        background: parsed.pageBackgroundFill || 'white',
      },
    },
  }
}

/** @internal exported for tests */
export function fabricTextFromSvgText(item: SvgText) {
  return toFabricText(item)
}

export function buildImportedSvgTemplateDocument(
  file: ImportFile,
  templateName: string,
  warnings: string[],
  options: BuildDocumentOptions = {},
): ImportedSvgTemplateDocument {
  const ext = path.extname(file.originalname || '').toLowerCase()
  const bundledFonts = ext === '.zip'
    ? readZipFontEntries(file, templateName, warnings)
    : []
  const entries = readSvgEntries(file, ext, warnings)
  return buildDocumentFromSvgEntries(
    entries,
    templateName,
    warnings,
    options,
    bundledFonts,
    ext === '.zip' ? 'svg-zip' : 'svg',
    file.originalname || '',
    file.buffer?.length ?? 0,
  )
}
