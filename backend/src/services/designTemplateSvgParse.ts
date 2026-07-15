/**
 * Именованные слои импортного SVG → photo_* rect, text_* text, decor_* (rect/circle/path),
 * trim/bleed/safe → prepress (грубая эстимация мм),
 * фоновый файл без этих элементов и без дубля с редактором overlay.
 */

import { performance } from 'perf_hooks'
import {
  createSvgGeometry,
  PX_TO_MM,
  type DesignTemplateGeometryDebug,
  type GeometryPoint,
  type GeometryRect,
} from './designTemplateSvgGeometry'

export type SvgRect = {
  name: string
  /** Исходное имя слоя в SVG (до уникализации instance id). */
  layerName?: string
  /** Порядок в документе SVG → z-index в Fabric. */
  stackIndex?: number
  x: number
  y: number
  width: number
  height: number
  svg: GeometryRect
  scene: GeometryRect
}

export type SvgTextStyleSegment = {
  start: number
  end: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fill?: string
  fontSize?: number
}

export type SvgText = {
  name: string
  layerName?: string
  stackIndex?: number
  x: number
  y: number
  fontSize: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  text: string
  textAnchor: 'start' | 'middle' | 'end'
  /** Диапазоны символов с отличным шрифтом/цветом (одна строка или весь блок). */
  textStyles?: SvgTextStyleSegment[]
  /** Ширина блочного textbox в px сцены (для text-align ≠ left). */
  frameWidthScene?: number
  /** Цвет заливки текста (SVG fill / CSS color). */
  fill?: string
  /** Угол поворота в градусах (Fabric, по часовой), из SVG transform. */
  angle?: number
  svg: GeometryPoint & { fontSize: number }
  scene: GeometryPoint & { fontSize: number }
}

export type SvgDecorShape = 'rect' | 'circle' | 'path'

export type SvgDecor = {
  /** Уникальный id для Fabric (несколько фигур могут иметь один layerName). */
  name: string
  layerName?: string
  stackIndex?: number
  shape: SvgDecorShape
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  pathData?: string
  svg: GeometryRect
  scene: GeometryRect
}

/** Интерактивный слой в порядке появления в SVG (z-order для Fabric). */
export type SvgInteractiveLayer =
  | { kind: 'photo'; data: SvgRect }
  | { kind: 'text'; data: SvgText }
  | { kind: 'decor'; data: SvgDecor }

export type MmRect = {
  name: string
  x: number
  y: number
  width: number
  height: number
}

export type PrepressFromSvgGuides = {
  bleedMm: number
  safeZoneMm: number
}

export type RemovalRange = { start: number; end: number }

export type ParserLayerStatus = 'parsed_interactive' | 'kept_as_background' | 'ignored_technical'
export type ParserReasonCode =
  | 'PHOTO_PARSED'
  | 'TEXT_PARSED'
  | 'DECOR_PARSED'
  | 'DECOR_AUTO_PARSED'
  | 'PHOTO_NO_VALID_RECT'
  | 'TXT_NO_VALID_NODE'
  | 'DECOR_NO_VALID_SHAPE'
  | 'GUIDE_IGNORED'
  | 'TECHNICAL_IGNORED'
  | 'LAYER_NOT_CLASSIFIED'

export type ParserLayerReport = {
  name: string
  kindExpected: 'photo' | 'text' | 'decor' | 'guide' | 'technical' | 'unknown'
  status: ParserLayerStatus
  reasonCode: ParserReasonCode
  bboxSvg?: GeometryRect
  bboxScene?: GeometryRect
}

export type ParserTimings = {
  sanitizeMs: number
  scanMs: number
  geometryMs: number
  textMs: number
  assembleMs: number
  totalMs: number
}

export type ParserReport = {
  layers: ParserLayerReport[]
  countsByStatus: Record<ParserLayerStatus, number>
  countsByReasonCode: Record<string, number>
  unsupportedFeatures: string[]
  timings: ParserTimings
}

export interface ImportedSvgLayers {
  widthMm: number
  heightMm: number
  photoRects: SvgRect[]
  textItems: SvgText[]
  /** photo_*, text_*, decor_* в порядке документа SVG (для z-order в fabricJSON). */
  interactiveLayers: SvgInteractiveLayer[]
  guideRectsMm: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>>
  lockedBgDetected: boolean
  prepressHints: PrepressFromSvgGuides | null
  geometry: DesignTemplateGeometryDebug
  summary: {
    photoFields: number
    textFields: number
    decorFields: number
    guides: string[]
    strippedLayers: number
    interactiveLayerCount: number
    interactiveParsedPercent: number
    fallbackBackgroundPercent: number
    unsupportedFeatures: string[]
  }
  /** Интервалы вырезаемых блоков SVG (слиянные). */
  removalRanges: RemovalRange[]
  /** Тот же SVG без интерактивных/guide слоёв — для загрузки фона без дубликатов. */
  strippedSvg: string
  warnings: string[]
  parserReport: ParserReport
  trace?: {
    timeline: string[]
  }
}

const TECH_PREFIXES = ['hidden_', 'guide_', '___FAKE_']

const GUIDE_NAMES = new Set(['trim', 'bleed', 'safe'])
const MAX_SVG_GROUP_DEPTH = 128

type SvgTransform = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY_TRANSFORM: SvgTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function warnWithCode(warnings: string[], code: string, message: string): void {
  warnings.push(`[${code}] ${message}`)
}

function inferKindExpected(name: string): ParserLayerReport['kindExpected'] {
  if (name.startsWith('photo_')) return 'photo'
  if (name.startsWith('text_')) return 'text'
  if (name.startsWith('decor_')) return 'decor'
  if (GUIDE_NAMES.has(name as 'trim' | 'bleed' | 'safe')) return 'guide'
  if (TECH_PREFIXES.some((p) => name.startsWith(p))) return 'technical'
  return 'unknown'
}

