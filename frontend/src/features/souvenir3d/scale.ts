/**
 * Масштаб сувенирного превью: мм — источник истины.
 * Экран Fabric: MM_TO_PX * sceneScale (как в designEditor).
 * 3D texture: aspect зоны + preview DPI; production PDF — 300 DPI отдельно.
 */

import { MM_TO_PX } from '../../pages/admin/designEditor/constants';

/** Эквивалент DPI для WebGL-превью (не для печати). */
export const SOUVENIR_PREVIEW_DPI = 150;

/** Production raster DPI (как editor production). */
export const SOUVENIR_PRODUCTION_DPI = 300;

/**
 * Калибровка 3D-превью майки: ширина передней панели Body_Front ≈ взрослый M/L.
 * По ней mm зоны печати переводятся в единицы сцены (модель сама без реального масштаба).
 */
export const TSHIRT_FRONT_PANEL_WIDTH_MM = 500;

/** Размер зоны печати в единицах сцены по физическим мм и ширине панели mesh. */
export function printAreaSceneSize(
  widthMm: number,
  heightMm: number,
  panelWidthScene: number,
  panelHeightScene: number,
  panelWidthMm = TSHIRT_FRONT_PANEL_WIDTH_MM,
): { width: number; height: number; mmPerScene: number } {
  const safePanelW = Math.max(panelWidthScene, 0.001);
  const mmPerScene = panelWidthMm / safePanelW;
  let width = Math.max(1, widthMm) / mmPerScene;
  let height = Math.max(1, heightMm) / mmPerScene;
  const maxW = safePanelW * 0.92;
  const maxH = Math.max(panelHeightScene, 0.001) * 0.82;
  const fit = Math.min(1, maxW / width, maxH / height);
  width *= fit;
  height *= fit;
  return { width, height, mmPerScene };
}

export function printAreaAspect(widthMm: number, heightMm: number): number {
  if (!(heightMm > 0)) return 1;
  return widthMm / heightMm;
}

/** Пиксели Fabric UI для зоны печати. */
export function printAreaFabricPx(
  widthMm: number,
  heightMm: number,
  sceneScale = 1,
): { widthPx: number; heightPx: number; pxPerMm: number } {
  const scale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
  const pxPerMm = MM_TO_PX * scale;
  return {
    widthPx: Math.round(widthMm * pxPerMm),
    heightPx: Math.round(heightMm * pxPerMm),
    pxPerMm,
  };
}

/** Размер CanvasTexture для 3D-превью (aspect = мм). */
export function printAreaPreviewTexturePx(
  widthMm: number,
  heightMm: number,
  dpi = SOUVENIR_PREVIEW_DPI,
): { widthPx: number; heightPx: number } {
  const inch = 25.4;
  return {
    widthPx: Math.max(64, Math.round((widthMm / inch) * dpi)),
    heightPx: Math.max(64, Math.round((heightMm / inch) * dpi)),
  };
}

export function assertAspectMatch(
  widthMm: number,
  heightMm: number,
  uvAspect: number,
  tolerance = 0.05,
): boolean {
  const target = printAreaAspect(widthMm, heightMm);
  if (!(target > 0) || !(uvAspect > 0)) return false;
  return Math.abs(target - uvAspect) / target <= tolerance;
}
