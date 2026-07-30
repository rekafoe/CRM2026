/**
 * Пустое фото-поле: группа с однородным фоном и иконкой камеры (как в legacy chrome).
 * Один Fabric Rect на сцене ломал ресайз в Fabric 7 — группа с noop layout и relayoutEmptyPhotoFieldChrome.
 */
import { Circle, Group, Point, Rect, Text, type Canvas, type FabricObject } from 'fabric';
import { createPhotoFieldStaticLayoutManager, ensurePhotoFieldStaticLayout } from './photoFieldFit';
import { copyImportStackMetadata } from './designFields/importStackOrder';
import {
  resolvePhotoFieldFrameSceneTL,
  relayoutEmptyPhotoFieldChrome,
  resolvePhotoFieldFrameSize,
  syncEmptyPhotoFieldSceneAnchor,
} from './photoFieldGeometry';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

export const EMPTY_PHOTO_FIELD_FILL = '#cbd5e1';
export const EMPTY_PHOTO_FIELD_STROKE = '#2563eb';
export const EMPTY_PHOTO_FIELD_STROKE_WIDTH = 2;
export const EMPTY_PHOTO_FIELD_STROKE_DASH: [number, number] = [6, 4];
const EMPTY_PHOTO_BADGE_FILL = '#dbeafe';
const EMPTY_PHOTO_ICON_FILL = '#1d4ed8';
const EMPTY_PHOTO_LABEL_FILL = '#1e40af';

export type EmptyPhotoFieldChromeMetrics = {
  badgeR: number;
  badgeCx: number;
  badgeCy: number;
  camBodyW: number;
  camBodyH: number;
  showBadge: boolean;
  showPhotoLabel: boolean;
  strokeWidth: number;
  labelFontSize: number;
};

/**
 * Доля minSide — не 0.38: на print-DPI (300) «маленькое» поле всё ещё сотни px,
 * и старый ratio давал огромный кружок + PHOTO, обрезанный selection-рамкой.
 */
const EMPTY_PHOTO_BADGE_SIZE_RATIO = 0.16;
const EMPTY_PHOTO_BADGE_MIN_R = 7;
const EMPTY_PHOTO_BADGE_MAX_R = 42;
const EMPTY_PHOTO_ICON_LENS_RATIO = 0.18;

/** Размер иконки камеры в пустом фото-поле (общий для create и relayout, мобилка и десктоп). */
export function resolveEmptyPhotoFieldChromeMetrics(
  frameW: number,
  frameH: number,
): EmptyPhotoFieldChromeMetrics {
  const minSide = Math.min(frameW, frameH);
  const maxByFrame = Math.max(
    EMPTY_PHOTO_BADGE_MIN_R,
    Math.floor(Math.min(frameW, frameH) * 0.22) - 2,
  );
  const badgeR = Math.max(
    EMPTY_PHOTO_BADGE_MIN_R,
    Math.min(
      EMPTY_PHOTO_BADGE_MAX_R,
      maxByFrame,
      Math.round(minSide * EMPTY_PHOTO_BADGE_SIZE_RATIO),
    ),
  );
  const showBadge = minSide >= 36;
  const labelFontSize = Math.max(10, Math.min(22, Math.round(badgeR * 0.55)));
  // Подпись PHOTO на print-DPI сувенирки почти всегда выглядит громоздко и режется
  // selection-handle — достаточно иконки камеры.
  const showPhotoLabel = false;
  const badgeCy = 0;
  const strokeWidth =
    minSide < 70 ? 1 : minSide < 120 ? 1.25 : EMPTY_PHOTO_FIELD_STROKE_WIDTH;
  return {
    badgeR: showBadge ? badgeR : 0,
    badgeCx: 0,
    badgeCy,
    camBodyW: badgeR * 0.88,
    camBodyH: badgeR * 0.58,
    showBadge,
    showPhotoLabel,
    strokeWidth,
    labelFontSize,
  };
}