function multiplyTransform(left: SvgTransform, right: SvgTransform): SvgTransform {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

function applyTransform(t: SvgTransform, x: number, y: number): { x: number; y: number } {
  return {
    x: t.a * x + t.c * y + t.e,
    y: t.b * x + t.d * y + t.f,
  }
}

function transformScale(t: SvgTransform): number {
  const xScale = Math.hypot(t.a, t.b)
  const yScale = Math.hypot(t.c, t.d)
  const scale = (xScale + yScale) / 2
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** Угол поворота матрицы → градусы Fabric (по часовой). */
export function transformAngleDeg(t: SvgTransform): number {
  const angle = (Math.atan2(t.b, t.a) * 180) / Math.PI
  if (!Number.isFinite(angle)) return 0
  const det = t.a * t.d - t.b * t.c
  if (det < 0) return angle + 180
  return angle
}

function parseTransformNumbers(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((v) => Number(v))
    .filter(Number.isFinite)
}

function parseSvgTransform(
  value: string | undefined,
  unsupportedFeatures?: Set<string>,
): SvgTransform {
  if (!value) return IDENTITY_TRANSFORM
  let current = IDENTITY_TRANSFORM
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(value))) {
    const [, kind, rawArgs] = match
    const nums = parseTransformNumbers(rawArgs)
    let next = IDENTITY_TRANSFORM
    const kindLower = kind.toLowerCase()
    if (kindLower === 'matrix' && nums.length >= 6) {
      next = { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] }
    } else if (kindLower === 'translate' && nums.length >= 1) {
      next = { ...IDENTITY_TRANSFORM, e: nums[0], f: nums[1] ?? 0 }
    } else if (kindLower === 'scale' && nums.length >= 1) {
      next = { ...IDENTITY_TRANSFORM, a: nums[0], d: nums[1] ?? nums[0] }
    } else if (kindLower === 'rotate' && nums.length >= 1) {
      const deg = nums[0]
      const cx = nums[1] ?? 0
      const cy = nums[2] ?? 0
      const rad = (deg * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const rot: SvgTransform = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
      const toOrigin: SvgTransform = { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy }
      const fromOrigin: SvgTransform = { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy }
      next = multiplyTransform(fromOrigin, multiplyTransform(rot, toOrigin))
    } else if (kindLower === 'skewx' && nums.length >= 1) {
      const tan = Math.tan((nums[0] * Math.PI) / 180)
      next = { ...IDENTITY_TRANSFORM, c: tan }
    } else if (kindLower === 'skewy' && nums.length >= 1) {
      const tan = Math.tan((nums[0] * Math.PI) / 180)
      next = { ...IDENTITY_TRANSFORM, b: tan }
    } else {
      unsupportedFeatures?.add(`transform:${kind}`)
    }
    current = multiplyTransform(current, next)
  }
  const knownKinds = new Set(['matrix', 'translate', 'scale', 'rotate', 'skewX', 'skewY'])
  const allKinds = value.match(/[a-zA-Z]+\s*\(/g)?.map((v) => v.replace(/\s*\($/, '')) ?? []
  for (const kind of allKinds) {
    if (!knownKinds.has(kind)) unsupportedFeatures?.add(`transform:${kind}`)
  }
  return current
}

function transformedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: SvgTransform,
): { x: number; y: number; width: number; height: number } {
  const points = [
    applyTransform(transform, x, y),
    applyTransform(transform, x + width, y),
    applyTransform(transform, x, y + height),
    applyTransform(transform, x + width, y + height),
  ]
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function resolveDecorPresentation(
  attrs: Record<string, string>,
  inheritedStyle: Record<string, string>,
  cssClassStyles: Record<string, Record<string, string>>,
): Pick<SvgDecor, 'fill' | 'stroke' | 'strokeWidth' | 'opacity'> {
  const style = {
    ...inheritedStyle,
    ...styleFromClassNames(attrs.class, cssClassStyles),
    ...parseStyle(attrs.style),
  }
  if (attrs.fill?.trim()) style.fill = attrs.fill.trim()
  if (attrs.stroke?.trim()) style.stroke = attrs.stroke.trim()
  if (attrs['stroke-width']?.trim()) style['stroke-width'] = attrs['stroke-width'].trim()
  if (attrs.opacity?.trim()) style.opacity = attrs.opacity.trim()
  const fill = normalizeSvgPaintColor(style.fill)
  const stroke = normalizeSvgPaintColor(style.stroke)
  const strokeWidth = parseNumber(style['stroke-width']) ?? undefined
  const opacity = parseNumber(style.opacity) ?? undefined
  return {
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(strokeWidth != null ? { strokeWidth: Math.max(0, strokeWidth) } : {}),
    ...(opacity != null ? { opacity: Math.min(1, Math.max(0, opacity)) } : {}),
  }
}

function parseSvgPathApproxBounds(d: string): GeometryRect | null {
  if (!d.trim()) return null
  const tokenRe = /([a-zA-Z])([^a-zA-Z]*)/g
  const numberRe = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const mark = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const read = (raw: string): number[] => {
    const out: number[] = []
    let m: RegExpExecArray | null
    while ((m = numberRe.exec(raw)) !== null) out.push(Number(m[0]))
    return out.filter(Number.isFinite)
  }
  let token: RegExpExecArray | null
  while ((token = tokenRe.exec(d)) !== null) {
    const cmd = token[1]
    const nums = read(token[2] ?? '')
    const lower = cmd.toLowerCase()
    const rel = cmd !== lower
      ? false
      : true
    const step = (x: number, y: number) => {
      currentX = rel ? currentX + x : x
      currentY = rel ? currentY + y : y
      mark(currentX, currentY)
    }
    if (lower === 'm' || lower === 'l' || lower === 't') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        step(nums[i]!, nums[i + 1]!)
        if (lower === 'm' && i === 0) {
          startX = currentX
          startY = currentY
        }
      }
      continue
    }
    if (lower === 'h') {
      for (const x of nums) step(x, 0)
      continue
    }
    if (lower === 'v') {
      for (const y of nums) step(0, y)
      continue
    }
    if (lower === 'c') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const x1 = rel ? currentX + nums[i]! : nums[i]!
        const y1 = rel ? currentY + nums[i + 1]! : nums[i + 1]!
        const x2 = rel ? currentX + nums[i + 2]! : nums[i + 2]!
        const y2 = rel ? currentY + nums[i + 3]! : nums[i + 3]!
        mark(x1, y1)
        mark(x2, y2)
        step(nums[i + 4]!, nums[i + 5]!)
      }
      continue
    }
    if (lower === 's' || lower === 'q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        const x1 = rel ? currentX + nums[i]! : nums[i]!
        const y1 = rel ? currentY + nums[i + 1]! : nums[i + 1]!
        mark(x1, y1)
        step(nums[i + 2]!, nums[i + 3]!)
      }
      continue
    }
    if (lower === 'a') {
      for (let i = 0; i + 6 < nums.length; i += 7) {
        const rx = Math.abs(nums[i]!)
        const ry = Math.abs(nums[i + 1]!)
        const x = rel ? currentX + nums[i + 5]! : nums[i + 5]!
        const y = rel ? currentY + nums[i + 6]! : nums[i + 6]!
        mark(currentX - rx, currentY - ry)
        mark(currentX + rx, currentY + ry)
        mark(x - rx, y - ry)
        mark(x + rx, y + ry)
        currentX = x
        currentY = y
        mark(currentX, currentY)
      }
      continue
    }
    if (lower === 'z') {
      currentX = startX
      currentY = startY
      mark(currentX, currentY)
      continue
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

/** Среднее внешнее поле между outer и inner (мм). */
function meanInsetOuterInnerMm(outer: MmRect, inner: MmRect): number | null {
  const L = inner.x - outer.x
  const T = inner.y - outer.y
  const R = outer.x + outer.width - inner.x - inner.width
  const B = outer.y + outer.height - inner.y - inner.height
  const vals = [L, T, R, B]
  if (vals.some((v) => !Number.isFinite(v))) return null
  if (vals.some((v) => v < -0.5)) return null
  const mean = vals.reduce((a, b) => a + b, 0) / 4
  return Number.isFinite(mean) ? mean : null
}

/** Среднее поле между inner и outer когда inner должен быть внутри outer (trim → safe). */
function meanInsetInnerWithinOuterMm(outer: MmRect, inner: MmRect): number | null {
  const L = inner.x - outer.x
  const T = inner.y - outer.y
  const R = outer.x + outer.width - inner.x - inner.width
  const B = outer.y + outer.height - inner.y - inner.height
  const vals = [L, T, R, B]
  if (vals.some((v) => !Number.isFinite(v))) return null
  if (vals.some((v) => v < -0.5)) return null
  const mean = vals.reduce((a, b) => a + b, 0) / 4
  return Number.isFinite(mean) ? mean : null
}

function inferPrepressFromGuides(
  guide: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>>,
  warnings: string[],
): PrepressFromSvgGuides | null {
  const T = guide.trim
  const B = guide.bleed
  const S = guide.safe

  if (!T && !B && !S) return null

  let bleedMm = 2
  let safeMm = 5

  if (B && T) {
    const mm = meanInsetOuterInnerMm(B, T)
    if (mm != null && mm >= 0.05 && mm < 80) {
      bleedMm = Math.round(mm * 20) / 20
    } else {
      warnWithCode(
        warnings,
        'PREPRESS_BLEED_TRIM_RELATION_INVALID',
        'Слои bleed и trim не соотносятся как вложенные — дозаливка по умолчанию 2 мм.',
      )
    }
  } else if (B && !T) {
    warnWithCode(warnings, 'PREPRESS_BLEED_WITHOUT_TRIM', 'Слой bleed без trim — укажите trim для точной дозаливки.')
  }

  if (T && S) {
    const mm = meanInsetInnerWithinOuterMm(T, S)
    if (mm != null && mm >= 0.05 && mm < 80) {
      safeMm = Math.round(mm * 20) / 20
    } else {
      warnWithCode(
        warnings,
        'PREPRESS_TRIM_SAFE_RELATION_INVALID',
        'Слои trim и safe не соотносятся как вложенные — безопасная зона по умолчанию 5 мм.',
      )
    }
  } else if (S && !T) {
    warnWithCode(warnings, 'PREPRESS_SAFE_WITHOUT_TRIM', 'Слой safe без trim — укажите trim для точной безопасной зоны.')
  }

  if (B && T && !S) {
    warnWithCode(warnings, 'PREPRESS_SAFE_RECOMMENDED', 'Подсказка: добавьте rect safe внутри trim для оценки safe zone.')
  }

  warnWithCode(
    warnings,
    'PREPRESS_HINT',
    `Подсказка prepress по SVG: дозаливка ~${bleedMm} мм, безопасная зона ~${safeMm} мм — сверить с производством.`,
  )

  return { bleedMm, safeZoneMm: safeMm }
}

function mergeRemovalRanges(rs: RemovalRange[]): RemovalRange[] {
  if (rs.length === 0) return []
  const sorted = [...rs].sort((a, b) => a.start - b.start)
  const out: RemovalRange[] = []
  let cur = { ...sorted[0] }
  for (let k = 1; k < sorted.length; k++) {
    const n = sorted[k]
    if (n.start <= cur.end) cur.end = Math.max(cur.end, n.end)
    else {
      out.push(cur)
      cur = { ...n }
    }
  }
  out.push(cur)
  return out
}

export function applyRemovalRanges(svg: string, ranges: RemovalRange[]): string {
  const m = mergeRemovalRanges(ranges)
  if (m.length === 0) return svg
  let sliceFrom = 0
  let out = ''
  for (const r of m) {
    out += svg.slice(sliceFrom, r.start)
    sliceFrom = r.end
  }
  out += svg.slice(sliceFrom)
  return out
}

function indexOfClosingTagBracket(s: string, openLt: number): number {
  let i = openLt + 1
  let quote: '"' | "'" | null = null
  while (i < s.length) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
    i++
  }
  return i
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([:\w-]+)\s*=\s*["']([^"']*)["']/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(source))) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

function parseStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!style) return out
  style.split(';').forEach((part) => {
    const idx = part.indexOf(':')
    if (idx <= 0) return
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key && value) out[key] = value
  })
  return out
}

function parseCssClassStyles(svg: string): Record<string, Record<string, string>> {
  const styles: Record<string, Record<string, string>> = {}
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let styleMatch: RegExpExecArray | null
  while ((styleMatch = styleRe.exec(svg))) {
    const css = (styleMatch[1] ?? '')
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const ruleRe = /\.([_a-zA-Z][\w-]*)\s*\{([^}]*)\}/g
    let ruleMatch: RegExpExecArray | null
    while ((ruleMatch = ruleRe.exec(css))) {
      styles[ruleMatch[1]] = {
        ...(styles[ruleMatch[1]] ?? {}),
        ...parseStyle(ruleMatch[2]),
      }
    }
  }
  return styles
}

function styleFromClassNames(
  className: string | undefined,
  styles: Record<string, Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!className) return out
  for (const name of className.split(/\s+/).filter(Boolean)) {
    Object.assign(out, styles[name] ?? {})
  }
  return out
}

function pickAttr(
  primary: Record<string, string>,
  secondary: Record<string, string>,
  name: string,
): string | undefined {
  return primary[name] ?? secondary[name]
}

function normalizeTextAnchor(value: string | undefined): SvgText['textAnchor'] {
  const v = value?.trim().toLowerCase()
  if (v === 'middle' || v === 'center') return 'middle'
  if (v === 'end' || v === 'right') return 'end'
  return 'start'
}

/**
 * SVG text-anchor + CSS text-align.
 * Corel часто ставит text-anchor="start" и text-align:right — start не должен блокировать align.
 */
export function resolveTextAnchor(...sources: Array<Record<string, string> | undefined>): SvgText['textAnchor'] {
  let anchorFromAttr: SvgText['textAnchor'] | undefined
  for (const source of sources) {
    if (!source) continue
    const anchor = source['text-anchor']?.trim()
    if (!anchor) continue
    const normalized = normalizeTextAnchor(anchor)
    if (normalized !== 'start') return normalized
    anchorFromAttr = 'start'
  }
  for (const source of sources) {
    if (!source) continue
    const align = source['text-align']?.trim()
    if (!align) continue
    const normalized = normalizeTextAnchor(align)
    if (normalized !== 'start') return normalized
  }
  return anchorFromAttr ?? 'start'
}

function estimateLineWidthSvg(text: string, fontSizeSvg: number): number {
  return Math.max(1, text.length) * fontSizeSvg * 0.55
}

type TspanLineMetric = { left: number; right: number; y: number }

function resolveTspanLineMetrics(
  tspans: ParsedTspan[],
  attrs: Record<string, string>,
  fontSizeSvg: number,
  transform: SvgTransform,
): TspanLineMetric[] {
  return tspans.map((tspan) => {
    const x = parseNumber(pickAttr(tspan.attrs, attrs, 'x')) ?? 0
    const y = parseNumber(pickAttr(tspan.attrs, attrs, 'y')) ?? 0
    const pt = applyTransform(transform, x, y)
    const w = estimateLineWidthSvg(tspan.text, fontSizeSvg)
    return { left: pt.x, right: pt.x + w, y: pt.y }
  })
}

/** Corel иногда выравнивает строки разными x при text-anchor:start. */
function inferAlignedTextAnchor(
  metrics: TspanLineMetric[],
  fontSizeSvg: number,
): { anchor: SvgText['textAnchor']; anchorX: number; anchorY: number } | undefined {
  if (metrics.length < 2) return undefined
  const rights = metrics.map((m) => m.right)
  const lefts = metrics.map((m) => m.left)
  const centers = metrics.map((m) => (m.left + m.right) / 2)
  const rightSpread = Math.max(...rights) - Math.min(...rights)
  const leftSpread = Math.max(...lefts) - Math.min(...lefts)
  const centerSpread = Math.max(...centers) - Math.min(...centers)
  const tol = fontSizeSvg * 0.35
  if (centerSpread <= tol && (leftSpread > tol || rightSpread > tol)) {
    return { anchor: 'middle', anchorX: centers[0]!, anchorY: metrics[0]!.y }
  }
  if (rightSpread <= tol && leftSpread > tol) {
    return { anchor: 'end', anchorX: Math.max(...rights), anchorY: metrics[0]!.y }
  }
  if (leftSpread <= tol && rightSpread > tol) {
    return { anchor: 'start', anchorX: Math.min(...lefts), anchorY: metrics[0]!.y }
  }
  return undefined
}

