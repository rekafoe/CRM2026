/**
 * Парсинг SVG linearGradient/radialGradient (Corel: fill:url(#id) + <defs>).
 * Конвертация в Fabric Gradient JSON (type + coords + colorStops).
 */

import type { GeometryRect } from './designTemplateSvgGeometry'

export type FabricGradientColorStop = {
  offset: number
  color: string
}

/** Сериализованный Fabric Gradient (fabricJSON.fill / stroke). */
export type FabricGradientFill = {
  type: 'linear' | 'radial'
  coords: {
    x1: number
    y1: number
    x2: number
    y2: number
    r1?: number
    r2?: number
  }
  colorStops: FabricGradientColorStop[]
  gradientUnits: 'pixels'
}

export type SvgGradientDef = {
  id: string
  kind: 'linear' | 'radial'
  units: 'userSpaceOnUse' | 'objectBoundingBox'
  x1: number
  y1: number
  x2: number
  y2: number
  /** radial: центр / радиус (SVG). */
  cx: number
  cy: number
  r: number
  fx: number
  fy: number
  stops: FabricGradientColorStop[]
}

export type SvgPaint = string | FabricGradientFill

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? ''
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

function parseStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!style) return out
  for (const part of style.split(';')) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()
    if (key) out[key] = val
  }
  return out
}

