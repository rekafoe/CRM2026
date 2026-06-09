/**
 * Именованные слои импортного SVG → photo_* rect, text_* text,
 * trim/bleed/safe → prepress (грубая эстимация мм),
 * фоновый файл без этих элементов и без дубля с редактором overlay.
 */

import {
  createSvgGeometry,
  PX_TO_MM,
  type DesignTemplateGeometryDebug,
  type GeometryPoint,
  type GeometryRect,
} from './designTemplateSvgGeometry'

export type SvgRect = {
  name: string
  x: number
  y: number
  width: number
  height: number
  svg: GeometryRect
  scene: GeometryRect
}

export type SvgText = {
  name: string
  x: number
  y: number
  fontSize: number
  fontFamily?: string
  text: string
  textAnchor: 'start' | 'middle' | 'end'
  /** Угол поворота в градусах (Fabric, по часовой), из SVG transform. */
  angle?: number
  svg: GeometryPoint & { fontSize: number }
  scene: GeometryPoint & { fontSize: number }
}

/** Интерактивный слой в порядке появления в SVG (z-order для Fabric). */
export type SvgInteractiveLayer =
  | { kind: 'photo'; data: SvgRect }
  | { kind: 'text'; data: SvgText }

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

export interface ImportedSvgLayers {
  widthMm: number
  heightMm: number
  photoRects: SvgRect[]
  textItems: SvgText[]
  /** photo_* и text_* в порядке документа SVG (для z-order в fabricJSON). */
  interactiveLayers: SvgInteractiveLayer[]
  guideRectsMm: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>>
  lockedBgDetected: boolean
  prepressHints: PrepressFromSvgGuides | null
  geometry: DesignTemplateGeometryDebug
  summary: {
    photoFields: number
    textFields: number
    guides: string[]
    strippedLayers: number
  }
  /** Интервалы вырезаемых блоков SVG (слиянные). */
  removalRanges: RemovalRange[]
  /** Тот же SVG без интерактивных/guide слоёв — для загрузки фона без дубликатов. */
  strippedSvg: string
  warnings: string[]
}

const TECH_PREFIXES = ['hidden_', 'guide_']

const GUIDE_NAMES = new Set(['trim', 'bleed', 'safe'])

type SvgTransform = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY_TRANSFORM: SvgTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

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