function computeTextFrameWidthScene(
  lines: string[],
  metrics: TspanLineMetric[],
  fontSizeScene: number,
  textAnchor: SvgText['textAnchor'],
): number | undefined {
  const widths = lines.map((line) => estimateLineWidthSvg(line, fontSizeScene))
  const maxW = Math.max(...widths, 1)
  const span = metrics.length > 1
    ? Math.max(...metrics.map((m) => m.right)) - Math.min(...metrics.map((m) => m.left))
    : 0
  if (textAnchor === 'end' || textAnchor === 'middle') {
    return Math.max(maxW, span + maxW * 0.08, 120)
  }
  if (lines.length <= 1 && metrics.length <= 1) return undefined
  return Math.max(maxW, span + maxW * 0.05, 120)
}

function parseFontWeightFromStyle(style: Record<string, string>): string | undefined {
  const direct = style['font-weight']?.trim().toLowerCase()
  if (direct) {
    if (direct === 'bold' || direct === 'bolder') return 'bold'
    const n = Number.parseInt(direct, 10)
    if (Number.isFinite(n) && n >= 600) return 'bold'
    if (direct === 'normal' || direct === 'lighter' || (Number.isFinite(n) && n < 600)) return 'normal'
  }
  const shorthand = style.font?.trim()
  if (!shorthand) return undefined
  if (/\b(bold|bolder)\b/i.test(shorthand)) return 'bold'
  if (/\b\d{3}\b/.test(shorthand)) {
    const n = Number.parseInt(shorthand.match(/\b(\d{3})\b/)?.[1] ?? '', 10)
    if (Number.isFinite(n) && n >= 600) return 'bold'
  }
  return undefined
}

function parseFontStyleFromStyle(style: Record<string, string>): string | undefined {
  const direct = style['font-style']?.trim().toLowerCase()
  if (direct === 'italic' || direct === 'oblique') return 'italic'
  if (direct === 'normal') return 'normal'
  const shorthand = style.font?.trim()
  if (shorthand && /\b(italic|oblique)\b/i.test(shorthand)) return 'italic'
  return undefined
}

const SVG_NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  navy: '#000080',
  teal: '#008080',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
  lime: '#00ff00',
  olive: '#808000',
  purple: '#800080',
}

/** Нормализует SVG/CSS цвет для Fabric fill. */
export function normalizeSvgPaintColor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const raw = value.trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower === 'none' || lower === 'transparent' || lower === 'currentcolor') return undefined

  if (lower.startsWith('#')) {
    if (lower.length === 4) {
      return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`
    }
    return raw
  }

  const rgbMatch = lower.match(
    /^rgba?\(\s*([\d.]+)(%?)\s*[,/\s]\s*([\d.]+)(%?)\s*[,/\s]\s*([\d.]+)(%?)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
  )
  if (rgbMatch) {
    const channel = (part: string, pct: string) => {
      const n = Number(part)
      if (!Number.isFinite(n)) return 0
      const scale = pct === '%' || n > 1 ? 255 / 100 : 255
      return Math.round(Math.min(255, Math.max(0, n * scale)))
    }
    const r = channel(rgbMatch[1], rgbMatch[2])
    const g = channel(rgbMatch[3], rgbMatch[4])
    const b = channel(rgbMatch[5], rgbMatch[6])
    const a = rgbMatch[7] != null ? Number(rgbMatch[7]) : 1
    if (Number.isFinite(a) && a < 1) return `rgba(${r},${g},${b},${a})`
    const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
    return `#${hex}`
  }

  return SVG_NAMED_COLORS[lower] ?? raw
}

/** fill на атрибуте / в style / CSS-классе Corel (.fil1 { fill: … }). */
function resolveTextFill(...sources: Array<Record<string, string> | undefined>): string | undefined {
  for (const source of sources) {
    if (!source) continue
    const fill = normalizeSvgPaintColor(source.fill)
    if (fill) return fill
  }
  for (const source of sources) {
    if (!source) continue
    const color = normalizeSvgPaintColor(source.color)
    if (color) return color
  }
  return undefined
}

function parseFontSizeFromStyle(style: Record<string, string>): number | null {
  const direct = parseNumber(style['font-size'])
  if (direct != null) return direct
  const shorthand = style.font
  if (!shorthand) return null
  const match = shorthand.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:px|pt|mm|cm|in)?(?:\/[\d.]+)?(?:\s|$)/i)
  return match ? Number(match[1]) : null
}

/** Первое семейство из font-family или shorthand font. */
export function parseFontFamilyFromStyle(style: Record<string, string>): string | undefined {
  const raw = style['font-family']?.trim()
  if (raw) return normalizeFontFamilyToken(raw)
  const shorthand = style.font?.trim()
  if (!shorthand) return undefined
  const withoutSize = shorthand.replace(
    /^(?:italic|oblique|normal|bold|bolder|lighter|\d{3})\s+/i,
    '',
  )
  const match = withoutSize.match(/^(?:\d+(?:\.\d+)?(?:px|pt|mm|cm|in)?(?:\/[\d.]+)?\s+)?(.+)$/i)
  if (!match?.[1]) return undefined
  return normalizeFontFamilyToken(match[1].split(/\s+\/\s+/)[0] ?? match[1])
}

function normalizeFontFamilyToken(value: string): string {
  const first = value.split(',')[0]?.trim() ?? value.trim()
  return first.replace(/^['"]|['"]$/g, '').trim() || first
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

export function parseLengthMm(value: string | undefined): number | null {
  const n = parseNumber(value)
  if (n == null) return null
  const unit = value?.trim().replace(/^-?\d+(?:\.\d+)?/, '').trim().toLowerCase()
  if (unit === 'mm') return n
  if (unit === 'cm') return n * 10
  if (unit === 'in') return n * 25.4
  if (unit === 'pt') return (n * 25.4) / 72
  return n * PX_TO_MM
}

/** Corel DRAW: «Слой_x0020_1» → «Слой 1», текст «foo_x0020_bar» → «foo bar». */
export function decodeCorelUnicodeEscapes(value: string): string {
  return value.replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => (
    String.fromCharCode(parseInt(hex, 16))
  ))
}

function decodeXmlTextRaw(value: string, trim = true): string {
  const decoded = decodeCorelUnicodeEscapes(
    value
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"'),
  )
  return trim ? decoded.trim() : decoded
}

export function decodeXmlText(value: string): string {
  return decodeXmlTextRaw(value, true)
}

type ParsedTspan = { attrs: Record<string, string>; text: string; y: number; order: number }

function collectTspans(innerSvg: string): ParsedTspan[] {
  const results: ParsedTspan[] = []
  const re = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi
  let match: RegExpExecArray | null
  let order = 0
  while ((match = re.exec(innerSvg)) !== null) {
    const attrs = parseAttributes(match[1] ?? '')
    const text = decodeXmlTextRaw(match[2] ?? '', false)
    if (!text) continue
    results.push({
      attrs,
      text,
      y: parseNumber(attrs.y) ?? 0,
      order: order++,
    })
  }
  return results
}

function parseTspanDyOffset(dy: string | undefined, fontSize: number): number {
  if (!dy?.trim()) return 0
  const trimmed = dy.trim()
  if (trimmed.endsWith('em')) return (parseNumber(trimmed) ?? 0) * fontSize
  return parseNumber(trimmed) ?? 0
}

function resolveTspanEffectiveY(
  tspans: ParsedTspan[],
  baseY: number,
  fontSize: number,
): ParsedTspan[] {
  let currentY = baseY
  return tspans.map((tspan) => {
    const explicitY = parseNumber(tspan.attrs.y)
    if (explicitY != null) currentY = explicitY
    else currentY += parseTspanDyOffset(tspan.attrs.dy, fontSize)
    return { ...tspan, y: currentY }
  })
}

function groupTspansByLine(tspans: ParsedTspan[], fontSize: number): ParsedTspan[][] {
  const sorted = [...tspans].sort((a, b) => a.order - b.order)
  const withY = resolveTspanEffectiveY(sorted, sorted[0]?.y ?? 0, fontSize)
  const lines: ParsedTspan[][] = []
  const tol = fontSize * 0.35
  for (const tspan of withY) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(tspan.y - last[0]!.y) <= tol) last.push(tspan)
    else lines.push([tspan])
  }
  return lines
}

type TspanSegmentPresentation = {
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fill?: string
  fontSize?: number
}

function segmentPresentationKey(style: TspanSegmentPresentation): string {
  return [
    style.fontFamily ?? '',
    style.fontWeight ?? '',
    style.fontStyle ?? '',
    style.fill ?? '',
    style.fontSize != null ? String(style.fontSize) : '',
  ].join('|')
}

