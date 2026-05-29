/** Оценка bbox текста в Fabric JSON (preflight на сервере). */

const MM_TO_PX = 96 / 25.4
const CHAR_WIDTH_FACTOR = 0.52

type FabricJsonObject = Record<string, unknown>

export type TextSceneBox = {
  left: number
  top: number
  width: number
  height: number
}

export type DesignPageBoundsPx = {
  pageWidthPx: number
  pageHeightPx: number
  safeZonePx: number
}

function isTextObject(obj: FabricJsonObject): boolean {
  const type = String(obj.type ?? '').toLowerCase()
  return type === 'i-text' || type === 'itext' || type === 'textbox' || type === 'text'
}

export function designPageBoundsFromDesignState(state: FabricJsonObject): DesignPageBoundsPx | null {
  const pageWidthMm = Number(state.pageWidth)
  const pageHeightMm = Number(state.pageHeight)
  if (!Number.isFinite(pageWidthMm) || !Number.isFinite(pageHeightMm) || pageWidthMm <= 0 || pageHeightMm <= 0) {
    return null
  }
  const sceneScale = Number(state.sceneScale) || 1
  const prepress = state.prepress && typeof state.prepress === 'object'
    ? (state.prepress as FabricJsonObject)
    : {}
  const safeZoneMm = Number(prepress.safeZoneMm ?? 5) || 5
  const pxPerMm = MM_TO_PX * sceneScale
  return {
    pageWidthPx: Math.round(pageWidthMm * pxPerMm),
    pageHeightPx: Math.round(pageHeightMm * pxPerMm),
    safeZonePx: safeZoneMm * pxPerMm,
  }
}

export function estimateTextSceneBox(obj: FabricJsonObject): TextSceneBox | null {
  if (!isTextObject(obj)) return null

  const left = Number(obj.left) || 0
  const top = Number(obj.top) || 0
  const scaleX = Math.abs(Number(obj.scaleX) || 1)
  const scaleY = Math.abs(Number(obj.scaleY) || 1)
  const fontSize = Math.max(6, Number(obj.fontSize) || 24)
  const lineHeight = Math.max(1, Number(obj.lineHeight) || 1.16)
  const text = String(obj.text ?? '')
  const lines = text.length > 0 ? text.split('\n') : ['']

  let width: number
  let lineCount: number
  const typeLower = String(obj.type ?? '').toLowerCase()

  if (typeLower === 'textbox' && Number(obj.width) > 0) {
    width = Math.max(1, Number(obj.width) * scaleX)
    const charsPerLine = Math.max(1, width / (fontSize * CHAR_WIDTH_FACTOR))
    lineCount = lines.reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)),
      0,
    )
  } else {
    const maxLineLen = Math.max(1, ...lines.map((line) => line.length))
    width = Math.max(1, maxLineLen * fontSize * CHAR_WIDTH_FACTOR * scaleX)
    lineCount = Math.max(1, lines.length)
  }

  const height = Math.max(fontSize, lineCount * fontSize * lineHeight * scaleY)
  return { left, top, width, height }
}

export function checkTextSceneBoxOverflow(
  box: TextSceneBox,
  bounds: DesignPageBoundsPx,
): { outsidePage: boolean; outsideSafeZone: boolean } {
  const { pageWidthPx, pageHeightPx, safeZonePx } = bounds
  const right = box.left + box.width
  const bottom = box.top + box.height
  const tol = 2
  const safe = Math.max(0, safeZonePx)

  return {
    outsidePage:
      box.left < -tol
      || box.top < -tol
      || right > pageWidthPx + tol
      || bottom > pageHeightPx + tol,
    outsideSafeZone:
      box.left < safe - tol
      || box.top < safe - tol
      || right > pageWidthPx - safe + tol
      || bottom > pageHeightPx - safe + tol,
  }
}
