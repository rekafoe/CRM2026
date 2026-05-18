import { Canvas, Shadow } from 'fabric';
import type { FabricObject } from 'fabric';
import { pickEmptyPhotoFieldFrameRect } from './photoFieldGeometry';

interface HighlightSnapshot {
  fill: unknown;
  shadow: unknown;
  stroke: unknown;
  strokeWidth: unknown;
}

export interface PhotoFieldDropHighlightState {
  field: FabricObject | null;
  fieldSnapshot: HighlightSnapshot | null;
  surface: FabricObject | null;
  surfaceSnapshot: HighlightSnapshot | null;
}

export function createPhotoFieldDropHighlightState(): PhotoFieldDropHighlightState {
  return {
    field: null,
    fieldSnapshot: null,
    surface: null,
    surfaceSnapshot: null,
  };
}

function snapshotObject(obj: FabricObject): HighlightSnapshot {
  return {
    fill: obj.fill,
    shadow: obj.shadow,
    stroke: obj.stroke,
    strokeWidth: obj.strokeWidth,
  };
}

function restoreObject(obj: FabricObject, snapshot: HighlightSnapshot): void {
  obj.set({
    fill: snapshot.fill,
    shadow: snapshot.shadow,
    stroke: snapshot.stroke,
    strokeWidth: snapshot.strokeWidth,
  } as Parameters<typeof obj.set>[0]);
}

export function clearPhotoFieldDropHighlight(
  canvas: Canvas,
  state: PhotoFieldDropHighlightState,
): void {
  if (state.surface && state.surfaceSnapshot) restoreObject(state.surface, state.surfaceSnapshot);
  if (state.field && state.fieldSnapshot) restoreObject(state.field, state.fieldSnapshot);
  state.field = null;
  state.fieldSnapshot = null;
  state.surface = null;
  state.surfaceSnapshot = null;
  canvas.requestRenderAll();
}

export function updatePhotoFieldDropHighlight(
  canvas: Canvas,
  state: PhotoFieldDropHighlightState,
  field: FabricObject | null,
): void {
  if (state.field === field) return;
  clearPhotoFieldDropHighlight(canvas, state);
  if (!field) return;

  const surface = pickEmptyPhotoFieldFrameRect(field);
  state.field = field;
  state.fieldSnapshot = snapshotObject(field);
  state.surface = surface;
  state.surfaceSnapshot = surface ? snapshotObject(surface) : null;

  field.set({
    shadow: new Shadow({
      color: 'rgba(37, 99, 235, 0.26)',
      blur: 24,
      offsetX: 0,
      offsetY: 0,
    }),
  } as Parameters<typeof field.set>[0]);

  if (surface) {
    surface.set({
      fill: 'rgba(37, 99, 235, 0.06)',
      stroke: '#2563eb',
      strokeWidth: Math.max(2, Number(surface.strokeWidth ?? 1)),
    } as Parameters<typeof surface.set>[0]);
  }

  canvas.requestRenderAll();
}