function normalizeInlineTextChunk(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isLetterLikeChar(ch: string): boolean {
  if (!ch || /\s/.test(ch)) return false
  const code = ch.codePointAt(0)
  if (code == null) return false
  return (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || (code >= 0xc0 && code <= 0x24f)
    || (code >= 0x400 && code <= 0x4ff)
}

function endsWithLetterLike(value: string): boolean {
  return value.length > 0 && isLetterLikeChar(value.slice(-1))
}

function startsWithLetterLike(value: string): boolean {
  return value.length > 0 && isLetterLikeChar(value.charAt(0))
}

function inlineChunkJoinGap(existing: string, next: string): string {
  const prevCh = existing.slice(-1)
  const nextCh = next.charAt(0)
  if (
    prevCh
    && nextCh
    && !/\s/.test(prevCh)
    && !/\s/.test(nextCh)
    && isLetterLikeChar(prevCh)
    && isLetterLikeChar(nextCh)
  ) {
    return ' '
  }
  return ''
}

function joinInlineChunkTexts(texts: string[]): string {
  if (!texts.length) return ''
  let out = texts[0]!
  for (let i = 1; i < texts.length; i++) {
    const part = texts[i]!
    out += inlineChunkJoinGap(out, part) + part
  }
  return out
}

function joinInlineChunkTextVariants(texts: string[]): string[] {
  const variants = new Set<string>()
  const add = (value: string) => {
    const normalized = normalizeInlineTextChunk(value)
    if (normalized) variants.add(normalized)
  }
  add(texts.join(''))
  if (texts.length > 1) add(texts.join(' '))
  add(joinInlineChunkTexts(texts))
  return [...variants]
}

function inlineChunkJoinMatchesText(texts: string[], target: string): boolean {
  const normalizedTarget = normalizeInlineTextChunk(target)
  if (!normalizedTarget) return false
  return joinInlineChunkTextVariants(texts).includes(normalizedTarget)
}

/** Убирает дубли Corel: целая строка среди фрагментов с разными шрифтами. */
function pruneRedundantTextChunks<T extends { text: string }>(chunks: T[]): T[] {
  if (chunks.length <= 1) return chunks
  let pruned = [...chunks]
  let changed = true
  while (changed && pruned.length > 1) {
    changed = false
    const next = pruned.filter((item) => {
      const others = pruned.filter((other) => other !== item)
      if (!others.length) return true
      return !inlineChunkJoinMatchesText(others.map((other) => other.text), item.text)
    })
    if (next.length < pruned.length) {
      pruned = next
      changed = true
    }
  }
  // Два одинаковых фрагмента Corel могут взаимно «съесть» друг друга — не оставляем пустую группу.
  return pruned.length > 0 ? pruned : [chunks[0]!]
}

function pruneRedundantInlineChunks(items: SvgText[]): SvgText[] {
  const valid = items.filter(hasTextScene)
  if (valid.length <= 1) return valid
  const sorted = [...valid].sort((a, b) => a.scene.x - b.scene.x || a.scene.y - b.scene.y)
  return pruneRedundantTextChunks(sorted)
}

function hasTextScene(item: SvgText | undefined): item is SvgText {
  return Boolean(
    item?.scene
    && Number.isFinite(item.scene.x)
    && Number.isFinite(item.scene.y)
    && Number.isFinite(item.scene.fontSize),
  )
}

function requireTextItemsWithScene(items: SvgText[], context: string): SvgText[] {
  const valid = items.filter(hasTextScene)
  if (valid.length === 0) {
    throw new Error(`[TXT_MERGE_EMPTY] ${context}`)
  }
  return valid
}

function normalizeSegmentFontSize(
  style: TspanSegmentPresentation,
  baseFontSize: number,
): TspanSegmentPresentation {
  if (style.fontSize != null && style.fontSize < baseFontSize - 0.5) {
    const { fontSize: _drop, ...rest } = style
    return rest
  }
  return style
}

/**
 * Corel иногда экспортирует декоративный шрифт только на первую букву слова,
 * остаток слова — снова базовым шрифтом (л + юблю → люблю).
 */
function mergeSplitWordAlternateFontTspans(
  tspans: ParsedTspan[],
  segmentStyle: (tspan: ParsedTspan) => TspanSegmentPresentation,
  basePresentationKey: string,
  baseFontSize: number,
): ParsedTspan[] {
  if (tspans.length <= 1) return tspans
  const styleKey = (tspan: ParsedTspan) =>
    segmentPresentationKey(normalizeSegmentFontSize(segmentStyle(tspan), baseFontSize))
  const out: ParsedTspan[] = []
  let i = 0
  while (i < tspans.length) {
    let current = tspans[i]!
    let currentKey = styleKey(current)
    while (i + 1 < tspans.length) {
      const next = tspans[i + 1]!
      const nextKey = styleKey(next)
      const continuesWord =
        !/\s$/.test(current.text)
        && !/^\s/.test(next.text)
        && currentKey !== nextKey
        && currentKey !== basePresentationKey
        && nextKey === basePresentationKey
        && endsWithLetterLike(current.text)
        && startsWithLetterLike(next.text)
      if (!continuesWord) break
      current = { ...current, text: current.text + next.text }
      currentKey = styleKey(current)
      i++
    }
    out.push(current)
    i++
  }
  return out
}

function mergeSplitWordAlternateFontTextItems(items: SvgText[]): SvgText[] {
  const valid = items.filter(hasTextScene)
  if (valid.length <= 1) return valid
  const base = valid[0]!
  const baseKey = segmentPresentationKey({
    fontFamily: base.fontFamily,
    fontWeight: base.fontWeight,
    fontStyle: base.fontStyle,
    fill: base.fill,
    fontSize: base.scene.fontSize,
  })
  const out: SvgText[] = []
  let i = 0
  while (i < valid.length) {
    let current = valid[i]!
    let currentKey = segmentPresentationKey({
      fontFamily: current.fontFamily,
      fontWeight: current.fontWeight,
      fontStyle: current.fontStyle,
      fill: current.fill,
      fontSize: current.scene.fontSize,
    })
    while (i + 1 < valid.length) {
      const next = valid[i + 1]!
      const nextKey = segmentPresentationKey({
        fontFamily: next.fontFamily,
        fontWeight: next.fontWeight,
        fontStyle: next.fontStyle,
        fill: next.fill,
        fontSize: next.scene.fontSize,
      })
      const continuesWord =
        !/\s$/.test(current.text)
        && !/^\s/.test(next.text)
        && currentKey !== nextKey
        && currentKey !== baseKey
        && nextKey === baseKey
        && endsWithLetterLike(current.text)
        && startsWithLetterLike(next.text)
      if (!continuesWord) break
      current = { ...current, text: current.text + next.text }
      i++
    }
    out.push(current)
    i++
  }
  return out
}

function composeTextFromTspans(
  tspans: ParsedTspan[],
  baseY: number,
  fontSize: number,
  segmentStyle: (tspan: ParsedTspan) => TspanSegmentPresentation,
): { text: string; textStyles: SvgTextStyleSegment[] } {
  const lines = groupTspansByLine(tspans, fontSize)
  let text = ''
  const textStyles: SvgTextStyleSegment[] = []
  for (const line of lines) {
    if (text.length > 0) text += '\n'
    const sortedByX = [...line].sort(
      (a, b) => (parseNumber(a.attrs.x) ?? 0) - (parseNumber(b.attrs.x) ?? 0) || a.order - b.order,
    )
    const pruned = pruneRedundantTextChunks(sortedByX)
    const basePresentationKey = segmentPresentationKey(
      normalizeSegmentFontSize(segmentStyle(pruned[0] ?? sortedByX[0]!), fontSize),
    )
    const sorted = mergeSplitWordAlternateFontTspans(pruned, segmentStyle, basePresentationKey, fontSize)
    let prevKey = ''
    for (const tspan of sorted) {
      const gap = text.length > 0 ? inlineChunkJoinGap(text, tspan.text) : ''
      if (gap) text += gap
      const start = text.length
      text += tspan.text
      const style = normalizeSegmentFontSize(segmentStyle(tspan), fontSize)
      const key = segmentPresentationKey(style)
      if (!(style.fontFamily || style.fontWeight || style.fontStyle || style.fill || style.fontSize)) continue
      if (key === prevKey && textStyles.length > 0) {
        textStyles[textStyles.length - 1]!.end = text.length
        continue
      }
      textStyles.push({ start, end: text.length, ...style })
      prevKey = key
    }
  }
  return { text, textStyles }
}

function pickStrongestTextAnchor(items: SvgText[]): SvgText['textAnchor'] {
  const rank: Record<SvgText['textAnchor'], number> = { middle: 3, end: 2, start: 1 }
  return items.reduce(
    (best, item) => (rank[item.textAnchor] > rank[best] ? item.textAnchor : best),
    'start' as SvgText['textAnchor'],
  )
}

function pickAnchorSceneX(items: SvgText[], anchor: SvgText['textAnchor']): number {
  const xs = items.map((item) => item.scene.x)
  const tol = items[0]!.scene.fontSize * 0.35
  const spread = Math.max(...xs) - Math.min(...xs)
  if (anchor === 'middle') {
    if (spread <= tol) return xs[0]!
    return xs.reduce((sum, x) => sum + x, 0) / xs.length
  }
  if (anchor === 'end') return Math.max(...xs)
  return Math.min(...xs)
}

function pickAnchorMmX(items: SvgText[], anchor: SvgText['textAnchor']): number {
  const xs = items.map((item) => item.x)
  const tol = items[0]!.fontSize * 0.35
  const spread = Math.max(...xs) - Math.min(...xs)
  if (anchor === 'middle') {
    if (spread <= tol) return xs[0]!
    return xs.reduce((sum, x) => sum + x, 0) / xs.length
  }
  if (anchor === 'end') return Math.max(...xs)
  return Math.min(...xs)
}

function minStackIndex(items: Array<{ stackIndex?: number }>): number | undefined {
  const vals = items.map((item) => item.stackIndex).filter((v): v is number => v != null)
  return vals.length > 0 ? Math.min(...vals) : undefined
}

function mergeInlineTextItems(items: SvgText[]): SvgText {
  const source = requireTextItemsWithScene(
    items,
    'Не удалось объединить текстовые фрагменты text_* (нет валидной геометрии).',
  )
  if (source.length === 1) return source[0]!
  const pruned = pruneRedundantInlineChunks(source)
  const inlineItems = pruned.length > 0 ? pruned : source
  const sorted = mergeSplitWordAlternateFontTextItems(
    [...inlineItems].sort((a, b) => a.scene.x - b.scene.x || a.scene.y - b.scene.y),
  )
  if (sorted.length === 0) return source[0]!
  let text = ''
  const textStyles: SvgTextStyleSegment[] = []
  let prevStyleKey = ''
  for (const item of sorted) {
    const chunk = item.text
    if (!chunk) continue
    const gap = text.length > 0 ? inlineChunkJoinGap(text, chunk) : ''
    if (gap) text += gap
    const start = text.length
    text += chunk
    const pushSegment = (seg: SvgTextStyleSegment) => {
      const key = segmentPresentationKey(seg)
      if (key === prevStyleKey) {
        textStyles[textStyles.length - 1]!.end = seg.end
        return
      }
      textStyles.push(seg)
      prevStyleKey = key
    }
    if (item.textStyles?.length) {
      for (const seg of item.textStyles) {
        pushSegment({
          ...seg,
          start: start + seg.start,
          end: start + seg.end,
        })
      }
    } else if (item.fontFamily || item.fontWeight || item.fontStyle || item.fill) {
      pushSegment({
        start,
        end: text.length,
        fontFamily: item.fontFamily,
        fontWeight: item.fontWeight,
        fontStyle: item.fontStyle,
        fill: item.fill,
      })
    }
  }
  const textAnchor = pickStrongestTextAnchor(sorted)
  const base = sorted[0]!
  const sceneX = pickAnchorSceneX(sorted, textAnchor)
  const mmX = pickAnchorMmX(sorted, textAnchor)
  const fontSizeScene = base.scene.fontSize
  const lines = text.split('\n')
  const metrics = lines.map((line, index) => {
    const y = base.scene.y + index * fontSizeScene * 1.2
    const w = estimateLineWidthSvg(line, fontSizeScene)
    const left = textAnchor === 'middle' ? sceneX - w / 2 : textAnchor === 'end' ? sceneX - w : sceneX
    return { left, right: left + w, y }
  })
  return {
    ...base,
    x: mmX,
    y: base.y,
    text,
    textAnchor,
    stackIndex: minStackIndex(sorted) ?? base.stackIndex,
    textStyles: textStyles.length > 0 ? textStyles : undefined,
    frameWidthScene: computeTextFrameWidthScene(lines, metrics, fontSizeScene, textAnchor),
    scene: { ...base.scene, x: sceneX },
    svg: { ...base.svg, x: sceneX },
  }
}

function mergeStackedTextItems(items: SvgText[]): SvgText {
  const source = requireTextItemsWithScene(
    items,
    'Не удалось объединить многострочный text_* (нет валидной геометрии).',
  )
  if (source.length === 1) return source[0]!
  const sorted = [...source].sort((a, b) => a.y - b.y || a.x - b.x)
  const text = sorted.map((item) => item.text).join('\n')
  const textAnchor = pickStrongestTextAnchor(sorted)
  const base = sorted[0]!
  const sceneX = pickAnchorSceneX(sorted, textAnchor)
  const mmX = pickAnchorMmX(sorted, textAnchor)
  const fontSizeScene = base.scene.fontSize
  const lines = text.split('\n')
  const metrics = sorted.map((item, index) => {
    const line = lines[index] ?? item.text
    const w = estimateLineWidthSvg(line, fontSizeScene)
    const left = textAnchor === 'middle' ? item.scene.x - w / 2 : textAnchor === 'end' ? item.scene.x - w : item.scene.x
    return { left, right: left + w, y: item.scene.y }
  })
  return {
    ...base,
    x: mmX,
    y: base.y,
    text,
    textAnchor,
    stackIndex: minStackIndex(sorted) ?? base.stackIndex,
    frameWidthScene: computeTextFrameWidthScene(lines, metrics, fontSizeScene, textAnchor),
    scene: { ...base.scene, x: sceneX },
    svg: { ...base.svg, x: sceneX },
  }
}

function mergeTextItemsByName(items: SvgText[]): SvgText[] {
  const order: string[] = []
  const groups = new Map<string, SvgText[]>()
  for (const item of items) {
    if (!groups.has(item.name)) order.push(item.name)
    const group = groups.get(item.name) ?? []
    group.push(item)
    groups.set(item.name, group)
  }
  return order.map((name) => {
    const group = requireTextItemsWithScene(
      groups.get(name) ?? [],
      `Текстовый слой «${name}» не содержит валидных фрагментов.`,
    )
    if (group.length === 1) return group[0]!
    const sorted = [...group].sort((a, b) => a.y - b.y || a.x - b.x)
    const yTol = Math.max(sorted[0]!.scene.fontSize * 0.5, sorted[0]!.fontSize * 0.5)
    const clusters: SvgText[][] = []
    for (const item of sorted) {
      const last = clusters[clusters.length - 1]
      if (last && Math.abs(item.scene.y - last[0]!.scene.y) <= yTol) last.push(item)
      else clusters.push([item])
    }
    if (clusters.length === 1 && clusters[0]!.length > 1) {
      return mergeInlineTextItems(clusters[0]!)
    }
    return mergeStackedTextItems(sorted)
  })
}

function alignInteractiveTextLayers(
  layers: SvgInteractiveLayer[],
  mergedTextByName: Map<string, SvgText>,
): SvgInteractiveLayer[] {
  const seenText = new Set<string>()
  const out: SvgInteractiveLayer[] = []
  for (const layer of layers) {
    if (layer.kind !== 'text') {
      out.push(layer)
      continue
    }
    const name = layer.data.name
    if (seenText.has(name)) continue
    seenText.add(name)
    const merged = mergedTextByName.get(name)
    out.push(merged ? { kind: 'text', data: merged } : layer)
  }
  return out
}

function getLayerName(attrs: Record<string, string>): string | null {
  const raw = attrs.id || attrs['inkscape:label'] || attrs['data-name'] || null
  return raw ? decodeCorelUnicodeEscapes(raw) : null
}

function dimsFromSvgRoot(svg: string): {
  widthMm: number
  heightMm: number
  svgAttrs: Record<string, string>
  warnings: string[]
} {
  const warnings: string[] = []
  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const svgAttrs = parseAttributes(svgTag)
  const viewBox = (svgAttrs.viewBox || '')
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite)
  const viewBoxWidth = viewBox.length === 4 ? viewBox[2] : null
  const viewBoxHeight = viewBox.length === 4 ? viewBox[3] : null
  const widthMm =
    parseLengthMm(svgAttrs.width) ??
    (viewBoxWidth != null ? viewBoxWidth * PX_TO_MM : 100)
  const heightMm =
    parseLengthMm(svgAttrs.height) ??
    (viewBoxHeight != null ? viewBoxHeight * PX_TO_MM : 100)

  if (!svgAttrs.width || !svgAttrs.height) {
    warnWithCode(warnings, 'SVG_DIMENSIONS_MISSING', 'SVG не содержит явные width/height, размеры взяты из viewBox или fallback.')
  }

  return { widthMm, heightMm, svgAttrs, warnings }
}

function warnUnhandledLayerName(kind: string, name: string, warnings: string[], seen: Set<string>) {
  if (kind === 'группа' && (name.startsWith('photo_') || name.startsWith('text_') || name.startsWith('decor_'))) return

  const key = `${kind}:${name}`
  if (seen.has(key)) return
  seen.add(key)

  if (name.startsWith('photo_') || name.startsWith('text_') || name.startsWith('decor_')) return
  if (
    name === 'locked_bg' ||
    name === 'trim' ||
    name === 'bleed' ||
    name === 'safe' ||
    TECH_PREFIXES.some((p) => name.startsWith(p))
  ) {
    if (name === 'locked_bg')
      warnings.push('Слой locked_bg сохранится в SVG-фоне (поверх редакторских overlay).')
    return
  }
  if (kind === 'rect' || kind === 'circle' || kind === 'ellipse' || kind === 'path' || kind === 'polygon' || kind === 'polyline') return
  warnings.push(
    `Неиспользуемое имя в ${kind} "${name}". Ожидались photo_*, text_*, decor_*, trim, bleed, safe, locked_bg, hidden_*, guide_*. Без имени rect/circle/ellipse/path импортируются как decor_auto_*.`,
  )
}

function isReservedLayerName(name: string): boolean {
  if (name === 'locked_bg') return true
  if (GUIDE_NAMES.has(name as 'trim' | 'bleed' | 'safe')) return true
  if (TECH_PREFIXES.some((p) => name.startsWith(p))) return true
  if (name.startsWith('photo_')) return true
  if (name.startsWith('text_')) return true
  return false
}

function resolveDecorLayerName(
  explicit: string | null,
  inherited: string | null,
  shape: SvgDecorShape,
  autoDecorSeq: { value: number },
): string | null {
  if (explicit?.startsWith('decor_')) return explicit
  if (!explicit && inherited?.startsWith('decor_')) return inherited
  if ((explicit && isReservedLayerName(explicit)) || (!explicit && inherited && isReservedLayerName(inherited))) {
    return null
  }
  autoDecorSeq.value += 1
  return `decor_auto_${shape}_${autoDecorSeq.value}`
}

function allocUniqueLayerInstanceId(baseName: string, counters: Map<string, number>): string {
  const next = (counters.get(baseName) ?? 0) + 1
  counters.set(baseName, next)
  return next === 1 ? baseName : `${baseName}__${next}`
}

function nextDocumentStackIndex(counter: { value: number }): number {
  counter.value += 1
  return counter.value
}

function sortInteractiveLayersByStackIndex(layers: SvgInteractiveLayer[]): SvgInteractiveLayer[] {
  return [...layers].sort((a, b) => (a.data.stackIndex ?? 0) - (b.data.stackIndex ?? 0))
}

function findInheritedLayerName(
  groupStack: Array<string | null>,
  predicate: (name: string) => boolean,
): string | null {
  for (let i = groupStack.length - 1; i >= 0; i -= 1) {
    const name = groupStack[i]
    if (name && predicate(name)) return name
  }
  return null
}

function parsePolygonPointPairs(pointsAttr: string | undefined): Array<{ x: number; y: number }> {
  if (!pointsAttr?.trim()) return []
  const nums = pointsAttr.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i]!, y: nums[i + 1]! })
  }
  return out
}

