import { Point, Rect, type Control, type FabricObject, type Group, type TMat2D } from 'fabric';
import { measureFilledPhotoFieldFrameSize } from './photoFieldGeometry';

/** Визуальное выделение текстовых блоков на холсте (рамка + угловые маркеры). */
export const DESIGN_EDITOR_TEXT_CHROME = {
  borderColor: '#2563eb',
  cornerColor: '#2563eb',
  cornerStrokeColor: '#ffffff',
  cornerSize: 11,
  cornerStyle: 'circle' as const,
  transparentCorners: false,
  borderScaleFactor: 2.5,
  padding: 10,
  hasBorders: true,
  hasControls: true,
  touchCornerSize: 20,
};

/** Базовые размеры рамки/маркеров в клиентском basic-режиме (до компенсации CSS fit-zoom). */
const CLIENT_BASIC_TEXT_CHROME_BASE = {
  cornerSize: 16,
  touchCornerSize: 36,
  borderScaleFactor: 3.25,
  padding: 12,
};

/** Целевой размер маркеров на экране (px), до CSS fit-zoom и zoom холста Fabric. */
const SCREEN_CORNER_PX = 16;
const SCREEN_TOUCH_CORNER_PX = 36;
const SCREEN_BORDER_STROKE_PX = 2.75;
const SCREEN_PHOTO_BORDER_STROKE_PX = SCREEN_BORDER_STROKE_PX * 0.85;

function compensateControlSize(
  base: number,
  displayScale: number,
  canvasZoom = 1,
): number {
  const fit = Math.max(0.22, Math.min(1, displayScale));
  const zoom = Math.max(0.1, Math.min(10, canvasZoom));
  return Math.round(base / (fit * zoom));
}

function compensateBorderStroke(base: number, displayScale: number, canvasZoom = 1): number {
  const fit = Math.max(0.22, Math.min(1, displayScale));
  const zoom = Math.max(0.1, Math.min(10, canvasZoom));
  return base / (fit * zoom);
}

/** displayScale — CSS fit-zoom; canvasZoom — Fabric canvas.setZoom (кнопки +/-). */
export function buildBasicTextSelectionChrome(displayScale = 1, canvasZoom = 1) {
  return {
    ...DESIGN_EDITOR_TEXT_CHROME,
    cornerSize: compensateControlSize(SCREEN_CORNER_PX, displayScale, canvasZoom),
    touchCornerSize: compensateControlSize(SCREEN_TOUCH_CORNER_PX, displayScale, canvasZoom),
    borderScaleFactor: compensateBorderStroke(SCREEN_BORDER_STROKE_PX, displayScale, canvasZoom),
    padding: compensateControlSize(CLIENT_BASIC_TEXT_CHROME_BASE.padding, displayScale, canvasZoom),
  };
}

/** Рамка выделения фото-поля — без отступа между синей рамкой и пунктиром ячейки. */
export function buildBasicPhotoFieldSelectionChrome(displayScale = 1, canvasZoom = 1) {
  return {
    ...buildBasicTextSelectionChrome(displayScale, canvasZoom),
    padding: 0,
    borderScaleFactor: compensateBorderStroke(SCREEN_PHOTO_BORDER_STROKE_PX, displayScale, canvasZoom),
  };
}

/** Размер рамки для угловых маркеров: с учётом активного group.scale во время drag. */
function readPhotoFieldFrameDimForControls(field: FabricObject): Point {
  if (field.type === 'group') {
    const measured = measureFilledPhotoFieldFrameSize(field as Group);
    if (measured) return new Point(measured.fw, measured.fh);
  }
  const o = field as unknown as Record<string, unknown>;
  const fw = Math.max(1, Number(o.photoFieldFw ?? field.width ?? 1));
  const fh = Math.max(1, Number(o.photoFieldFh ?? field.height ?? 1));
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  return new Point(fw * sx, fh * sy);
}

