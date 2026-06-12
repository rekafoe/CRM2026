import type { Canvas } from 'fabric';
import { normalizeFilledPhotoFieldsOnCanvas } from '../photoFieldFit';
import { prepareTextObjectsOnCanvas } from '../textStyleRuns';
import { syncImportedPhotoFieldsOnCanvas, upgradeEmptyPhotoFieldsOnCanvas } from './photoField';

/**
 * Единая точка нормализации полей после loadFromJSON:
 * текст (импорт) → геометрия шаблонных photo_* → chrome пустых полей → layout заполненных.
 */
export async function normalizeDesignFieldsOnCanvas(
  canvas: Canvas,
  _pageW: number,
  _pageH: number,
): Promise<void> {
  prepareTextObjectsOnCanvas(canvas.getObjects());
  syncImportedPhotoFieldsOnCanvas(canvas);
  upgradeEmptyPhotoFieldsOnCanvas(canvas);
  await normalizeFilledPhotoFieldsOnCanvas(canvas);
}