function boundsFromPointPairs(points: Array<{ x: number; y: number }>): GeometryRect | null {
  if (points.length < 3) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  if (!(width > 0 && height > 0)) return null
  return { x: minX, y: minY, width, height }
}

function isAxisAlignedRectPoints(points: Array<{ x: number; y: number }>): boolean {
  if (points.length !== 4) return false
  const xs = [...new Set(points.map((p) => Math.round(p.x * 100) / 100))]
  const ys = [...new Set(points.map((p) => Math.round(p.y * 100) / 100))]
  return xs.length === 2 && ys.length === 2
}

function polygonPointsToPath(pointsAttr: string, originX = 0, originY = 0): string | null {
  const pts = parsePolygonPointPairs(pointsAttr)
  if (pts.length < 3) return null
  const head = pts[0]!
  const tail = pts.slice(1).map((p) => `L ${p.x - originX} ${p.y - originY}`).join(' ')
  return `M ${head.x - originX} ${head.y - originY} ${tail} Z`
}

function findOuterTextCloseEnd(svg: string, openingGt: number): number | null {
  let depth = 1
  let pos = openingGt + 1
  const reOpen = /<text\b[^>]*>/gi
  const reClose = /<\/text\s*>/gi
  while (depth > 0 && pos < svg.length) {
    reOpen.lastIndex = pos
    reClose.lastIndex = pos
    const mc = reClose.exec(svg)
    const mo = reOpen.exec(svg)
    if (!mc) return null
    const openFirst = mo && mo.index < mc.index ? mo.index : Infinity
    if (openFirst < mc.index) {
      depth++
      const openLt = mo!.index
      pos = indexOfClosingTagBracket(svg, openLt) + 1
      continue
    }
    depth--
    pos = mc.index + mc[0].length
    if (depth === 0) return pos
  }
  return null
}

function groupRemovable(layerName: string | null): boolean {
  if (!layerName || layerName === 'locked_bg') return false
  if (GUIDE_NAMES.has(layerName)) return true
  // Fail-open: interactive groups stay in background unless parser extracted them.
  return TECH_PREFIXES.some((p) => layerName.startsWith(p))
}

