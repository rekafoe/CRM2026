/**
 * Сувенирный Fabric и production PDF живут в одном пространстве:
 * 1 мм = 96/25.4 px, sceneScale = 1.
 *
 * Ранние макеты рисовали холст 1 px = 1 мм и не записывали souvenirPxPerMm.
 * Их объекты нужно домножить на этот коэффициент перед печатью и при открытии.
 */

const MM_TO_PX = 96 / 25.4

/** Пикселей Fabric на миллиметр зоны печати. Совпадает с design-editor MM_TO_PX. */
export const SOUVENIR_CANVAS_PX_PER_MM = MM_TO_PX

type FabricNode = Record<string, unknown>

function asRecord(value: unknown): FabricNode | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as FabricNode
    : null
}

function scaleRootPlacement(node: FabricNode, factor: number): void {
  const left = Number(node.left)
  const top = Number(node.top)
  if (Number.isFinite(left)) node.left = left * factor
  if (Number.isFinite(top)) node.top = top * factor
  const scaleX = Number(node.scaleX)
  const scaleY = Number(node.scaleY)
  node.scaleX = (Number.isFinite(scaleX) && scaleX !== 0 ? scaleX : 1) * factor
  node.scaleY = (Number.isFinite(scaleY) && scaleY !== 0 ? scaleY : 1) * factor
}

/**
 * Масштабирует только корневые объекты: left/top и scaleX/scaleY.
 * width/height и fontSize не трогаем — их визуальный размер уже умножается на scale.
 * Вложенные objects группы остаются в локальных координатах группы.
 */
export function scaleSouvenirFabricPlacement(fabricJSON: unknown, factor: number): Record<string, unknown> {
  const root = asRecord(fabricJSON)
  if (!root) return { objects: [] }
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-9) {
    return JSON.parse(JSON.stringify(root)) as Record<string, unknown>
  }
  const clone = JSON.parse(JSON.stringify(root)) as FabricNode
  const objects = Array.isArray(clone.objects) ? clone.objects : []
  for (const raw of objects) {
    const node = asRecord(raw)
    if (node) scaleRootPlacement(node, factor)
  }
  return clone
}

type ScaleInput = {
  editorKind?: unknown
  souvenirPxPerMm?: unknown
  pageWidth?: unknown
  pageHeight?: unknown
  pages?: unknown
}

function pageSideMm(designState: ScaleInput): number {
  let side = Math.max(Number(designState.pageWidth) || 0, Number(designState.pageHeight) || 0)
  if (!Array.isArray(designState.pages)) return side
  for (const page of designState.pages) {
    if (!page || typeof page !== 'object') continue
    const row = page as FabricNode
    side = Math.max(side, Number(row.widthMm) || 0, Number(row.heightMm) || 0)
  }
  return side
}

function placementExtent(designState: ScaleInput): number {
  if (!Array.isArray(designState.pages)) return 0
  let maxExtent = 0
  for (const page of designState.pages) {
    if (!page || typeof page !== 'object') continue
    const fabric = asRecord((page as FabricNode).fabricJSON)
    const objects = Array.isArray(fabric?.objects) ? fabric.objects : []
    for (const raw of objects) {
      const node = asRecord(raw)
      if (!node || node.isBackground === true) continue
      const left = Number(node.left) || 0
      const top = Number(node.top) || 0
      const width = Math.abs(Number(node.width) || 0) * Math.abs(Number(node.scaleX) || 1)
      const height = Math.abs(Number(node.height) || 0) * Math.abs(Number(node.scaleY) || 1)
      maxExtent = Math.max(maxExtent, left + width, top + height)
    }
  }
  return maxExtent
}

/**
 * Объекты старого редактора умещались в холст «1 px = 1 мм».
 * Макет, уже нарисованный в 96 DPI, заметно шире стороны зоны и его не трогаем.
 */
function contentLooksLikeMillimetrePixels(designState: ScaleInput): boolean {
  const extent = placementExtent(designState)
  if (extent < 1) return false
  const sideMm = pageSideMm(designState)
  if (!(sideMm > 0)) return extent < 800
  return extent <= sideMm * 1.35
}

/** Во сколько раз домножить объекты, чтобы попасть в SOUVENIR_CANVAS_PX_PER_MM. 1 — уже там. */
export function souvenirPlacementScaleFactor(designState: ScaleInput | null | undefined): number {
  if (!designState || designState.editorKind !== 'souvenir_3d') return 1
  const stored = Number(designState.souvenirPxPerMm)
  if (Number.isFinite(stored) && stored > 0) {
    const factor = SOUVENIR_CANVAS_PX_PER_MM / stored
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.01) return 1
    return factor
  }
  return contentLooksLikeMillimetrePixels(designState) ? SOUVENIR_CANVAS_PX_PER_MM : 1
}
