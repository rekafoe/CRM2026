import type { Canvas, FabricObject } from 'fabric';

type AnyObj = Record<string, unknown>;

function asAny(value: unknown): AnyObj {
  return value as AnyObj;
}

export function isIosSafariCanvasSafeMode(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua)
    && /(iPhone|iPad|iPod)/i.test(ua)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
}

export function getIosSafariCanvasOptions(): { enableRetinaScaling?: boolean } {
  return isIosSafariCanvasSafeMode() ? { enableRetinaScaling: false } : {};
}

export function markIosSafariCanvasSafeMode(canvas: Canvas): void {
  if (!isIosSafariCanvasSafeMode()) return;
  asAny(canvas).enableRetinaScaling = false;
}

export function hardenFabricObjectForIosSafari(obj: FabricObject): void {
  if (!isIosSafariCanvasSafeMode()) return;
  hardenFabricObjectCache(obj);
}

export function hardenCanvasObjectsForIosSafari(canvas: Canvas): void {
  if (!isIosSafariCanvasSafeMode()) return;
  markIosSafariCanvasSafeMode(canvas);
  canvas.getObjects().forEach(hardenFabricObjectCache);
}

function hardenFabricObjectCache(obj: FabricObject): void {
  const target = asAny(obj);
  target.objectCaching = false;
  target.noScaleCache = true;
  target.dirty = true;

  const group = obj as FabricObject & { getObjects?: () => FabricObject[] };
  if (typeof group.getObjects === 'function') {
    group.getObjects().forEach(hardenFabricObjectCache);
  }
}
