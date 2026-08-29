/**
 * Координатное пространство Fabric для сувенирного редактора.
 *
 * css_px — как designEditor / production: 1mm = MM_TO_PX CSS-пикселей при sceneScale=1.
 * mm_px — баг первых сувенирных draft: холст widthMm×heightMm (1px = 1mm).
 */

/** Совпадает с designEditor/constants MM_TO_PX (без импорта JSX-модуля). */
const MM_TO_PX = 96 / 25.4;
export type SouvenirFabricCoordSpace = 'css_px' | 'mm_px';

const GEOMETRY_KEYS = [
  'left',
  'top',
  'width',
  'height',
  'fontSize',
  'strokeWidth',
  'rx',
  'ry',
  'radius',
  'minWidth',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function resolveSouvenirFabricCoordSpace(
  designState: { editorKind?: string; fabricCoordSpace?: string } | null | undefined,
): SouvenirFabricCoordSpace {
  if (designState?.fabricCoordSpace === 'css_px') return 'css_px';
  if (designState?.fabricCoordSpace === 'mm_px') return 'mm_px';
  // Legacy souvenir drafts писали 1px=1mm без маркера.
  if (designState?.editorKind === 'souvenir_3d') return 'mm_px';
  return 'css_px';
}

/** sceneScale, при котором MM_TO_PX*scale даёт 1 CSS-px на мм (холст = widthMm×heightMm). */
export function souvenirMmAsPxSceneScale(): number {
  return 1 / MM_TO_PX;
}

function scaleFabricObjectInPlace(object: Record<string, unknown>, factor: number): void {
  for (const key of GEOMETRY_KEYS) {
    const value = Number(object[key]);
    if (Number.isFinite(value)) object[key] = value * factor;
  }

  const clipPath = asRecord(object.clipPath);
  if (clipPath) scaleFabricObjectInPlace(clipPath, factor);

  const children = Array.isArray(object.objects)
    ? object.objects
    : Array.isArray(object._objects)
      ? object._objects
      : null;
  if (!children) return;
  for (const child of children) {
    const record = asRecord(child);
    if (record) scaleFabricObjectInPlace(record, factor);
  }
}

/**
 * Переводит legacy Fabric JSON (1px=1mm) в css_px пространство production/designEditor.
 */
export function scaleSouvenirFabricJsonToCssPx(
  fabricJSON: Record<string, unknown>,
  widthMm: number,
  heightMm: number,
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(fabricJSON)) as Record<string, unknown>;
  const objects = Array.isArray(cloned.objects) ? cloned.objects : [];
  for (const raw of objects) {
    const object = asRecord(raw);
    if (object) scaleFabricObjectInPlace(object, MM_TO_PX);
  }
  cloned.width = Math.max(1, Math.round(widthMm * MM_TO_PX));
  cloned.height = Math.max(1, Math.round(heightMm * MM_TO_PX));
  return cloned;
}

export function normalizeSouvenirFabricJsonToCssPx(
  fabricJSON: Record<string, unknown>,
  widthMm: number,
  heightMm: number,
  coordSpace: SouvenirFabricCoordSpace,
): Record<string, unknown> {
  if (coordSpace !== 'mm_px') {
    return {
      ...fabricJSON,
      width: Math.max(1, Math.round(widthMm * MM_TO_PX)),
      height: Math.max(1, Math.round(heightMm * MM_TO_PX)),
    };
  }
  return scaleSouvenirFabricJsonToCssPx(fabricJSON, widthMm, heightMm);
}