/** #rgb / named / rgb() — минимальный нормализатор цвета stop. */
function normalizeStopColor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const raw = value.trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower === 'none' || lower === 'transparent') return undefined
  if (lower.startsWith('#')) {
    if (lower.length === 4) {
      return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`
    }
    return raw
  }
  return raw
}

function parseStopOffset(raw: string | undefined): number {
  if (!raw) return 0
  const trimmed = raw.trim()
  if (trimmed.endsWith('%')) {
    const n = Number(trimmed.slice(0, -1))
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : 0
  }
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return 0
  return n > 1 ? Math.min(1, Math.max(0, n / 100)) : Math.min(1, Math.max(0, n))
}

function parseGradientStops(inner: string): FabricGradientColorStop[] {
  const stops: FabricGradientColorStop[] = []
  const re = /<stop\b([^>]*)\/?>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(inner)) !== null) {
    const attrs = parseAttributes(match[1] ?? '')
    const style = parseStyle(attrs.style)
    const color = normalizeStopColor(
      attrs['stop-color']
      ?? style['stop-color']
      ?? attrs.color
      ?? style.color,
    )
    if (!color) continue
    const opacityRaw = attrs['stop-opacity'] ?? style['stop-opacity']
    const opacity = opacityRaw != null ? Number(opacityRaw) : 1
    let finalColor = color
    if (Number.isFinite(opacity) && opacity < 1 && opacity >= 0) {
      // Прозрачность stop → rgba, если цвет hex
      if (/^#[0-9a-f]{6}$/i.test(color)) {
        const r = parseInt(color.slice(1, 3), 16)
        const g = parseInt(color.slice(3, 5), 16)
        const b = parseInt(color.slice(5, 7), 16)
        finalColor = `rgba(${r},${g},${b},${opacity})`
      }
    }
    stops.push({
      offset: parseStopOffset(attrs.offset ?? style.offset),
      color: finalColor,
    })
  }
  stops.sort((a, b) => a.offset - b.offset)
  return stops
}

/**
 * Собирает все linearGradient / radialGradient из SVG (обычно из <defs>).
 */
export function parseSvgGradientDefs(svg: string): Map<string, SvgGradientDef> {
  const map = new Map<string, SvgGradientDef>()
  const re = /<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(svg)) !== null) {
    const kindRaw = match[1]!.toLowerCase()
    const kind: 'linear' | 'radial' = kindRaw === 'radialgradient' ? 'radial' : 'linear'
    const attrs = parseAttributes(match[2] ?? '')
    const id = (attrs.id ?? '').trim()
    if (!id) continue
    const unitsRaw = (attrs.gradientUnits ?? 'objectBoundingBox').trim()
    const units: SvgGradientDef['units'] =
      unitsRaw === 'userSpaceOnUse' ? 'userSpaceOnUse' : 'objectBoundingBox'
    const stops = parseGradientStops(match[3] ?? '')
    if (stops.length === 0) continue

    if (kind === 'linear') {
      map.set(id, {
        id,
        kind,
        units,
        x1: parseNumber(attrs.x1) ?? 0,
        y1: parseNumber(attrs.y1) ?? 0,
        x2: parseNumber(attrs.x2) ?? 1,
        y2: parseNumber(attrs.y2) ?? 0,
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        fx: 0.5,
        fy: 0.5,
        stops,
      })
    } else {
      const cx = parseNumber(attrs.cx) ?? 0.5
      const cy = parseNumber(attrs.cy) ?? 0.5
      const r = parseNumber(attrs.r) ?? 0.5
      const fx = parseNumber(attrs.fx) ?? cx
      const fy = parseNumber(attrs.fy) ?? cy
      map.set(id, {
        id,
        kind,
        units,
        x1: fx,
        y1: fy,
        x2: cx,
        y2: cy,
        cx,
        cy,
        r,
        fx,
        fy,
        stops,
      })
    }
  }
  return map
}

export function parsePaintUrlRef(value: string | undefined | null): string | null {
  if (!value) return null
  const m = value.trim().match(/^url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)$/i)
  return m?.[1] ?? null
}

/** Fallback solid из градиента (фон страницы / underlay). */
export function solidColorFromGradient(def: SvgGradientDef): string {
  const mid = def.stops[Math.floor(def.stops.length / 2)] ?? def.stops[def.stops.length - 1]
  return mid?.color ?? '#000000'
}

/**
 * objectSvg — bbox фигуры в SVG units.
 * coordSpace:
 *  - pathLocal: coords в локальных SVG units (как path width/height + scaleX/Y)
 *  - sceneBox: coords в scene px (rect/circle с width/height = scene)
 */
export function svgGradientToFabricFill(
  def: SvgGradientDef,
  objectSvg: GeometryRect,
  coordSpace: 'pathLocal' | 'sceneBox',
  objectScene?: GeometryRect,
): FabricGradientFill {
  const mapPoint = (x: number, y: number): { x: number; y: number } => {
    if (def.units === 'objectBoundingBox') {
      if (coordSpace === 'pathLocal') {
        return {
          x: x * objectSvg.width,
          y: y * objectSvg.height,
        }
      }
      const scene = objectScene ?? objectSvg
      return {
        x: x * scene.width,
        y: y * scene.height,
      }
    }
    // userSpaceOnUse — абсолютные SVG coords → локально относительно bbox
    if (coordSpace === 'pathLocal') {
      return { x: x - objectSvg.x, y: y - objectSvg.y }
    }
    const scene = objectScene ?? objectSvg
    const sx = objectSvg.width > 0 ? scene.width / objectSvg.width : 1
    const sy = objectSvg.height > 0 ? scene.height / objectSvg.height : 1
    return {
      x: (x - objectSvg.x) * sx,
      y: (y - objectSvg.y) * sy,
    }
  }

  if (def.kind === 'radial') {
    const c = mapPoint(def.cx, def.cy)
    const f = mapPoint(def.fx, def.fy)
    let r2: number
    if (def.units === 'objectBoundingBox') {
      const scene = objectScene ?? objectSvg
      const basis = coordSpace === 'pathLocal'
        ? Math.max(objectSvg.width, objectSvg.height)
        : Math.max(scene.width, scene.height)
      r2 = Math.max(0, def.r * basis)
    } else if (coordSpace === 'pathLocal') {
      r2 = Math.max(0, def.r)
    } else {
      const scene = objectScene ?? objectSvg
      const sx = objectSvg.width > 0 ? scene.width / objectSvg.width : 1
      r2 = Math.max(0, def.r * sx)
    }
    return {
      type: 'radial',
      gradientUnits: 'pixels',
      coords: {
        x1: f.x,
        y1: f.y,
        r1: 0,
        x2: c.x,
        y2: c.y,
        r2,
      },
      colorStops: def.stops.map((s) => ({ ...s })),
    }
  }

  const p1 = mapPoint(def.x1, def.y1)
  const p2 = mapPoint(def.x2, def.y2)
  return {
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
    colorStops: def.stops.map((s) => ({ ...s })),
  }
}

/**
 * fill/stroke: solid цвет или url(#grad) → Fabric gradient / solid fallback.
 */
export function resolveSvgPaint(
  raw: string | undefined,
  gradients: Map<string, SvgGradientDef>,
  objectSvg: GeometryRect,
  coordSpace: 'pathLocal' | 'sceneBox',
  objectScene?: GeometryRect,
  normalizeSolid?: (value: string | undefined) => string | undefined,
): SvgPaint | undefined {
  if (!raw?.trim()) return undefined
  const ref = parsePaintUrlRef(raw)
  if (ref) {
    const def = gradients.get(ref)
    if (!def) return undefined
    return svgGradientToFabricFill(def, objectSvg, coordSpace, objectScene)
  }
  if (normalizeSolid) return normalizeSolid(raw)
  return raw.trim() || undefined
}
