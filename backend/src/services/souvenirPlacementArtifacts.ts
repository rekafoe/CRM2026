/**
 * Placement preview для оператора: плоский бланк, без 3D.
 * Production PDF по-прежнему генерируется editorProductionRenderService (artifactType=production_pdf).
 * Опциональный артефакт placement_preview можно сохранить в order_files отдельно.
 */

export const PLACEMENT_PREVIEW_ARTIFACT = 'placement_preview' as const
export const PRODUCTION_PDF_ARTIFACT = 'production_pdf' as const

export type SouvenirOrderArtifacts = {
  /** Плоский макет зоны печати — на станок. */
  production: typeof PRODUCTION_PDF_ARTIFACT
  /** Статичная схема «куда клеить» для Order Pool. */
  placement: typeof PLACEMENT_PREVIEW_ARTIFACT
}

export const SOUVENIR_ORDER_ARTIFACTS: SouvenirOrderArtifacts = {
  production: PRODUCTION_PDF_ARTIFACT,
  placement: PLACEMENT_PREVIEW_ARTIFACT,
}

/**
 * Метаданные placement в order_files.metadata (JSON).
 * Сам файл — PNG бланка; 3D/GLB в артефакт не кладём.
 */
export type PlacementPreviewMetadata = {
  editorKind: 'souvenir_3d'
  printAreaId?: string
  printAreaLabel?: string
  widthMm?: number
  heightMm?: number
  meshName?: string
}
