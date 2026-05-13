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

export type DesignTemplateGeometryDebug = {
  pageMm: { width: number; height: number }
  viewBox: SvgViewBox
  scenePx: { width: number; height: number }
  scaleSvgToMm: { x: number; y: number; avg: number }
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

export function mmToPx(value: number, sceneScale = 1): number {
  return round(value * MM_TO_PX * sceneScale)
}

export function createSvgGeometry(input: {
  pageMm: { width: number; height: number }
  viewBox: SvgViewBox
  sceneScale?: number
}): SvgGeometry {
  const { pageMm, viewBox } = input
  const sceneScale = input.sceneScale ?? 1
  const scaleX = viewBox?.width ? pageMm.width / viewBox.width : PX_TO_MM
  const scaleY = viewBox?.height ? pageMm.height / viewBox.height : PX_TO_MM
  const avg = (scaleX + scaleY) / 2
  const minX = viewBox?.minX ?? 0
  const minY = viewBox?.minY ?? 0

  const svgPointToMm = (point: GeometryPoint): GeometryPoint => ({
    x: round((point.x - minX) * scaleX),
    y: round((point.y - minY) * scaleY),
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
    scenePx: {
      width: mmToPx(pageMm.width, sceneScale),
      height: mmToPx(pageMm.height, sceneScale),
    },
    scaleSvgToMm: { x: scaleX, y: scaleY, avg },
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
