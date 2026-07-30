/**
 * Подбор sceneScale по extents объектов (порт эвристики фронта).
 * Нужен production PDF, когда designState.sceneScale не совпадает с координатами объектов
 * (симптом: макет в PDF уезжает вверх-влево).
 */

const MM_TO_PX = 96 / 25.4

type AnyObj = Record<string, unknown>

export type DesignStateScaleInput = {
  pageWidth?: number
  pageHeight?: number
  sceneScale?: number
  pages?: Array<{ fabricJSON?: { objects?: unknown[] } | null } | null>
}

function measurePageContentExtent(objects: unknown[]): { maxW: number; maxH: number } {
  let maxW = 0
  let maxH = 0
  for (const raw of objects) {
    const o = raw as AnyObj
    if (o.isBackground) continue
    const left = Number(o.left ?? 0)
    const top = Number(o.top ?? 0)
    let w = Math.abs(Number(o.width ?? 0) * Number(o.scaleX ?? 1))
    let h = Math.abs(Number(o.height ?? 0) * Number(o.scaleY ?? 1))
    if (o.isPhotoField) {
      const pW = Number(o.photoFieldFw)
      const pH = Number(o.photoFieldFh)
      if (Number.isFinite(pW) && pW > 0) w = pW
      if (Number.isFinite(pH) && pH > 0) h = pH
    }
    maxW = Math.max(maxW, left + w)
    maxH = Math.max(maxH, top + h)
  }
  return { maxW, maxH }
}

/** По размерам объектов в JSON подобрать sceneScale относительно pageWidth/pageHeight в мм. */
export function inferSceneScaleFromPageExtents(designState: DesignStateScaleInput | null | undefined): number | null {
  const pageWmm = Number(designState?.pageWidth)
  const pageHmm = Number(designState?.pageHeight)
  if (!Number.isFinite(pageWmm) || !Number.isFinite(pageHmm) || pageWmm <= 0 || pageHmm <= 0) {
    return null
  }
  const basePxW = pageWmm * MM_TO_PX
  const basePxH = pageHmm * MM_TO_PX

  let bgScale: number | null = null
  let maxW = 0
  let maxH = 0

  for (const page of designState?.pages ?? []) {
    const objects = page?.fabricJSON?.objects
    if (!Array.isArray(objects)) continue
    for (const raw of objects) {
      const o = raw as AnyObj
      if (o.isBackground) {
        const fromBg = Number(o.backgroundSceneScale)
        if (Number.isFinite(fromBg) && fromBg > 0) bgScale = fromBg
      }
    }
    const extent = measurePageContentExtent(objects)
    maxW = Math.max(maxW, extent.maxW)
    maxH = Math.max(maxH, extent.maxH)
  }

  if (maxW < 1 || maxH < 1) return bgScale

  for (const scale of [6, 3, 2, 1] as const) {
    const expectedW = basePxW * scale
    const expectedH = basePxH * scale
    const matchW = maxW >= expectedW * 0.82 && maxW <= expectedW * 1.15
    const matchH = maxH >= expectedH * 0.82 && maxH <= expectedH * 1.15
    if (matchW && matchH) return scale
  }

  if (maxW <= basePxW * 1.12 && maxH <= basePxH * 1.12) return 1
  if (maxW <= basePxW * 3.15 && maxH <= basePxH * 3.15 && maxW > basePxW * 1.4) return 3
  if (maxW <= basePxW * 6.3 && maxH <= basePxH * 6.3 && maxW > basePxW * 3.4) return 6

  return bgScale
}

export type ProductionSceneScaleDiagnostics = {
  explicit: number | null
  inferred: number | null
  resolved: number
  mismatched: boolean
  pageWidthMm: number
  pageHeightMm: number
  textSamples: Array<{
    id?: string
    left: number
    top: number
    width: number
    originX: string
    textAlign: string
    centerXAtExplicit: number
    centerXAtResolved: number
  }>
}

function collectTextSamples(
  designState: DesignStateScaleInput,
  explicitScale: number,
  resolvedScale: number,
): ProductionSceneScaleDiagnostics['textSamples'] {
  const pageWmm = Number(designState.pageWidth) || 0
  const samples: ProductionSceneScaleDiagnostics['textSamples'] = []
  for (const page of designState.pages ?? []) {
    const objects = page?.fabricJSON?.objects
    if (!Array.isArray(objects)) continue
    for (const raw of objects) {
      const o = raw as AnyObj
      const type = String(o.type ?? '').toLowerCase()
      if (type !== 'textbox' && type !== 'i-text' && type !== 'itext' && type !== 'text') continue
      const left = Number(o.left ?? 0)
      const top = Number(o.top ?? 0)
      const width = Number(o.width ?? 0)
      const originX = String(o.originX ?? 'left')
      const textAlign = String(o.textAlign ?? 'left')
      const sceneCenterExplicit = (pageWmm * MM_TO_PX * explicitScale) / 2
      const sceneCenterResolved = (pageWmm * MM_TO_PX * resolvedScale) / 2
      samples.push({
        id: typeof o.id === 'string' ? o.id : undefined,
        left,
        top,
        width,
        originX,
        textAlign,
        centerXAtExplicit: sceneCenterExplicit,
        centerXAtResolved: sceneCenterResolved,
      })
      if (samples.length >= 5) return samples
    }
  }
  return samples
}

/**
 * Scale для production: явный из designState, но при конфликте с extents объектов —
 * берём inferred (иначе макет уезжает в левый верхний угол).
 */
export function resolveProductionSceneScale(designState: DesignStateScaleInput | null | undefined): {
  scale: number
  diagnostics: ProductionSceneScaleDiagnostics
} {
  const explicitRaw = Number(designState?.sceneScale)
  const explicit = Number.isFinite(explicitRaw) && explicitRaw > 0 ? explicitRaw : null
  const inferred = inferSceneScaleFromPageExtents(designState)
  let resolved = 1
  let mismatched = false
  if (inferred != null && explicit != null && Math.abs(inferred - explicit) > 0.01) {
    mismatched = true
    resolved = inferred
  } else if (explicit != null) {
    resolved = explicit
  } else if (inferred != null) {
    resolved = inferred
  }

  const pageWidthMm = Number(designState?.pageWidth) || 0
  const pageHeightMm = Number(designState?.pageHeight) || 0
  const diagnostics: ProductionSceneScaleDiagnostics = {
    explicit,
    inferred,
    resolved,
    mismatched,
    pageWidthMm,
    pageHeightMm,
    textSamples: designState
      ? collectTextSamples(designState, explicit ?? resolved, resolved)
      : [],
  }
  return { scale: resolved, diagnostics }
}
