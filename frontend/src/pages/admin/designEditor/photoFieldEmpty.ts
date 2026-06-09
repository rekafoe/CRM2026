/**
 * Пустое фото-поле: группа с однородным фоном и иконкой камеры (как в legacy chrome).
 * Один Fabric Rect на сцене ломал ресайз в Fabric 7 — группа с noop layout и relayoutEmptyPhotoFieldChrome.
 */
import { Circle, Group, Point, Rect, type Canvas, type FabricObject } from 'fabric';
import { createPhotoFieldStaticLayoutManager, ensurePhotoFieldStaticLayout } from './photoFieldFit';
import {
  pickEmptyPhotoFieldFrameRect,
  relayoutEmptyPhotoFieldChrome,
  resolvePhotoFieldFrameSize,
  syncEmptyPhotoFieldSceneAnchor,
} from './photoFieldGeometry';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

const EMPTY_PHOTO_FIELD_FILL = '#eef2f7';
const EMPTY_PHOTO_FIELD_STROKE = '#2563eb';
const EMPTY_PHOTO_BADGE_FILL = '#dbeafe';
const EMPTY_PHOTO_ICON_FILL = '#3b82f6';

function buildEmptyPhotoFieldChrome(frameW: number, frameH: number): FabricObject[] {
  const frameRect = new Rect({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    width: frameW,
    height: frameH,
    fill: EMPTY_PHOTO_FIELD_FILL,
    stroke: EMPTY_PHOTO_FIELD_STROKE,
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    strokeUniform: true,
    rx: 6,
    ry: 6,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  const minSide = Math.min(frameW, frameH);
  const badgeR = Math.max(12, Math.min(22, minSide * 0.22));
  const badgeCx = frameW / 2;
  const badgeCy = frameH / 2;
  const camBodyW = badgeR * 0.82;
  const camBodyH = badgeR * 0.55;

  const badge = new Circle({
    left: badgeCx,
    top: badgeCy,
    originX: 'center',
    originY: 'center',
    radius: badgeR,
    fill: EMPTY_PHOTO_BADGE_FILL,
    stroke: EMPTY_PHOTO_ICON_FILL,
    strokeWidth: 1,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

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
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  const camTop = new Rect({
    left: badgeCx,
    top: badgeCy - camBodyH / 2 - 2,
    originX: 'center',
    originY: 'center',
    width: badgeR * 0.42,
    height: badgeR * 0.18,
    rx: 1,
    ry: 1,
    fill: EMPTY_PHOTO_ICON_FILL,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  const camLens = new Circle({
    left: badgeCx,
    top: badgeCy + 1,
    originX: 'center',
    originY: 'center',
    radius: Math.max(2, badgeR * 0.15),
    fill: '#ffffff',
    stroke: EMPTY_PHOTO_ICON_FILL,
    strokeWidth: 1,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  return [frameRect, badge, camBody, camTop, camLens];
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

function sceneAnchorTL(field: FabricObject): { x: number; y: number } {
  const frame = pickEmptyPhotoFieldFrameRect(field) ?? field;
  const coords = frame.getCoords();
  if (coords[0]) return { x: coords[0].x, y: coords[0].y };
  const br = field.getBoundingRect();
  return { x: br.left, y: br.top };
}

function stashPhotoFieldSceneAnchor(group: Group, anchor: { x: number; y: number }): void {
  const o = ax(group);
  o.photoFieldSceneAnchorX = anchor.x;
  o.photoFieldSceneAnchorY = anchor.y;
}

/** После canvas.add: getCoords() надёжнее, чем до добавления на холст. */
function applyStashedPhotoFieldSceneAnchors(canvas: Canvas): void {
  for (const obj of canvas.getObjects()) {
    const o = ax(obj);
    if (obj.type !== 'group' || o.isPhotoField !== true || o.photoFieldFilled === true) continue;
    const sx = Number(o.photoFieldSceneAnchorX);
    const sy = Number(o.photoFieldSceneAnchorY);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
    obj.setCoords();
    syncEmptyPhotoFieldSceneAnchor(obj as Group, new Point(sx, sy));
    delete o.photoFieldSceneAnchorX;
    delete o.photoFieldSceneAnchorY;
    obj.setCoords();
  }
}

/** Импортированный rect или урезанная группа → полноценное поле с иконкой. */
export function upgradePlainEmptyPhotoField(field: FabricObject): FabricObject | null {
  if (!needsEmptyPhotoFieldChromeUpgrade(field)) return null;
  const o = ax(field);
  const { fw, fh } = resolvePhotoFieldFrameSize(field);
  field.setCoords();
  const anchor = sceneAnchorTL(field);
  const group = createEmptyPhotoField({
    id: String(o.id ?? '').trim() || `field-${Date.now()}`,
    left: anchor.x,
    top: anchor.y,
    width: fw,
    height: fh,
    clientAdded: o.photoFieldClientAdded === true,
  }) as Group;
  stashPhotoFieldSceneAnchor(group, anchor);
  syncEmptyPhotoFieldSceneAnchor(group, new Point(anchor.x, anchor.y));
  group.setCoords();
  return group;
}

/** После loadFromJSON: шаблонные photo_* без chrome получают фон и иконку камеры. */
export function upgradeEmptyPhotoFieldsOnCanvas(canvas: Canvas): boolean {
  const before = canvas.getObjects();
  const next = before.map((obj) => upgradePlainEmptyPhotoField(obj) ?? obj);
  const changed = next.some((obj, index) => obj !== before[index]);
  if (!changed) return false;
  canvas.clear();
  canvas.add(...next);
  applyStashedPhotoFieldSceneAnchors(canvas);
  return true;
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
  syncEmptyPhotoFieldSceneAnchor(group, new Point(left, top));
  group.setCoords();
  return group;
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