export function parseImportedSvgLayers(
  svg: string,
  options: { sceneScale?: number; trace?: boolean } = {},
): ImportedSvgLayers {
  const t0 = performance.now()
  const traceTimeline: string[] = []
  const traceEnabled = options.trace === true
  const pushTrace = (message: string): void => {
    if (traceEnabled) traceTimeline.push(message)
  }
  const timing = {
    sanitizeMs: 0,
    scanMs: 0,
    geometryMs: 0,
    textMs: 0,
    assembleMs: 0,
    totalMs: 0,
  }

  const geometryStart = performance.now()
  const dims = dimsFromSvgRoot(svg)
  const vb = (dims.svgAttrs.viewBox || '').split(/\s+/).map(Number).filter(Number.isFinite)
  const viewBox = vb.length === 4
    ? { minX: vb[0], minY: vb[1], width: vb[2], height: vb[3] }
    : null
  const widthMm = dims.widthMm
  const heightMm = dims.heightMm
  const cssClassStyles = parseCssClassStyles(svg)
  const unsupportedFeatures = new Set<string>()
  const geometry = createSvgGeometry({
    pageMm: { width: widthMm, height: heightMm },
    viewBox,
    preserveAspectRatio: dims.svgAttrs.preserveAspectRatio,
    sceneScale: options.sceneScale,
  })
  timing.geometryMs = Math.round((performance.now() - geometryStart) * 1000) / 1000
  pushTrace(`geometry-ready viewBox=${viewBox ? 'yes' : 'no'} scale=${geometry.sceneScale}`)

  const warnings = [...dims.warnings]
  const photoRects: SvgRect[] = []
  const textItems: SvgText[] = []
  const decorItems: SvgDecor[] = []
  const interactiveLayers: SvgInteractiveLayer[] = []
  const guideRectsMm: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>> = {}
  let lockedBgDetected = false
  const autoDecorSeq = { value: 0 }
  const decorInstanceCounters = new Map<string, number>()
  const documentStack = { value: 0 }

  function pushParsedDecor(input: {
    baseName: string
    shape: SvgDecorShape
    tr: { x: number; y: number; width: number; height: number }
    attrs: Record<string, string>
    pathData?: string
    removalStart: number
    removalEnd: number
    autoAssigned: boolean
  }): void {
    const fabricId = allocUniqueLayerInstanceId(input.baseName, decorInstanceCounters)
    const mmRect = geometry.svgRectToMm(input.tr)
    const sceneRect = geometry.mmRectToScene(mmRect)
    const decorEntry: SvgDecor = {
      name: fabricId,
      layerName: input.baseName,
      stackIndex: nextDocumentStackIndex(documentStack),
      shape: input.shape,
      ...(input.pathData ? { pathData: input.pathData } : {}),
      ...resolveDecorPresentation(
        input.attrs,
        groupStyleStack[groupStyleStack.length - 1] ?? {},
        cssClassStyles,
      ),
      svg: input.tr,
      scene: sceneRect,
    }
    decorItems.push(decorEntry)
    interactiveLayers.push({ kind: 'decor', data: decorEntry })
    parsedDecorLayerNames.add(input.baseName)
    parsedDecorLayerNames.add(fabricId)
    seenDecorLayerNames.add(input.baseName)
    markLayerReport(fabricId, {
      status: 'parsed_interactive',
      reasonCode: input.autoAssigned ? 'DECOR_AUTO_PARSED' : 'DECOR_PARSED',
      bboxSvg: input.tr,
      bboxScene: sceneRect,
    })
    removalRanges.push({ start: input.removalStart, end: input.removalEnd })
  }
  const warnedNames = new Set<string>()
  const removalRanges: RemovalRange[] = []
  const seenPhotoLayerNames = new Set<string>()
  const seenTextLayerNames = new Set<string>()
  const seenDecorLayerNames = new Set<string>()
  const parsedPhotoLayerNames = new Set<string>()
  const parsedTextLayerNames = new Set<string>()
  const parsedDecorLayerNames = new Set<string>()
  const namedLayerReports = new Map<string, ParserLayerReport>()
  const seenLayerOrder: string[] = []

  function markLayerReport(
    name: string,
    patch: Partial<ParserLayerReport> & Pick<ParserLayerReport, 'status' | 'reasonCode'>,
  ): void {
    const existing = namedLayerReports.get(name)
    if (!existing) {
      namedLayerReports.set(name, {
        name,
        kindExpected: inferKindExpected(name),
        status: patch.status,
        reasonCode: patch.reasonCode,
        bboxSvg: patch.bboxSvg,
        bboxScene: patch.bboxScene,
      })
      seenLayerOrder.push(name)
      return
    }
    namedLayerReports.set(name, {
      ...existing,
      ...patch,
    })
  }

  function markFallbackLayer(name: string): void {
    const isPhoto = name.startsWith('photo_')
    const isText = name.startsWith('text_')
    const isDecor = name.startsWith('decor_')
    markLayerReport(name, {
      status: (isPhoto || isText || isDecor) ? 'kept_as_background' : 'ignored_technical',
      reasonCode: isPhoto
        ? 'PHOTO_NO_VALID_RECT'
        : isText
          ? 'TXT_NO_VALID_NODE'
          : isDecor
            ? 'DECOR_NO_VALID_SHAPE'
            : (GUIDE_NAMES.has(name as 'trim' | 'bleed' | 'safe') ? 'GUIDE_IGNORED' : 'TECHNICAL_IGNORED'),
    })
    if (!isPhoto && !isText && !isDecor && !GUIDE_NAMES.has(name as 'trim' | 'bleed' | 'safe') && !TECH_PREFIXES.some((p) => name.startsWith(p)) && name !== 'locked_bg') {
      markLayerReport(name, {
        status: 'kept_as_background',
        reasonCode: 'LAYER_NOT_CLASSIFIED',
      })
    }
  }

  const groupStack: (string | null)[] = [null]
  const transformStack: SvgTransform[] = [IDENTITY_TRANSFORM]
  const groupStyleStack: Array<Record<string, string>> = [{}]
  const groupFrameStack: Array<{ openLt: number; removable: boolean; layerName: string | null }> = []

  function mergeGroupPresentationStyle(attrs: Record<string, string>): Record<string, string> {
    const parent = groupStyleStack[groupStyleStack.length - 1] ?? {}
    const self = {
      ...styleFromClassNames(attrs.class, cssClassStyles),
      ...parseStyle(attrs.style),
    }
    if (attrs['font-family']?.trim()) self['font-family'] = attrs['font-family'].trim()
    if (attrs['font-size']?.trim()) self['font-size'] = attrs['font-size'].trim()
    if (attrs['text-anchor']?.trim()) self['text-anchor'] = attrs['text-anchor'].trim()
    if (attrs['text-align']?.trim()) self['text-align'] = attrs['text-align'].trim()
    if (attrs.fill?.trim()) self.fill = attrs.fill.trim()
    if (attrs.color?.trim()) self.color = attrs.color.trim()
    return { ...parent, ...self }
  }

  const scanStart = performance.now()
  let i = 0
  while (i < svg.length) {
    const lt = svg.indexOf('<', i)
    if (lt === -1) break

    if (svg.startsWith('<!--', lt)) {
      const end = svg.indexOf('-->', lt + 4)
      i = end === -1 ? svg.length : end + 3
      continue
    }
    if (svg.startsWith('<?', lt) || svg.startsWith('<!DOCTYPE', lt)) {
      i = indexOfClosingTagBracket(svg, lt) + 1
      continue
    }
    if (svg.startsWith('<![CDATA[', lt)) {
      const end = svg.indexOf(']]>', lt + 9)
      i = end === -1 ? svg.length : end + 3
      continue
    }

    const gt = indexOfClosingTagBracket(svg, lt)
    if (gt <= lt + 1) {
      i = lt + 1
      continue
    }

    const trimmed = svg.slice(lt + 1, gt).trim()
    const closing = trimmed.startsWith('/')
    let inner = closing ? trimmed.slice(1).trim() : trimmed
    const selfClosing = !closing && inner.endsWith('/')
    if (selfClosing) inner = inner.slice(0, -1).trim()

    const nameMatch = inner.match(/^([\w:-]+)(?:\s|$)/)
    const tagLc = nameMatch ? nameMatch[1].toLowerCase() : ''
    const attrPart = nameMatch ? inner.slice(nameMatch[1].length).trim() : inner

    if (closing && tagLc === 'g') {
      const framed = groupFrameStack.pop()
      if (groupStack.length > 1) groupStack.pop()
      if (transformStack.length > 1) transformStack.pop()
      if (groupStyleStack.length > 1) groupStyleStack.pop()
      if (framed) {
        const ln = framed.layerName
        const removableInteractive = !!ln && (
          (ln.startsWith('photo_') && parsedPhotoLayerNames.has(ln))
          || (ln.startsWith('text_') && parsedTextLayerNames.has(ln))
          || (ln.startsWith('decor_') && parsedDecorLayerNames.has(ln))
        )
        if (framed.removable || removableInteractive) {
          removalRanges.push({ start: framed.openLt, end: gt + 1 })
        }
      }
      i = gt + 1
      continue
    }

    if (!closing && tagLc === 'g') {
      const attrs = parseAttributes(attrPart)
      const ln = getLayerName(attrs)
      if (ln) {
        markFallbackLayer(ln)
      }
      if (ln?.startsWith('photo_')) seenPhotoLayerNames.add(ln)
      if (ln?.startsWith('text_')) seenTextLayerNames.add(ln)
      if (ln?.startsWith('decor_')) seenDecorLayerNames.add(ln)
      if (ln === 'locked_bg') lockedBgDetected = true
      if (ln) warnUnhandledLayerName('группа', ln, warnings, warnedNames)
      groupStack.push(ln)
      if (groupStack.length > MAX_SVG_GROUP_DEPTH) {
        throw new Error(`[SVG_GROUP_DEPTH_LIMIT_EXCEEDED] Превышена глубина групп SVG: ${groupStack.length} > ${MAX_SVG_GROUP_DEPTH}.`)
      }
      transformStack.push(
        multiplyTransform(
          transformStack[transformStack.length - 1],
          parseSvgTransform(attrs.transform, unsupportedFeatures),
        ),
      )
      groupStyleStack.push(mergeGroupPresentationStyle(attrs))
      groupFrameStack.push({ openLt: lt, removable: groupRemovable(ln), layerName: ln })
      i = gt + 1
      continue
    }

    if (closing) {
      i = gt + 1
      continue
    }

    const inherited = groupStack[groupStack.length - 1] ?? null
    const inheritedDecor = findInheritedLayerName(groupStack, (name) => name.startsWith('decor_'))
    const inheritedTransform = transformStack[transformStack.length - 1]

    if (tagLc === 'rect') {
      const attrs = parseAttributes(attrPart)
      const explicit = getLayerName(attrs)
      const ef = explicit ?? inherited
      if (ef) {
        markFallbackLayer(ef)
      }
      if (ef === 'locked_bg') lockedBgDetected = true
      if (ef?.startsWith('photo_')) seenPhotoLayerNames.add(ef)
      if (ef?.startsWith('text_')) seenTextLayerNames.add(ef)
      if (ef?.startsWith('decor_')) seenDecorLayerNames.add(ef)
      const x = parseNumber(attrs.x) ?? 0
      const y = parseNumber(attrs.y) ?? 0
      const width = parseNumber(attrs.width)
      const height = parseNumber(attrs.height)
      const objectTransform = multiplyTransform(
        inheritedTransform,
        parseSvgTransform(attrs.transform, unsupportedFeatures),
      )

      let stripRect = false
      if (ef && GUIDE_NAMES.has(ef)) stripRect = true
      else if (ef && TECH_PREFIXES.some((p) => ef.startsWith(p))) stripRect = true

      if (stripRect) removalRanges.push({ start: lt, end: gt + 1 })

      if (ef) warnUnhandledLayerName('rect', ef, warnings, warnedNames)

      if (
        ef &&
        GUIDE_NAMES.has(ef) &&
        width != null &&
        height != null &&
        width > 0 &&
        height > 0
      ) {
        const key = ef as 'trim' | 'bleed' | 'safe'
        const tr = transformedRect(x, y, width, height, objectTransform)
        const mmRect = geometry.svgRectToMm(tr)
        guideRectsMm[key] = {
          name: ef,
          ...mmRect,
        }
      }

      if (ef?.startsWith('photo_') && width != null && height != null && width > 0 && height > 0) {
        const tr = transformedRect(x, y, width, height, objectTransform)
        const mmRect = geometry.svgRectToMm(tr)
        const photoEntry: SvgRect = {
          name: ef,
          layerName: ef,
          stackIndex: nextDocumentStackIndex(documentStack),
          ...mmRect,
          svg: tr,
          scene: geometry.mmRectToScene(mmRect),
        }
        photoRects.push(photoEntry)
        interactiveLayers.push({ kind: 'photo', data: photoEntry })
        parsedPhotoLayerNames.add(ef)
        markLayerReport(ef, {
          status: 'parsed_interactive',
          reasonCode: 'PHOTO_PARSED',
          bboxSvg: tr,
          bboxScene: photoEntry.scene,
        })
        removalRanges.push({ start: lt, end: gt + 1 })
      } else {
        const explicitName = getLayerName(attrs)
        const decorName = resolveDecorLayerName(explicitName, inheritedDecor, 'rect', autoDecorSeq)
        if (decorName && width != null && height != null && width > 0 && height > 0) {
          const tr = transformedRect(x, y, width, height, objectTransform)
          pushParsedDecor({
            baseName: decorName,
            shape: 'rect',
            tr,
            attrs,
            removalStart: lt,
            removalEnd: gt + 1,
            autoAssigned: decorName.startsWith('decor_auto_'),
          })
        }
      }

      i = gt + 1
      continue
    }

    if (tagLc === 'ellipse') {
      const attrs = parseAttributes(attrPart)
      const explicitName = getLayerName(attrs)
      const inheritedName = inherited
      const ef = explicitName ?? inheritedName
      if (ef) {
        markFallbackLayer(ef)
        if (ef.startsWith('decor_')) seenDecorLayerNames.add(ef)
      }
      if (ef === 'locked_bg') lockedBgDetected = true
      if (ef) warnUnhandledLayerName('ellipse', ef, warnings, warnedNames)

      const cx = parseNumber(attrs.cx) ?? 0
      const cy = parseNumber(attrs.cy) ?? 0
      const rx = parseNumber(attrs.rx) ?? parseNumber(attrs.r) ?? 0
      const ry = parseNumber(attrs.ry) ?? parseNumber(attrs.r) ?? rx
      const objectTransform = multiplyTransform(
        inheritedTransform,
        parseSvgTransform(attrs.transform, unsupportedFeatures),
      )
      const decorName = resolveDecorLayerName(explicitName, inheritedDecor, 'circle', autoDecorSeq)
      if (decorName && rx > 0 && ry > 0) {
        const tr = transformedRect(cx - rx, cy - ry, rx * 2, ry * 2, objectTransform)
        pushParsedDecor({
          baseName: decorName,
          shape: 'circle',
          tr,
          attrs,
          removalStart: lt,
          removalEnd: gt + 1,
          autoAssigned: decorName.startsWith('decor_auto_'),
        })
      }

      i = gt + 1
      continue
    }

    if (tagLc === 'circle') {
      const attrs = parseAttributes(attrPart)
      const explicitName = getLayerName(attrs)
      const inheritedName = inherited
      const ef = explicitName ?? inheritedName
      if (ef) {
        markFallbackLayer(ef)
        if (ef.startsWith('decor_')) seenDecorLayerNames.add(ef)
      }
      if (ef === 'locked_bg') lockedBgDetected = true
      if (ef) warnUnhandledLayerName('circle', ef, warnings, warnedNames)

      const cx = parseNumber(attrs.cx) ?? 0
      const cy = parseNumber(attrs.cy) ?? 0
      const r = parseNumber(attrs.r)
      const objectTransform = multiplyTransform(
        inheritedTransform,
        parseSvgTransform(attrs.transform, unsupportedFeatures),
      )
      const decorName = resolveDecorLayerName(explicitName, inheritedDecor, 'circle', autoDecorSeq)
      if (decorName && r != null && r > 0) {
        const tr = transformedRect(cx - r, cy - r, r * 2, r * 2, objectTransform)
        pushParsedDecor({
          baseName: decorName,
          shape: 'circle',
          tr,
          attrs,
          removalStart: lt,
          removalEnd: gt + 1,
          autoAssigned: decorName.startsWith('decor_auto_'),
        })
      }

      i = gt + 1
      continue
    }

    if (tagLc === 'path') {
      const attrs = parseAttributes(attrPart)
      const explicitName = getLayerName(attrs)
      const inheritedName = inherited
      const ef = explicitName ?? inheritedName
      if (ef) {
        markFallbackLayer(ef)
        if (ef.startsWith('decor_')) seenDecorLayerNames.add(ef)
      }
      if (ef === 'locked_bg') lockedBgDetected = true
      if (ef) warnUnhandledLayerName('path', ef, warnings, warnedNames)

      const decorName = resolveDecorLayerName(explicitName, inheritedDecor, 'path', autoDecorSeq)
      const d = attrs.d?.trim()
      const baseBounds = d ? parseSvgPathApproxBounds(d) : null
      if (decorName && d && baseBounds && baseBounds.width > 0 && baseBounds.height > 0) {
        const objectTransform = multiplyTransform(
          inheritedTransform,
          parseSvgTransform(attrs.transform, unsupportedFeatures),
        )
        const tr = transformedRect(
          baseBounds.x,
          baseBounds.y,
          baseBounds.width,
          baseBounds.height,
          objectTransform,
        )
        pushParsedDecor({
          baseName: decorName,
          shape: 'path',
          tr,
          attrs,
          pathData: d,
          removalStart: lt,
          removalEnd: gt + 1,
          autoAssigned: decorName.startsWith('decor_auto_'),
        })
      }

      i = gt + 1
      continue
    }

    if (tagLc === 'polygon' || tagLc === 'polyline') {
      const attrs = parseAttributes(attrPart)
      const explicitName = getLayerName(attrs)
      const inheritedName = inherited
      const ef = explicitName ?? inheritedName
      if (ef) {
        markFallbackLayer(ef)
        if (ef.startsWith('decor_')) seenDecorLayerNames.add(ef)
      }
      if (ef === 'locked_bg') lockedBgDetected = true
      if (ef) warnUnhandledLayerName(tagLc, ef, warnings, warnedNames)

      const decorName = resolveDecorLayerName(explicitName, inheritedDecor, 'path', autoDecorSeq)
      const pointsAttr = attrs.points
      const pts = parsePolygonPointPairs(pointsAttr)
      const baseBounds = boundsFromPointPairs(pts)
      if (decorName && baseBounds && tagLc === 'polygon') {
        const objectTransform = multiplyTransform(
          inheritedTransform,
          parseSvgTransform(attrs.transform, unsupportedFeatures),
        )
        const tr = transformedRect(
          baseBounds.x,
          baseBounds.y,
          baseBounds.width,
          baseBounds.height,
          objectTransform,
        )
        const axisRect = isAxisAlignedRectPoints(pts)
        pushParsedDecor({
          baseName: decorName,
          shape: axisRect ? 'rect' : 'path',
          tr,
          attrs,
          ...(axisRect ? {} : { pathData: polygonPointsToPath(pointsAttr ?? '', baseBounds.x, baseBounds.y) ?? undefined }),
          removalStart: lt,
          removalEnd: gt + 1,
          autoAssigned: decorName.startsWith('decor_auto_'),
        })
      }

      i = gt + 1
      continue
    }

    if (tagLc === 'text') {
      if (selfClosing) {
        warnWithCode(warnings, 'TXT_EMPTY_SELF_CLOSING', '<text /> без содержимого пропускается.')
        i = gt + 1
        continue
      }

      const attrs = parseAttributes(attrPart)
      const ef = getLayerName(attrs) ?? inherited
      if (ef) {
        markFallbackLayer(ef)
      }
      if (ef === 'locked_bg') lockedBgDetected = true
      if (ef?.startsWith('photo_')) seenPhotoLayerNames.add(ef)
      if (ef?.startsWith('text_')) seenTextLayerNames.add(ef)
      if (ef?.startsWith('decor_')) seenDecorLayerNames.add(ef)
      const outerEnd = findOuterTextCloseEnd(svg, gt)

      if (outerEnd == null) {
        warnWithCode(warnings, 'TXT_UNCLOSED_NODE', 'Незакрытый <text>.')
        i = gt + 1
        continue
      }

      if (ef ? GUIDE_NAMES.has(ef) || TECH_PREFIXES.some((p) => ef.startsWith(p)) : false)
        removalRanges.push({ start: lt, end: outerEnd })

      if (ef) warnUnhandledLayerName('text', ef, warnings, warnedNames)

      const closeLt = svg.lastIndexOf('</text>', outerEnd - 1)
      const innerStr = closeLt > gt ? svg.slice(gt + 1, closeLt) : ''

      if (ef?.startsWith('text_')) {
        const inheritedGroupStyle = groupStyleStack[groupStyleStack.length - 1] ?? {}
        const textStyle = {
          ...inheritedGroupStyle,
          ...styleFromClassNames(attrs.class, cssClassStyles),
          ...parseStyle(attrs.style),
        }
        const tspans = collectTspans(innerStr)
        const primaryTspan = tspans[0]
        const tspanAttrs = primaryTspan?.attrs ?? {}
        const tspanStyle = {
          ...textStyle,
          ...styleFromClassNames(tspanAttrs.class, cssClassStyles),
          ...parseStyle(tspanAttrs.style),
        }
        if (tspanAttrs['font-family']?.trim()) tspanStyle['font-family'] = tspanAttrs['font-family'].trim()
        const fill = resolveTextFill(tspanAttrs, tspanStyle, attrs, textStyle, inheritedGroupStyle)
          ?? normalizeSvgPaintColor(pickAttr(tspanAttrs, attrs, 'fill'))
        const xv = parseNumber(pickAttr(tspanAttrs, attrs, 'x')) ?? 0
        const yv = parseNumber(pickAttr(tspanAttrs, attrs, 'y')) ?? 0
        const fontSize =
          parseNumber(tspanAttrs['font-size']) ??
          parseFontSizeFromStyle(tspanStyle) ??
          parseNumber(attrs['font-size']) ??
          parseFontSizeFromStyle(textStyle) ??
          18
        let textAnchor = resolveTextAnchor(tspanAttrs, tspanStyle, attrs, textStyle, inheritedGroupStyle)
        const textTransform = multiplyTransform(
          multiplyTransform(inheritedTransform, parseSvgTransform(attrs.transform, unsupportedFeatures)),
          parseSvgTransform(tspanAttrs.transform, unsupportedFeatures),
        )
        const transformedFontSize = fontSize * transformScale(textTransform)
        const fontSizeMm = geometry.svgFontSizeToMm(transformedFontSize)
        const fontSizeScene = geometry.mmToPx(fontSizeMm)
        const parseTspanPresentation = (tspan: ParsedTspan): TspanSegmentPresentation => {
          const style = {
            ...textStyle,
            ...styleFromClassNames(tspan.attrs.class, cssClassStyles),
            ...parseStyle(tspan.attrs.style),
          }
          if (tspan.attrs['font-family']?.trim()) style['font-family'] = tspan.attrs['font-family'].trim()
          const tspanFontSize =
            parseNumber(tspan.attrs['font-size'])
            ?? parseFontSizeFromStyle(style)
            ?? parseFontSizeFromStyle(textStyle)
          return {
            fontFamily:
              parseFontFamilyFromStyle(style)
              ?? parseFontFamilyFromStyle(textStyle)
              ?? (tspan.attrs['font-family'] ? normalizeFontFamilyToken(tspan.attrs['font-family']) : undefined),
            fontWeight:
              parseFontWeightFromStyle(style)
              ?? parseFontWeightFromStyle(textStyle)
              ?? parseFontWeightFromStyle(inheritedGroupStyle),
            fontStyle:
              parseFontStyleFromStyle(style)
              ?? parseFontStyleFromStyle(textStyle)
              ?? parseFontStyleFromStyle(inheritedGroupStyle),
            fill: resolveTextFill(tspan.attrs, style, attrs, textStyle, inheritedGroupStyle),
            fontSize: tspanFontSize ?? undefined,
          }
        }
        const composed = tspans.length > 0
          ? composeTextFromTspans(tspans, yv, transformedFontSize, parseTspanPresentation)
          : null
        const textContent = composed?.text
          || primaryTspan?.text
          || decodeXmlText(innerStr)
          || ef.replace(/^text_/, '')
        const textStyles = composed?.textStyles?.length ? composed.textStyles : undefined
        const effectiveTspans = tspans.length > 0
          ? resolveTspanEffectiveY(
            [...tspans].sort((a, b) => a.order - b.order),
            yv,
            transformedFontSize,
          )
          : tspans
        const lineMetrics = resolveTspanLineMetrics(effectiveTspans, attrs, transformedFontSize, textTransform)
        const inferred = textAnchor === 'start'
          ? inferAlignedTextAnchor(lineMetrics, transformedFontSize)
          : undefined
        if (inferred) textAnchor = inferred.anchor
        const point = inferred
          ? { x: inferred.anchorX, y: inferred.anchorY }
          : applyTransform(textTransform, xv, yv)
        const mmPoint = geometry.svgPointToMm(point)
        const scenePoint = geometry.mmPointToScene(mmPoint)
        const fontFamily =
          textStyles?.[0]?.fontFamily
          ?? parseFontFamilyFromStyle(tspanStyle)
          ?? parseFontFamilyFromStyle(textStyle)
          ?? (tspanAttrs['font-family'] ? normalizeFontFamilyToken(tspanAttrs['font-family']) : undefined)
          ?? (attrs['font-family'] ? normalizeFontFamilyToken(attrs['font-family']) : undefined)
        const fontWeight =
          parseFontWeightFromStyle(tspanStyle)
          ?? parseFontWeightFromStyle(textStyle)
          ?? parseFontWeightFromStyle(inheritedGroupStyle)
        const fontStyle =
          parseFontStyleFromStyle(tspanStyle)
          ?? parseFontStyleFromStyle(textStyle)
          ?? parseFontStyleFromStyle(inheritedGroupStyle)
        const frameWidthScene = computeTextFrameWidthScene(
          textContent.split('\n'),
          lineMetrics,
          fontSizeScene,
          textAnchor,
        )
        const angle = transformAngleDeg(textTransform)
        const textEntry: SvgText = {
          name: ef,
          layerName: ef,
          stackIndex: nextDocumentStackIndex(documentStack),
          x: mmPoint.x,
          y: mmPoint.y,
          fontSize: fontSizeMm,
          fontFamily,
          fontWeight,
          fontStyle,
          text: textContent,
          textAnchor,
          textStyles,
          frameWidthScene,
          fill,
          angle: Math.abs(angle) > 0.01 ? angle : undefined,
          svg: { ...point, fontSize: transformedFontSize },
          scene: { ...scenePoint, fontSize: fontSizeScene },
        }
        textItems.push(textEntry)
        interactiveLayers.push({ kind: 'text', data: textEntry })
        parsedTextLayerNames.add(ef)
        markLayerReport(ef, {
          status: 'parsed_interactive',
          reasonCode: 'TEXT_PARSED',
          bboxSvg: {
            x: point.x,
            y: point.y - transformedFontSize,
            width: Math.max(1, estimateLineWidthSvg(textContent.split('\n')[0] ?? textContent, transformedFontSize)),
            height: Math.max(transformedFontSize, transformedFontSize * textContent.split('\n').length * 1.2),
          },
          bboxScene: {
            x: scenePoint.x,
            y: scenePoint.y - fontSizeScene,
            width: Math.max(1, frameWidthScene ?? estimateLineWidthSvg(textContent.split('\n')[0] ?? textContent, fontSizeScene)),
            height: Math.max(fontSizeScene, fontSizeScene * textContent.split('\n').length * 1.2),
          },
        })
        removalRanges.push({ start: lt, end: outerEnd })
      }

      i = outerEnd
      continue
    }

    i = gt + 1
  }
  timing.scanMs = Math.round((performance.now() - scanStart) * 1000) / 1000

  const mergedRanges = mergeRemovalRanges(removalRanges)
  const strippedSvg = applyRemovalRanges(svg, mergedRanges)

  for (const name of seenTextLayerNames) {
    if (parsedTextLayerNames.has(name)) continue
    warnWithCode(
      warnings,
      'TXT_NO_VALID_NODE',
      `Слой ${name} оставлен в фоне: не удалось извлечь валидный интерактивный text-объект.`,
    )
  }
  for (const name of seenPhotoLayerNames) {
    if (parsedPhotoLayerNames.has(name)) continue
    warnWithCode(
      warnings,
      'PHOTO_NO_VALID_RECT',
      `Слой ${name} оставлен в фоне: не найден валидный rect для photo-поля.`,
    )
  }
  for (const name of seenDecorLayerNames) {
    if (parsedDecorLayerNames.has(name)) continue
    warnWithCode(
      warnings,
      'DECOR_NO_VALID_SHAPE',
      `Слой ${name} оставлен в фоне: для decor_* поддержаны rect/circle/ellipse/path/polygon с валидной геометрией.`,
    )
  }
  if (unsupportedFeatures.size > 0) {
    warnWithCode(
      warnings,
      'TRANSFORM_UNSUPPORTED',
      `Обнаружены неподдерживаемые трансформации: ${[...unsupportedFeatures].join(', ')}`,
    )
  }

  const prepressHints =
    Object.keys(guideRectsMm).length > 0
      ? inferPrepressFromGuides(guideRectsMm, warnings)
      : null

  const textStageStart = performance.now()
  const mergedTextItems = mergeTextItemsByName(textItems)
  const mergedTextByName = new Map(mergedTextItems.map((t) => [t.name, t]))
  const mergedInteractiveLayers = sortInteractiveLayersByStackIndex(
    alignInteractiveTextLayers(interactiveLayers, mergedTextByName),
  )
  timing.textMs = Math.round((performance.now() - textStageStart) * 1000) / 1000
  if (mergedTextItems.length < textItems.length) {
    warnWithCode(
      warnings,
      'TXT_MERGED_MULTILINE',
      `Объединены строки в ${textItems.length - mergedTextItems.length} многострочных текстовых блоков (группа text_* / несколько <tspan>).`,
    )
  }

  if (photoRects.length === 0 && mergedTextItems.length === 0 && decorItems.length === 0) {
    warnWithCode(
      warnings,
      'INTERACTIVE_FIELDS_NOT_FOUND',
      'Не найдено объектов photo_*, text_* или decor_*; добавьте поля вручную или проверьте имена групп.',
    )
  }
  warnWithCode(
    warnings,
    'IMPORT_SUMMARY',
    `Импорт SVG: найдено фото-полей ${photoRects.length}, текстовых полей ${mergedTextItems.length}, decor-объектов ${decorItems.length}, направляющих ${Object.keys(guideRectsMm).length}.`,
  )

  const assembleStart = performance.now()
  const layerReports = seenLayerOrder.map((name) => namedLayerReports.get(name)!).filter(Boolean)
  const countsByStatus: Record<ParserLayerStatus, number> = {
    parsed_interactive: 0,
    kept_as_background: 0,
    ignored_technical: 0,
  }
  const countsByReasonCode: Record<string, number> = {}
  for (const layer of layerReports) {
    countsByStatus[layer.status] += 1
    countsByReasonCode[layer.reasonCode] = (countsByReasonCode[layer.reasonCode] ?? 0) + 1
  }
  timing.assembleMs = Math.round((performance.now() - assembleStart) * 1000) / 1000
  timing.totalMs = Math.round((performance.now() - t0) * 1000) / 1000
  timing.sanitizeMs = Math.max(
    0,
    Math.round((timing.totalMs - timing.scanMs - timing.geometryMs - timing.textMs - timing.assembleMs) * 1000) / 1000,
  )
  pushTrace(`scan=${timing.scanMs}ms text=${timing.textMs}ms assemble=${timing.assembleMs}ms`)

  return {
    widthMm,
    heightMm,
    photoRects,
    textItems: mergedTextItems,
    interactiveLayers: mergedInteractiveLayers,
    guideRectsMm,
    lockedBgDetected,
    prepressHints,
    geometry,
    summary: {
      photoFields: photoRects.length,
      textFields: mergedTextItems.length,
      decorFields: decorItems.length,
      guides: Object.keys(guideRectsMm),
      strippedLayers: mergedRanges.length,
      interactiveLayerCount: interactiveLayers.length,
      interactiveParsedPercent: (seenPhotoLayerNames.size + seenTextLayerNames.size + seenDecorLayerNames.size) > 0
        ? Math.round(
          ((parsedPhotoLayerNames.size + parsedTextLayerNames.size + parsedDecorLayerNames.size)
            / (seenPhotoLayerNames.size + seenTextLayerNames.size + seenDecorLayerNames.size)) * 1000,
        ) / 10
        : 100,
      fallbackBackgroundPercent: (seenPhotoLayerNames.size + seenTextLayerNames.size + seenDecorLayerNames.size) > 0
        ? Math.round(
          (((seenPhotoLayerNames.size + seenTextLayerNames.size + seenDecorLayerNames.size)
            - (parsedPhotoLayerNames.size + parsedTextLayerNames.size + parsedDecorLayerNames.size))
            / (seenPhotoLayerNames.size + seenTextLayerNames.size + seenDecorLayerNames.size)) * 1000,
        ) / 10
        : 0,
      unsupportedFeatures: [...unsupportedFeatures],
    },
    removalRanges: mergedRanges,
    strippedSvg,
    warnings,
    parserReport: {
      layers: layerReports,
      countsByStatus,
      countsByReasonCode,
      unsupportedFeatures: [...unsupportedFeatures],
      timings: timing,
    },
    trace: traceEnabled
      ? {
        timeline: traceTimeline,
      }
      : undefined,
  }
}
