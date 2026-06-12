export const MM_TO_PX = 96 / 25.4
export const PX_TO_MM = 25.4 / 96

export type GeometryPoint = { x: number; y: number }
export type GeometryRect = GeometryPoint & { width: number; height: number }

export type SvgViewBox = {
  minX: number
  minY: number
  width: number
  height: number
} | null

type PreserveAspectRatioMode = 'none' | 'meet' | 'slice'
type PreserveAspectRatioAlignX = 'min' | 'mid' | 'max'
type PreserveAspectRatioAlignY = 'min' | 'mid' | 'max'

type PreserveAspectRatioConfig = {
  mode: PreserveAspectRatioMode
  alignX: PreserveAspectRatioAlignX
  alignY: PreserveAspectRatioAlignY
}

export type DesignTemplateGeometryDebug = {
  pageMm: { width: number; height: number }
  viewBox: SvgViewBox
  preserveAspectRatio: string
  scenePx: { width: number; height: number }
  scaleSvgToMm: { x: number; y: number; avg: number }
  viewportOffsetMm: { x: number; y: number }
  scaleMmToPx: number
  sceneScale: number
}

export type SvgGeometry = DesignTemplateGeometryDebug & {
  svgRectToMm: (rect: GeometryRect) => GeometryRect
  svgPointToMm: (point: GeometryPoint) => GeometryPoint
  mmRectToScene: (rect: GeometryRect) => GeometryRect
  mmPointToScene: (point: GeometryPoint) => GeometryPoint
  svgFontSizeToMm: (fontSize: number) => number
  mmToPx: (value: number) => number
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function parsePreserveAspectRatio(value: string | undefined): PreserveAspectRatioConfig {
  const fallback: PreserveAspectRatioConfig = { mode: 'meet', alignX: 'mid', alignY: 'mid' }
  const raw = value?.trim()
  if (!raw) return fallback
  const tokens = raw.split(/\s+/).filter(Boolean)
  if (!tokens.length) return fallback

  const first = tokens[0]!.toLowerCase()
  if (first === 'none') return { mode: 'none', alignX: 'min', alignY: 'min' }

  const alignMatch = first.match(/^x(min|mid|max)y(min|mid|max)$/i)
  if (!alignMatch) return fallback

  const modeToken = tokens[1]?.toLowerCase()
  const mode: PreserveAspectRatioMode = modeToken === 'slice' ? 'slice' : 'meet'
  return {
    mode,
    alignX: alignMatch[1].toLowerCase() as PreserveAspectRatioAlignX,
    alignY: alignMatch[2].toLowerCase() as PreserveAspectRatioAlignY,
  }
}

function alignFactor(v: PreserveAspectRatioAlignX | PreserveAspectRatioAlignY): number {
  if (v === 'max') return 1
  if (v === 'mid') return 0.5
  return 0
}

export function mmToPx(value: number, sceneScale = 1): number {
  return round(value * MM_TO_PX * sceneScale)
}

export function createSvgGeometry(input: {
  pageMm: { width: number; height: number }
  viewBox: SvgViewBox
  preserveAspectRatio?: string
  sceneScale?: number
}): SvgGeometry {
  const { pageMm, viewBox } = input
  const sceneScale = input.sceneScale ?? 1
  const preserveAspectRatio = input.preserveAspectRatio?.trim() || 'xMidYMid meet'
  const par = parsePreserveAspectRatio(preserveAspectRatio)
  const baseScaleX = viewBox?.width ? pageMm.width / viewBox.width : PX_TO_MM
  const baseScaleY = viewBox?.height ? pageMm.height / viewBox.height : PX_TO_MM
  const uniformScale = Math.min(baseScaleX, baseScaleY)
  const coverScale = Math.max(baseScaleX, baseScaleY)
  const scaleX = !viewBox || par.mode === 'none'
    ? baseScaleX
    : (par.mode === 'slice' ? coverScale : uniformScale)
  const scaleY = !viewBox || par.mode === 'none'
    ? baseScaleY
    : (par.mode === 'slice' ? coverScale : uniformScale)
  const avg = (scaleX + scaleY) / 2
  const minX = viewBox?.minX ?? 0
  const minY = viewBox?.minY ?? 0
  const contentWidthMm = viewBox ? viewBox.width * scaleX : pageMm.width
  const contentHeightMm = viewBox ? viewBox.height * scaleY : pageMm.height
  const offsetX = viewBox ? round((pageMm.width - contentWidthMm) * alignFactor(par.alignX)) : 0
  const offsetY = viewBox ? round((pageMm.height - contentHeightMm) * alignFactor(par.alignY)) : 0

  const svgPointToMm = (point: GeometryPoint): GeometryPoint => ({
    x: round((point.x - minX) * scaleX + offsetX),
    y: round((point.y - minY) * scaleY + offsetY),
  })

  const svgRectToMm = (rect: GeometryRect): GeometryRect => ({
    ...svgPointToMm(rect),
    width: round(rect.width * scaleX),
    height: round(rect.height * scaleY),
  })

  const mmPointToScene = (point: GeometryPoint): GeometryPoint => ({
    x: mmToPx(point.x, sceneScale),
    y: mmToPx(point.y, sceneScale),
  })

  const mmRectToScene = (rect: GeometryRect): GeometryRect => ({
    ...mmPointToScene(rect),
    width: mmToPx(rect.width, sceneScale),
    height: mmToPx(rect.height, sceneScale),
  })

  return {
    pageMm: { width: pageMm.width, height: pageMm.height },
    viewBox,
    preserveAspectRatio,
    scenePx: {
      width: mmToPx(pageMm.width, sceneScale),
      height: mmToPx(pageMm.height, sceneScale),
    },
    scaleSvgToMm: { x: scaleX, y: scaleY, avg },
    viewportOffsetMm: { x: offsetX, y: offsetY },
    scaleMmToPx: MM_TO_PX * sceneScale,
    sceneScale,
    svgRectToMm,
    svgPointToMm,
    mmRectToScene,
    mmPointToScene,
    svgFontSizeToMm: (fontSize: number) => round(fontSize * avg),
    mmToPx: (value: number) => mmToPx(value, sceneScale),
  }
}