/** Углы ресайза по photoFieldFw×Fh, а не по union bbox cover-картинки внутри группы. */
function createFilledPhotoFieldControls(): Record<string, Control> {
  const template = new Rect({ width: 1, height: 1 });
  const controls = { ...(template.controls as Record<string, Control>) };
  for (const control of Object.values(controls)) {
    const baseHandler = control.positionHandler.bind(control);
    control.positionHandler = (
      dim: Point,
      matrix: TMat2D,
      fabricObject: FabricObject,
      currentControl: Control,
    ) => {
      const o = fabricObject as unknown as Record<string, unknown>;
      const useFrame =
        fabricObject.type === 'group'
        && o.isPhotoField === true
        && o.photoFieldFilled === true;
      const effectiveDim = useFrame ? readPhotoFieldFrameDimForControls(fabricObject) : dim;
      return baseHandler(effectiveDim, matrix, fabricObject, currentControl);
    };
  }
  return controls;
}

function syncFilledPhotoFieldGroupDimensions(group: Group): void {
  const o = group as unknown as Record<string, unknown>;
  if (o.photoFieldFilled !== true) return;
  const fw = Math.max(32, Math.round(Number(o.photoFieldFw ?? group.width ?? 0)));
  const fh = Math.max(32, Math.round(Number(o.photoFieldFh ?? group.height ?? 0)));
  if (fw < 32 || fh < 32) return;
  const sx = Math.abs(Number(group.scaleX ?? 1));
  const sy = Math.abs(Number(group.scaleY ?? 1));
  /** Не сбрасывать scale во время углового ресайза (selection:updated срабатывает на каждый кадр). */
  if (sx > 1.004 || sy > 1.004) return;
  if (
    Math.abs((group.width ?? 0) - fw) <= 1
    && Math.abs((group.height ?? 0) - fh) <= 1
    && sx < 1.004
    && sy < 1.004
  ) {
    return;
  }
  group.set({ width: fw, height: fh, scaleX: 1, scaleY: 1 });
}

/** Единые маркеры/обводка выделения для клиентского фото-поля (переопределяет устаревшие значения из JSON). */
export function applyPhotoFieldSelectionChrome(
  obj: FabricObject,
  displayScale = 1,
  canvasZoom = 1,
): void {
  const o = obj as unknown as Record<string, unknown>;
  if (o.isPhotoField !== true) return;

  const chrome = buildBasicPhotoFieldSelectionChrome(displayScale, canvasZoom);
  if (o.photoFieldFilled === true && obj.type === 'group') {
    syncFilledPhotoFieldGroupDimensions(obj as Group);
    if (o.photoFieldFrameControls !== true) {
      obj.controls = createFilledPhotoFieldControls();
      o.photoFieldFrameControls = true;
    }
  }

  obj.set({
    cornerColor: chrome.cornerColor ?? DESIGN_EDITOR_TEXT_CHROME.cornerColor,
    cornerStrokeColor: chrome.cornerStrokeColor ?? DESIGN_EDITOR_TEXT_CHROME.cornerStrokeColor,
    cornerStyle: chrome.cornerStyle ?? DESIGN_EDITOR_TEXT_CHROME.cornerStyle,
    transparentCorners: chrome.transparentCorners ?? DESIGN_EDITOR_TEXT_CHROME.transparentCorners,
    cornerSize: chrome.cornerSize,
    touchCornerSize: chrome.touchCornerSize,
    borderScaleFactor: chrome.borderScaleFactor,
    padding: chrome.padding,
    borderColor: DESIGN_EDITOR_TEXT_CHROME.borderColor,
    hasBorders: true,
  });
  obj.setCoords();
}

export function isTextLikeFabricObject(obj: FabricObject): boolean {
  const type = obj.type;
  return type === 'i-text' || type === 'textbox';
}

export function applyTextSelectionChrome(
  obj: FabricObject,
  mode: 'basic' | 'advanced',
  displayScale = 1,
  canvasZoom = 1,
): void {
  if (!isTextLikeFabricObject(obj)) return;

  if (mode === 'basic') {
    obj.set({
      ...buildBasicTextSelectionChrome(displayScale, canvasZoom),
      selectable: true,
      evented: true,
      editable: false,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: true,
    });
    return;
  }

  obj.set({
    ...DESIGN_EDITOR_TEXT_CHROME,
    lockScalingX: false,
    lockScalingY: false,
    lockRotation: false,
  });
}
