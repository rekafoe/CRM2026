/**
 * Именованные слои импортного SVG → photo_* rect, text_* text,
 * trim/bleed/safe → prepress (грубая эстимация мм),
 * фоновый файл без этих элементов и без дубля с редактором overlay.
 */

export type SvgRect = {
  name: string
  x: number
  y: number
  width: number
  height: number
}

export type SvgText = {
  name: string
  x: number
  y: number
  fontSize: number
  text: string
}

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
  guideRectsMm: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>>
  lockedBgDetected: boolean
  prepressHints: PrepressFromSvgGuides | null
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

export const PX_TO_MM = 25.4 / 96

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

function parseTransformNumbers(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((v) => Number(v))
    .filter(Number.isFinite)
}

function parseSvgTransform(value: string | undefined): SvgTransform {
  if (!value) return IDENTITY_TRANSFORM
  let current = IDENTITY_TRANSFORM
  const re = /(matrix|translate|scale)\s*\(([^)]*)\)/gi
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

export function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function getLayerName(attrs: Record<string, string>): string | null {
  return attrs.id || attrs['inkscape:label'] || attrs['data-name'] || null
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

export function parseImportedSvgLayers(svg: string): ImportedSvgLayers {
  const dims = dimsFromSvgRoot(svg)
  const vb = (dims.svgAttrs.viewBox || '').split(/\s+/).map(Number).filter(Number.isFinite)
  const viewBoxWidth = vb.length === 4 ? vb[2] : null
  const viewBoxHeight = vb.length === 4 ? vb[3] : null
  const widthMm = dims.widthMm
  const heightMm = dims.heightMm
  const scaleX = viewBoxWidth && widthMm ? widthMm / viewBoxWidth : PX_TO_MM
  const scaleY = viewBoxHeight && heightMm ? heightMm / viewBoxHeight : PX_TO_MM
  const avgScale = (scaleX + scaleY) / 2

  const warnings = [...dims.warnings]
  const photoRects: SvgRect[] = []
  const textItems: SvgText[] = []
  const guideRectsMm: Partial<Record<'trim' | 'bleed' | 'safe', MmRect>> = {}
  let lockedBgDetected = false
  const warnedNames = new Set<string>()
  const removalRanges: RemovalRange[] = []

  const groupStack: (string | null)[] = [null]
  const transformStack: SvgTransform[] = [IDENTITY_TRANSFORM]
  const groupFrameStack: Array<{ openLt: number; removable: boolean }> = []

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
        guideRectsMm[key] = {
          name: ef,
          x: tr.x * scaleX,
          y: tr.y * scaleY,
          width: tr.width * scaleX,
          height: tr.height * scaleY,
        }
      }

      if (ef?.startsWith('photo_') && width != null && height != null && width > 0 && height > 0) {
        const tr = transformedRect(x, y, width, height, objectTransform)
        photoRects.push({
          name: ef,
          x: tr.x * scaleX,
          y: tr.y * scaleY,
          width: tr.width * scaleX,
          height: tr.height * scaleY,
        })
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
        const xv = parseNumber(attrs.x) ?? 0
        const yv = parseNumber(attrs.y) ?? 0
        const fontSize = parseNumber(attrs['font-size']) ?? 18
        const point = applyTransform(
          multiplyTransform(inheritedTransform, parseSvgTransform(attrs.transform)),
          xv,
          yv,
        )
        textItems.push({
          name: ef,
          x: point.x * scaleX,
          y: point.y * scaleY,
          fontSize: fontSize * avgScale,
          text: decodeXmlText(innerStr) || ef.replace(/^text_/, ''),
        })
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

  if (photoRects.length === 0 && textItems.length === 0) {
    warnings.push(
      'Не найдено объектов photo_* или text_*; добавьте поля вручную или проверьте имена групп.',
    )
  }
  warnings.push(
    `Импорт SVG: найдено фото-полей ${photoRects.length}, текстовых полей ${textItems.length}, направляющих ${Object.keys(guideRectsMm).length}.`,
  )

  return {
    widthMm,
    heightMm,
    photoRects,
    textItems,
    guideRectsMm,
    lockedBgDetected,
    prepressHints,
    summary: {
      photoFields: photoRects.length,
      textFields: textItems.length,
      guides: Object.keys(guideRectsMm),
      strippedLayers: mergedRanges.length,
    },
    removalRanges: mergedRanges,
    strippedSvg,
    warnings,
  }
}