function parseSvgTransform(value: string | undefined): SvgTransform {
  if (!value) return IDENTITY_TRANSFORM
  let current = IDENTITY_TRANSFORM
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(value))) {
    const [, kind, rawArgs] = match
    const nums = parseTransformNumbers(rawArgs)
    let next = IDENTITY_TRANSFORM
    if (kind.toLowerCase() === 'matrix' && nums.length >= 6) {
      next = { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] }
    } else if (kind.toLowerCase() === 'translate' && nums.length >= 1) {
      next = { ...IDENTITY_TRANSFORM, e: nums[0], f: nums[1] ?? 0 }
    } else if (kind.toLowerCase() === 'scale' && nums.length >= 1) {
      next = { ...IDENTITY_TRANSFORM, a: nums[0], d: nums[1] ?? nums[0] }
    } else if (kind.toLowerCase() === 'rotate' && nums.length >= 1) {
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
    }
    current = multiplyTransform(current, next)
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
      warnings.push('Слои bleed и trim не соотносятся как вложенные — дозаливка по умолчанию 2 мм.')
    }
  } else if (B && !T) {
    warnings.push('Слой bleed без trim — укажите trim для точной дозаливки.')
  }

  if (T && S) {
    const mm = meanInsetInnerWithinOuterMm(T, S)
    if (mm != null && mm >= 0.05 && mm < 80) {
      safeMm = Math.round(mm * 20) / 20
    } else {
      warnings.push('Слои trim и safe не соотносятся как вложенные — безопасная зона по умолчанию 5 мм.')
    }
  } else if (S && !T) {
    warnings.push('Слой safe без trim — укажите trim для точной безопасной зоны.')
  }

  if (B && T && !S) {
    warnings.push('Подсказка: добавьте rect safe внутри trim для оценки safe zone.')
  }

  warnings.push(
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

/** SVG text-anchor + CSS text-align (Corel часто пишет text-align в style). */
function resolveTextAnchor(...sources: Array<Record<string, string> | undefined>): SvgText['textAnchor'] {
  for (const source of sources) {
    if (!source) continue
    const anchor = source['text-anchor']?.trim()
    if (anchor) return normalizeTextAnchor(anchor)
  }
  for (const source of sources) {
    if (!source) continue
    const align = source['text-align']?.trim()
    if (align) return normalizeTextAnchor(align)
  }
  return 'start'
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

export function decodeXmlText(value: string): string {
  return decodeCorelUnicodeEscapes(
    value
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"'),
  ).trim()
}

type ParsedTspan = { attrs: Record<string, string>; text: string; y: number; order: number }

function collectTspans(innerSvg: string): ParsedTspan[] {
  const results: ParsedTspan[] = []
  const re = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi
  let match: RegExpExecArray | null
  let order = 0
  while ((match = re.exec(innerSvg)) !== null) {
    const attrs = parseAttributes(match[1] ?? '')
    const text = decodeXmlText(match[2] ?? '')
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
    const group = groups.get(name)!
    if (group.length === 1) return group[0]
    const sorted = [...group].sort((a, b) => a.y - b.y || a.x - b.x)
    return {
      ...sorted[0],
      text: sorted.map((t) => t.text).join('\n'),
    }
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
    warnings.push('SVG не содержит явные width/height, размеры взяты из viewBox или fallback.')
  }

  return { widthMm, heightMm, svgAttrs, warnings }
}

function warnUnhandledLayerName(kind: string, name: string, warnings: string[], seen: Set<string>) {
  if (kind === 'группа' && (name.startsWith('photo_') || name.startsWith('text_'))) return

  const key = `${kind}:${name}`
  if (seen.has(key)) return
  seen.add(key)

  if (name.startsWith('photo_') || name.startsWith('text_')) return
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
  warnings.push(
    `Неиспользуемое имя в ${kind} "${name}". Ожидались photo_*, text_*, trim, bleed, safe, locked_bg, hidden_*, guide_*.`,
  )
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
  if (layerName.startsWith('photo_') || layerName.startsWith('text_')) return true
  return TECH_PREFIXES.some((p) => layerName.startsWith(p))
}

export function parseImportedSvgLayers(
  svg: string,
  options: { sceneScale?: number } = {},
): ImportedSvgLayers {
  const dims = dimsFromSvgRoot(svg)
  const vb = (dims.svgAttrs.viewBox || '').split(/\s+/).map(Number).filter(Number.isFinite)
  const viewBox = vb.length === 4
    ? { minX: vb[0], minY: vb[1], width: vb[2], height: vb[3] }
    : null
  const widthMm = dims.widthMm
  const heightMm = dims.heightMm
  const cssClassStyles = parseCssClassStyles(svg)
  const geometry = createSvgGeometry({
    pageMm: { width: widthMm, height: heightMm },
    viewBox,
    sceneScale: options.sceneScale,
  })

  const warnings = [...dims.warnings]
  const photoRects: SvgRect[] = []
  const textItems: SvgText[] = []
  const interactiveLayers: SvgInteractiveLayer[] = []
  const guideRectsMm: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>> = {}
  let lockedBgDetected = false
  const warnedNames = new Set<string>()
  const removalRanges: RemovalRange[] = []

  const groupStack: (string | null)[] = [null]
  const transformStack: SvgTransform[] = [IDENTITY_TRANSFORM]
  const groupStyleStack: Array<Record<string, string>> = [{}]
  const groupFrameStack: Array<{ openLt: number; removable: boolean }> = []

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
    return { ...parent, ...self }
  }

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
      if (framed?.removable) removalRanges.push({ start: framed.openLt, end: gt + 1 })
      i = gt + 1
      continue
    }

    if (!closing && tagLc === 'g') {
      const attrs = parseAttributes(attrPart)
      const ln = getLayerName(attrs)
      if (ln === 'locked_bg') lockedBgDetected = true
      if (ln) warnUnhandledLayerName('группа', ln, warnings, warnedNames)
      groupStack.push(ln)
      transformStack.push(multiplyTransform(transformStack[transformStack.length - 1], parseSvgTransform(attrs.transform)))
      groupStyleStack.push(mergeGroupPresentationStyle(attrs))
      groupFrameStack.push({ openLt: lt, removable: groupRemovable(ln) })
      i = gt + 1
      continue
    }

    if (closing) {
      i = gt + 1
      continue
    }

    const inherited = groupStack[groupStack.length - 1] ?? null
    const inheritedTransform = transformStack[transformStack.length - 1]

    if (tagLc === 'rect') {
      const attrs = parseAttributes(attrPart)
      const explicit = getLayerName(attrs)
      const ef = explicit ?? inherited
      const x = parseNumber(attrs.x) ?? 0
      const y = parseNumber(attrs.y) ?? 0
      const width = parseNumber(attrs.width)
      const height = parseNumber(attrs.height)
      const objectTransform = multiplyTransform(inheritedTransform, parseSvgTransform(attrs.transform))

      let stripRect = false
      if (ef?.startsWith('photo_')) stripRect = true
      else if (ef && GUIDE_NAMES.has(ef)) stripRect = true
      else if (ef?.startsWith('text_')) stripRect = true
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
          ...mmRect,
          svg: tr,
          scene: geometry.mmRectToScene(mmRect),
        }
        photoRects.push(photoEntry)
        interactiveLayers.push({ kind: 'photo', data: photoEntry })
      }

      i = gt + 1
      continue
    }

    if (tagLc === 'text') {
      if (selfClosing) {
        warnings.push('<text /> без содержимого пропускается.')
        i = gt + 1
        continue
      }

      const attrs = parseAttributes(attrPart)
      const ef = getLayerName(attrs) ?? inherited
      const outerEnd = findOuterTextCloseEnd(svg, gt)

      if (outerEnd == null) {
        warnings.push('Незакрытый <text>.')
        i = gt + 1
        continue
      }

      if (
        ef?.startsWith('text_') ||
        ef?.startsWith('photo_') ||
        (ef ? GUIDE_NAMES.has(ef) || TECH_PREFIXES.some((p) => ef.startsWith(p)) : false)
      )
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
        const xv = parseNumber(pickAttr(tspanAttrs, attrs, 'x')) ?? 0
        const yv = parseNumber(pickAttr(tspanAttrs, attrs, 'y')) ?? 0
        const fontSize =
          parseNumber(tspanAttrs['font-size']) ??
          parseFontSizeFromStyle(tspanStyle) ??
          parseNumber(attrs['font-size']) ??
          parseFontSizeFromStyle(textStyle) ??
          18
        const textAnchor = resolveTextAnchor(tspanAttrs, tspanStyle, attrs, textStyle)
        const textTransform = multiplyTransform(
          multiplyTransform(inheritedTransform, parseSvgTransform(attrs.transform)),
          parseSvgTransform(tspanAttrs.transform),
        )
        const point = applyTransform(textTransform, xv, yv)
        const mmPoint = geometry.svgPointToMm(point)
        const transformedFontSize = fontSize * transformScale(textTransform)
        const fontSizeMm = geometry.svgFontSizeToMm(transformedFontSize)
        const scenePoint = geometry.mmPointToScene(mmPoint)
        const fontFamily =
          parseFontFamilyFromStyle(tspanStyle)
          ?? parseFontFamilyFromStyle(textStyle)
          ?? (tspanAttrs['font-family'] ? normalizeFontFamilyToken(tspanAttrs['font-family']) : undefined)
          ?? (attrs['font-family'] ? normalizeFontFamilyToken(attrs['font-family']) : undefined)
        const textContent = tspans.length > 1
          ? tspans.sort((a, b) => a.order - b.order).map((t) => t.text).join('\n')
          : primaryTspan?.text || decodeXmlText(innerStr) || ef.replace(/^text_/, '')
        const angle = transformAngleDeg(textTransform)
        const textEntry: SvgText = {
          name: ef,
          x: mmPoint.x,
          y: mmPoint.y,
          fontSize: fontSizeMm,
          fontFamily,
          text: textContent,
          textAnchor,
          angle: Math.abs(angle) > 0.01 ? angle : undefined,
          svg: { ...point, fontSize: transformedFontSize },
          scene: { ...scenePoint, fontSize: geometry.mmToPx(fontSizeMm) },
        }
        textItems.push(textEntry)
        interactiveLayers.push({ kind: 'text', data: textEntry })
      }

      i = outerEnd
      continue
    }

    i = gt + 1
  }

  const mergedRanges = mergeRemovalRanges(removalRanges)
  const strippedSvg = applyRemovalRanges(svg, mergedRanges)

  const prepressHints =
    Object.keys(guideRectsMm).length > 0
      ? inferPrepressFromGuides(guideRectsMm, warnings)
      : null

  const mergedTextItems = mergeTextItemsByName(textItems)
  const mergedTextByName = new Map(mergedTextItems.map((t) => [t.name, t]))
  const mergedInteractiveLayers = alignInteractiveTextLayers(interactiveLayers, mergedTextByName)
  if (mergedTextItems.length < textItems.length) {
    warnings.push(
      `Объединены строки в ${textItems.length - mergedTextItems.length} многострочных текстовых блоков (группа text_* / несколько <tspan>).`,
    )
  }

  if (photoRects.length === 0 && mergedTextItems.length === 0) {
    warnings.push(
      'Не найдено объектов photo_* или text_*; добавьте поля вручную или проверьте имена групп.',
    )
  }
  warnings.push(
    `Импорт SVG: найдено фото-полей ${photoRects.length}, текстовых полей ${mergedTextItems.length}, направляющих ${Object.keys(guideRectsMm).length}.`,
  )

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
      guides: Object.keys(guideRectsMm),
      strippedLayers: mergedRanges.length,
    },
    removalRanges: mergedRanges,
    strippedSvg,
    warnings,
  }
}