function buildEmptyPhotoFieldChrome(frameW: number, frameH: number): FabricObject[] {
  const ox = -frameW / 2;
  const oy = -frameH / 2;
  const {
    badgeR,
    badgeCx,
    badgeCy,
    camBodyW,
    camBodyH,
    showBadge,
    showPhotoLabel,
    strokeWidth,
    labelFontSize,
  } = resolveEmptyPhotoFieldChromeMetrics(frameW, frameH);
  const cornerR = Math.max(2, Math.min(6, Math.round(Math.min(frameW, frameH) * 0.04)));
  const frameRect = new Rect({
    left: ox,
    top: oy,
    originX: 'left',
    originY: 'top',
    width: frameW,
    height: frameH,
    fill: EMPTY_PHOTO_FIELD_FILL,
    stroke: EMPTY_PHOTO_FIELD_STROKE,
    strokeWidth,
    strokeDashArray: [...EMPTY_PHOTO_FIELD_STROKE_DASH],
    strokeUniform: true,
    rx: cornerR,
    ry: cornerR,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  ax(frameRect).photoFieldRole = 'frame';

  const badge = new Circle({
    left: badgeCx,
    top: badgeCy,
    originX: 'center',
    originY: 'center',
    radius: Math.max(1, badgeR),
    fill: EMPTY_PHOTO_BADGE_FILL,
    stroke: undefined,
    strokeWidth: 0,
    visible: showBadge,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  ax(badge).photoFieldRole = 'badge';

  const camBody = new Rect({
    left: badgeCx,
    top: badgeCy + 1,
    originX: 'center',
    originY: 'center',
    width: camBodyW,
    height: camBodyH,
    rx: 2,
    ry: 2,
    fill: EMPTY_PHOTO_ICON_FILL,
    visible: showBadge,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  ax(camBody).photoFieldRole = 'camera-body';

  const camTop = new Rect({
    left: badgeCx,
    top: badgeCy - camBodyH / 2 - 2,
    originX: 'center',
    originY: 'center',
    width: badgeR * 0.46,
    height: badgeR * 0.2,
    rx: 1,
    ry: 1,
    fill: EMPTY_PHOTO_ICON_FILL,
    visible: showBadge,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  ax(camTop).photoFieldRole = 'camera-top';

  const camLens = new Circle({
    left: badgeCx,
    top: badgeCy + 1,
    originX: 'center',
    originY: 'center',
    radius: Math.max(1.5, badgeR * EMPTY_PHOTO_ICON_LENS_RATIO),
    fill: '#ffffff',
    stroke: undefined,
    strokeWidth: 0,
    visible: showBadge,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  ax(camLens).photoFieldRole = 'camera-lens';

  const photoLabel = new Text('PHOTO', {
    left: badgeCx,
    top: badgeCy + badgeR + 6,
    originX: 'center',
    originY: 'top',
    fontSize: labelFontSize,
    fontWeight: 'bold',
    fontFamily: 'Arial',
    fill: EMPTY_PHOTO_LABEL_FILL,
    visible: showPhotoLabel,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  ax(photoLabel).photoFieldRole = 'label';

  return [frameRect, badge, camBody, camTop, camLens, photoLabel];
}

function resolveFieldAnchorTL(field: FabricObject): { x: number; y: number } {
  const tl = resolvePhotoFieldFrameSceneTL(field);
  return { x: tl.x, y: tl.y };
}

export function isEmptyPhotoFieldRect(field: FabricObject): boolean {
  const o = ax(field);
  return field.type === 'rect' && o.isPhotoField === true && o.photoFieldFilled !== true;
}

export function needsEmptyPhotoFieldChromeUpgrade(field: FabricObject): boolean {
  const o = ax(field);
  if (o.isPhotoField !== true || o.photoFieldFilled === true) return false;
  if (field.type === 'rect') return true;
  if (field.type === 'group') {
    return (field as Group).getObjects().length < 5;
  }
  return false;
}

/** После add на canvas: рамка (0,0) совпадает с TL из импорта. */
export function finalizeEmptyPhotoFieldPlacement(
  group: Group,
  anchor: { x: number; y: number },
): void {
  const o = ax(group);
  const fw = Math.max(32, Math.round(Number(o.photoFieldFw ?? group.width ?? 0)));
  const fh = Math.max(32, Math.round(Number(o.photoFieldFh ?? group.height ?? 0)));
  group.set({
    left: anchor.x,
    top: anchor.y,
    originX: 'left',
    originY: 'top',
    width: fw,
    height: fh,
    scaleX: 1,
    scaleY: 1,
  });
  relayoutEmptyPhotoFieldChrome(group, fw, fh);
  ensurePhotoFieldStaticLayout(group);
  group.setCoords();
  syncEmptyPhotoFieldSceneAnchor(group, new Point(anchor.x, anchor.y));
  group.setCoords();
}

/** Импортированный rect или урезанная группа → полноценное поле с иконкой. */
export function upgradePlainEmptyPhotoField(field: FabricObject): FabricObject | null {
  if (!needsEmptyPhotoFieldChromeUpgrade(field)) return null;
  const o = ax(field);
  const { fw, fh } = resolvePhotoFieldFrameSize(field);
  const anchor = resolveFieldAnchorTL(field);
  const upgraded = createEmptyPhotoField({
    id: String(o.id ?? '').trim() || `field-${Date.now()}`,
    left: anchor.x,
    top: anchor.y,
    width: fw,
    height: fh,
    clientAdded: o.photoFieldClientAdded === true,
  });
  copyImportStackMetadata(field, upgraded);
  return upgraded;
}

/** После loadFromJSON: шаблонные photo_* без chrome получают фон и иконку камеры. */
export function upgradeEmptyPhotoFieldsOnCanvas(canvas: Canvas): boolean {
  let changed = false;
  const objects = [...canvas.getObjects()];
  for (let index = 0; index < objects.length; index++) {
    const obj = objects[index]!;
    const upgraded = upgradePlainEmptyPhotoField(obj);
    if (!upgraded || upgraded === obj) continue;
    const anchor = resolveFieldAnchorTL(obj);
    canvas.remove(obj);
    canvas.insertAt(index, upgraded);
    finalizeEmptyPhotoFieldPlacement(upgraded as Group, anchor);
    changed = true;
  }
  for (const obj of canvas.getObjects()) {
    const o = ax(obj);
    if (obj.type !== 'group' || o.isPhotoField !== true || o.photoFieldFilled === true) continue;
    finalizeEmptyPhotoFieldPlacement(obj as Group, resolveFieldAnchorTL(obj));
    changed = true;
  }
  return changed;
}

/** Создаёт пустое поле — группа с фоном и иконкой камеры. */
export function createEmptyPhotoField(opts: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  clientAdded?: boolean;
}): FabricObject {
  const { id, left, top } = opts;
  const frameW = Math.max(32, Math.round(opts.width));
  const frameH = Math.max(32, Math.round(opts.height));
  const children = buildEmptyPhotoFieldChrome(frameW, frameH);
  const group = new Group(children, {
    left,
    top,
    originX: 'left',
    originY: 'top',
    width: frameW,
    height: frameH,
    subTargetCheck: false,
    objectCaching: false,
    layoutManager: createPhotoFieldStaticLayoutManager(),
  });
  relayoutEmptyPhotoFieldChrome(group, frameW, frameH);
  ensurePhotoFieldStaticLayout(group);

  const o = ax(group);
  o.isPhotoField = true;
  o.photoFieldFilled = false;
  o.photoFieldFw = frameW;
  o.photoFieldFh = frameH;
  o.id = id;
  if (opts.clientAdded) o.photoFieldClientAdded = true;
  group.set({ scaleX: 1, scaleY: 1 });
  group.setCoords();
  return group;
}

export function applyEmptyPhotoFieldRectChrome(field: FabricObject): boolean {
  if (!isEmptyPhotoFieldRect(field)) return false;
  field.set({
    fill: EMPTY_PHOTO_FIELD_FILL,
    stroke: EMPTY_PHOTO_FIELD_STROKE,
    strokeWidth: EMPTY_PHOTO_FIELD_STROKE_WIDTH,
    strokeDashArray: [...EMPTY_PHOTO_FIELD_STROKE_DASH],
    strokeUniform: true,
    rx: 6,
    ry: 6,
    objectCaching: false,
  });
  return true;
}

/**
 * После drag Fabric иногда сбрасывает width/height, оставляя photoFieldFw/Fh.
 * Восстанавливаем запечённый размер без пересчёта по уменьшенному bbox.
 */
export function restoreEmptyPhotoFieldRectFromProps(field: FabricObject): boolean {
  if (!isEmptyPhotoFieldRect(field)) return false;
  const o = ax(field);
  const pW = Math.max(32, Math.round(Number(o.photoFieldFw ?? 0)));
  const pH = Math.max(32, Math.round(Number(o.photoFieldFh ?? 0)));
  if (pW < 32 || pH < 32) return false;
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  if (sx > 1.004 || sy > 1.004) return false;

  const curW = Math.max(1, Math.round(field.getScaledWidth()));
  const curH = Math.max(1, Math.round(field.getScaledHeight()));
  if (Math.abs(curW - pW) <= 1 && Math.abs(curH - pH) <= 1) return false;

  field.set({
    left: field.left ?? 0,
    top: field.top ?? 0,
    width: pW,
    height: pH,
    scaleX: 1,
    scaleY: 1,
  });
  field.setCoords();
  return true;
}

/** Запекает scale в width/height rect-поля (после углового ресайза). */
export function bakeEmptyPhotoFieldRectScale(
  field: FabricObject,
  sizeOverride?: { fw: number; fh: number },
): boolean {
  if (!isEmptyPhotoFieldRect(field)) return false;

  const o = ax(field);
  let frameW: number;
  let frameH: number;
  if (sizeOverride) {
    frameW = Math.max(32, Math.round(sizeOverride.fw));
    frameH = Math.max(32, Math.round(sizeOverride.fh));
  } else {
    const pW = Math.max(0, Math.round(Number(o.photoFieldFw ?? 0)));
    const pH = Math.max(0, Math.round(Number(o.photoFieldFh ?? 0)));
    const sx = Math.abs(Number(field.scaleX ?? 1));
    const sy = Math.abs(Number(field.scaleY ?? 1));
    const curW = Math.max(1, Math.round(field.getScaledWidth()));
    const curH = Math.max(1, Math.round(field.getScaledHeight()));
    if (
      pW >= 32
      && pH >= 32
      && sx < 1.004
      && sy < 1.004
      && (Math.abs(curW - pW) > 1 || Math.abs(curH - pH) > 1)
    ) {
      frameW = pW;
      frameH = pH;
    } else {
      frameW = Math.max(32, curW);
      frameH = Math.max(32, curH);
    }
  }

  const pW = Number(o.photoFieldFw ?? 0);
  const pH = Number(o.photoFieldFh ?? 0);
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  if (
    pW >= 32
    && pH >= 32
    && Math.abs(pW - frameW) <= 1
    && Math.abs(pH - frameH) <= 1
    && Math.abs(sx - 1) < 0.004
    && Math.abs(sy - 1) < 0.004
  ) {
    return false;
  }

  const left = field.left ?? 0;
  const top = field.top ?? 0;
  field.set({
    left,
    top,
    width: frameW,
    height: frameH,
    scaleX: 1,
    scaleY: 1,
  });
  o.photoFieldFw = frameW;
  o.photoFieldFh = frameH;
  field.setCoords();
  return true;
}

