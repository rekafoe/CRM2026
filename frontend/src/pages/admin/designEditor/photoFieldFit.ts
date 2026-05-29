import './fabricDesignSerialization';

import {
  FabricImage,
  Rect,
  Group,
  LayoutManager,
  LayoutStrategy,
  Point,
  classRegistry,
} from 'fabric';
import type { Canvas } from 'fabric';
import type { FabricObject } from 'fabric';
import type { LayoutStrategyResult, StrictLayoutContext } from 'fabric';
import {
  clampPhotoFieldPan,
  computePhotoFieldCropSource,
  computePhotoFieldLayout,
  normalizePhotoFieldZoom,
  resolvePanZoomFromPhotoFieldCropSource,
  type PhotoFieldCropSource,
  type PhotoFieldFitMode,
  type PhotoFitLayout,
  zoomPhotoFieldLayout,
} from './photoFieldLayout';
import { resolvePhotoFieldModalPreviewUrl } from './photoFieldModalPreview';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

/** Стратегия layout: не двигать детей и не перезаписывать bbox (позиции задаём сами). */
class PhotoFieldFilledLayoutStrategy extends LayoutStrategy {
  static readonly type = 'photo-field-filled';

  calcLayoutResult(
    _context: StrictLayoutContext,
    _objects: FabricObject[],
  ): LayoutStrategyResult | undefined {
    return undefined;
  }
}

/**
 * Полный noop: Fabric 7 при init группы с LayoutManager(strategy→undefined) схлопывает bbox.
 * Как NoopLayoutManager в fabric/Group — не вызываем fit-content при создании/resize.
 */
class PhotoFieldNoopLayoutManager extends LayoutManager {
  static readonly type = 'photo-field-noop';

  performLayout(): void {
    // координаты и размеры детей задаём вручную (createEmptyPhotoField / legacy group / bake*InPlace)
  }
}

classRegistry.setClass(PhotoFieldFilledLayoutStrategy);
classRegistry.setClass(PhotoFieldNoopLayoutManager);
/** Совместимость с ранними сохранениями JSON */
classRegistry.setClass(PhotoFieldFilledLayoutStrategy, 'photo-field-static');
classRegistry.setClass(PhotoFieldNoopLayoutManager, 'photo-field-noop');

function isPhotoFieldNoopLayoutManager(group: Group): boolean {
  return group.layoutManager instanceof PhotoFieldNoopLayoutManager;
}

/** Не пересобирает детей через fit-content. */
export function createPhotoFieldStaticLayoutManager(): LayoutManager {
  return new PhotoFieldNoopLayoutManager();
}

/** FitContentLayout Fabric 7 ломает детей при scale/resize группы — фиксируем noop-layout. */
export function ensurePhotoFieldStaticLayout(group: Group): void {
  if (isPhotoFieldNoopLayoutManager(group)) return;
  group.layoutManager = createPhotoFieldStaticLayoutManager();
}

export {
  clampPhotoFieldPan,
  computeContainLayout,
  computeCoverLayout,
  computePhotoFieldLayout,
  type PhotoFieldFitMode,
  type PhotoFitLayout,
} from './photoFieldLayout';

import {
  measureFilledPhotoFieldFrameSize,
  pickEmptyPhotoFieldFrameRect,
  relayoutEmptyPhotoFieldChrome,
  resolvePhotoFieldFrameSize,
  syncEmptyPhotoFieldSceneAnchor,
  syncFilledPhotoFieldSceneAnchor,
} from './photoFieldGeometry';

export {
  resolvePhotoFieldFrameSize,
  pickEmptyPhotoFieldFrameRect,
  measureFilledPhotoFieldFrameSize,
} from './photoFieldGeometry';

/** Режим вписывания: без явного свойства — cover (заполнение рамки с обрезкой, без полей). Явно `contain` — вписать целиком. */
export function resolvePhotoFieldFitMode(o: AnyObj): PhotoFieldFitMode {
  const m = o.photoFieldFitMode;
  if (m === 'cover' || m === 'contain') return m;
  return 'cover';
}

/** Натуральный размер bitmap (иначе вписывание ломается до layout Fabric). */
export function getFabricImageIntrinsicSize(img: FabricImage): { iw: number; ih: number } {
  const oz = typeof img.getOriginalSize === 'function' ? img.getOriginalSize() : undefined;
  if (oz?.width != null && oz.width > 0 && oz.height != null && oz.height > 0) {
    return { iw: Math.max(1, oz.width), ih: Math.max(1, oz.height) };
  }
  const el = img.getElement?.() as HTMLImageElement | undefined;
  const iw = Math.max(1, el?.naturalWidth || img.width || 1);
  const ih = Math.max(1, el?.naturalHeight || img.height || 1);
  return { iw, ih };
}

/**
 * Позиция центра bitmap в локальных координатах заполненного поля.
 * Как у пустого поля после FitContentLayout: рамка в (-fw/2,-fh/2), (0,0) = центр ячейки.
 * Центр по contain/cover с pan: (panX, panY). FabricImage — origin center.
 */
function placeFitImageInPhotoFieldFrame(
  image: FabricImage,
  layout: PhotoFitLayout,
  panX: number,
  panY: number,
): void {
  image.set({
    originX: 'center',
    originY: 'center',
    left: panX,
    top: panY,
    scaleX: layout.scale,
    scaleY: layout.scale,
    selectable: false,
    evented: true,
    objectCaching: false,
  });
}

export type { PhotoFieldCropSource } from './photoFieldLayout';
export {
  computePhotoFieldCropSource,
  resolvePanZoomFromPhotoFieldCropSource,
} from './photoFieldLayout';

export function buildFilledPhotoFieldGroup(opts: {
  left: number;
  top: number;
  frameW: number;
  frameH: number;
  intrinsicW: number;
  intrinsicH: number;
  image: FabricImage;
  id?: string;
  panX?: number;
  panY?: number;
  zoom?: number;
  fitMode?: PhotoFieldFitMode;
  fileSize?: number;
  clientAdded?: boolean;
}): Group {
  const { left, top, frameW, frameH, image, id } = opts;
  const iw = opts.intrinsicW;
  const ih = opts.intrinsicH;
  const fitMode = opts.fitMode ?? 'cover';
  const zoom = normalizePhotoFieldZoom(opts.zoom);
  const layout = zoomPhotoFieldLayout(computePhotoFieldLayout(fitMode, frameW, frameH, iw, ih), zoom);
  const { panX, panY } = clampPhotoFieldPan(
    frameW,
    frameH,
    layout,
    opts.panX ?? 0,
    opts.panY ?? 0,
    fitMode,
  );

  placeFitImageInPhotoFieldFrame(image, layout, panX, panY);

  const ox = -frameW / 2;
  const oy = -frameH / 2;
  const frameAnchor = new Rect({
    left: ox,
    top: oy,
    originX: 'left',
    originY: 'top',
    width: frameW,
    height: frameH,
    fill: 'transparent',
    strokeWidth: 0,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  const clipRect = new Rect({
    originX: 'left',
    originY: 'top',
    left: ox,
    top: oy,
    width: frameW,
    height: frameH,
    objectCaching: false,
  });

  const group = new Group([frameAnchor, image], {
    left,
    top,
    originX: 'left',
    originY: 'top',
    width: frameW,
    height: frameH,
    layoutManager: createPhotoFieldStaticLayoutManager(),
    clipPath: clipRect,
    subTargetCheck: true,
    objectCaching: false,
  });

  const g = ax(group);
  g.isPhotoField = true;
  g.photoFieldFilled = true;
  g.photoFieldFw = frameW;
  g.photoFieldFh = frameH;
  g.photoFieldFitMode = fitMode;
  g.photoFieldPanX = panX;
  g.photoFieldPanY = panY;
  g.photoFieldZoom = zoom;
  g.photoFieldIntrinsicW = iw;
  g.photoFieldIntrinsicH = ih;
  if (Number.isFinite(opts.fileSize)) g.photoFieldFileSize = opts.fileSize;
  if (id) g.id = id;
  if (opts.clientAdded) g.photoFieldClientAdded = true;

  return group;
}

import {
  bakeEmptyPhotoFieldRectScale,
  isEmptyPhotoFieldRect,
  restoreEmptyPhotoFieldRectFromProps,
} from './photoFieldEmpty';

function relayoutFilledPhotoFieldFrame(
  group: Group,
  frameW: number,
  frameH: number,
  anchorSceneTL: Point,
): void {
  const o = ax(group);
  const inner = group.getObjects('image')[0] as FabricImage | undefined;
  const fitMode = resolvePhotoFieldFitMode(o);
  const oldFw = Math.round(Number(o.photoFieldFw ?? frameW));
  const oldFh = Math.round(Number(o.photoFieldFh ?? frameH));
  let preservedCrop: PhotoFieldCropSource | null = null;
  if (
    inner
    && fitMode === 'cover'
    && (Math.abs(oldFw - frameW) > 1 || Math.abs(oldFh - frameH) > 1)
  ) {
    const { iw, ih } = getFabricImageIntrinsicSize(inner);
    const zoom = normalizePhotoFieldZoom(o.photoFieldZoom ?? 1);
    const baseLayout = computePhotoFieldLayout(fitMode, oldFw, oldFh, iw, ih);
    const layout = zoomPhotoFieldLayout(baseLayout, zoom);
    preservedCrop = computePhotoFieldCropSource(
      oldFw,
      oldFh,
      iw,
      ih,
      layout,
      Number(o.photoFieldPanX ?? 0),
      Number(o.photoFieldPanY ?? 0),
      fitMode,
    );
  }

  const ox = -frameW / 2;
  const oy = -frameH / 2;

  o.photoFieldFw = frameW;
  o.photoFieldFh = frameH;

  for (const rect of group.getObjects('rect')) {
    rect.set({
      left: ox,
      top: oy,
      originX: 'left',
      originY: 'top',
      width: frameW,
      height: frameH,
      scaleX: 1,
      scaleY: 1,
    });
  }
  const clip = group.clipPath as FabricObject | undefined;
  if (clip) {
    clip.set({
      left: ox,
      top: oy,
      originX: 'left',
      originY: 'top',
      width: frameW,
      height: frameH,
      scaleX: 1,
      scaleY: 1,
    });
  }
  ensurePhotoFieldStaticLayout(group);
  group.set({
    scaleX: 1,
    scaleY: 1,
    width: frameW,
    height: frameH,
  });
  if (preservedCrop && inner) {
    const { iw, ih } = getFabricImageIntrinsicSize(inner);
    const next = resolvePanZoomFromPhotoFieldCropSource(
      frameW,
      frameH,
      iw,
      ih,
      fitMode,
      preservedCrop,
    );
    applyPhotoFieldPanToGroup(group, next.panX, next.panY, next.zoom);
  } else {
    applyPhotoFieldPanToGroup(
      group,
      Number(o.photoFieldPanX ?? 0),
      Number(o.photoFieldPanY ?? 0),
      Number(o.photoFieldZoom ?? 1),
    );
  }
  syncFilledPhotoFieldSceneAnchor(group, anchorSceneTL);
  group.setCoords();
}

function restoreFilledPhotoFieldFromProps(group: Group): boolean {
  const o = ax(group);
  const pW = Math.max(32, Math.round(Number(o.photoFieldFw ?? 0)));
  const pH = Math.max(32, Math.round(Number(o.photoFieldFh ?? 0)));
  if (pW < 32 || pH < 32) return false;
  const sx = Math.abs(Number(group.scaleX ?? 1));
  const sy = Math.abs(Number(group.scaleY ?? 1));
  if (sx > 1.004 || sy > 1.004) return false;

  const anchorRect = group.getObjects('rect')[0];
  const frameCoords = anchorRect?.getCoords();
  const anchorPoint = frameCoords?.[0]
    ? new Point(frameCoords[0].x, frameCoords[0].y)
    : new Point(group.left ?? 0, group.top ?? 0);

  const measured = measureFilledPhotoFieldFrameSize(group);
  const curW = Math.max(1, Math.round(measured?.fw ?? group.getScaledWidth()));
  const curH = Math.max(1, Math.round(measured?.fh ?? group.getScaledHeight()));
  if (Math.abs(curW - pW) <= 1 && Math.abs(curH - pH) <= 1) return false;

  relayoutFilledPhotoFieldFrame(group, pW, pH, anchorPoint);
  return true;
}

/** Восстанавливает запечённый размер после drag (rect, заполненная или пустая group). */
export function restoreBakedPhotoFieldDimensions(field: FabricObject): boolean {
  if (isEmptyPhotoFieldRect(field)) {
    return restoreEmptyPhotoFieldRectFromProps(field);
  }
  const o = ax(field);
  if (!o.isPhotoField || field.type !== 'group') return false;

  if (o.photoFieldFilled === true) {
    return restoreFilledPhotoFieldFromProps(field as Group);
  }

  const pW = Math.max(32, Math.round(Number(o.photoFieldFw ?? 0)));
  const pH = Math.max(32, Math.round(Number(o.photoFieldFh ?? 0)));
  if (pW < 32 || pH < 32) return false;
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  if (sx > 1.004 || sy > 1.004) return false;

  const measured = resolvePhotoFieldFrameSize(field);
  if (Math.abs(measured.fw - pW) <= 1 && Math.abs(measured.fh - pH) <= 1) return false;

  const group = field as Group;
  const frameRect = pickEmptyPhotoFieldFrameRect(group);
  const frameCoords = frameRect?.getCoords();
  const anchorPoint = frameCoords?.[0]
    ? new Point(frameCoords[0].x, frameCoords[0].y)
    : new Point(group.left ?? 0, group.top ?? 0);

  relayoutEmptyPhotoFieldChrome(group, pW, pH);
  ensurePhotoFieldStaticLayout(group);
  group.set({ scaleX: 1, scaleY: 1, width: pW, height: pH });
  syncEmptyPhotoFieldSceneAnchor(group, anchorPoint);
  group.setCoords();
  return true;
}

/** Запекает scale пустого поля в frameW/frameH без remove/add. */
export function bakeEmptyPhotoFieldScaleInPlace(
  field: FabricObject,
  sizeOverride?: { fw: number; fh: number },
): boolean {
  if (isEmptyPhotoFieldRect(field)) {
    return bakeEmptyPhotoFieldRectScale(field, sizeOverride);
  }
  if (field.type !== 'group') return false;
  const o = ax(field);
  if (!o.isPhotoField || o.photoFieldFilled === true) return false;

  const measured = sizeOverride ?? resolvePhotoFieldFrameSize(field);
  const frameW = Math.max(32, Math.round(measured.fw));
  const frameH = Math.max(32, Math.round(measured.fh));
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

  const group = field as Group;
  const frameRect = pickEmptyPhotoFieldFrameRect(group);
  const frameCoords = frameRect?.getCoords();
  const anchorPoint = frameCoords?.[0]
    ? new Point(frameCoords[0].x, frameCoords[0].y)
    : new Point(group.left ?? 0, group.top ?? 0);

  relayoutEmptyPhotoFieldChrome(group, frameW, frameH);
  ensurePhotoFieldStaticLayout(group);
  group.set({ scaleX: 1, scaleY: 1, width: frameW, height: frameH });
  syncEmptyPhotoFieldSceneAnchor(group, anchorPoint);
  group.setCoords();
  return true;
}

/** Запекает scale заполненного поля в frameW/frameH и пересчитывает cover/contain. */
export function bakeFilledPhotoFieldScaleInPlace(
  field: FabricObject,
  sizeOverride?: { fw: number; fh: number },
): boolean {
  if (field.type !== 'group') return false;
  const o = ax(field);
  if (!o.isPhotoField || o.photoFieldFilled !== true) return false;

  const measured = sizeOverride ?? resolvePhotoFieldFrameSize(field);
  const frameW = Math.max(32, Math.round(measured.fw));
  const frameH = Math.max(32, Math.round(measured.fh));
  const pW = Number(o.photoFieldFw ?? 0);
  const pH = Number(o.photoFieldFh ?? 0);
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  const overrideResize =
  sizeOverride != null
  && (
    Math.abs(pW - frameW) > 1
    || Math.abs(pH - frameH) > 1
  );
  if (
    !overrideResize
    && pW >= 32
    && pH >= 32
    && Math.abs(pW - frameW) <= 1
    && Math.abs(pH - frameH) <= 1
    && Math.abs(sx - 1) < 0.004
    && Math.abs(sy - 1) < 0.004
  ) {
    return false;
  }

  const group = field as Group;
  const anchorRect = group.getObjects('rect')[0];
  const frameCoords = anchorRect?.getCoords();
  const anchorPoint = frameCoords?.[0]
    ? new Point(frameCoords[0].x, frameCoords[0].y)
    : new Point(group.left ?? 0, group.top ?? 0);

  relayoutFilledPhotoFieldFrame(group, frameW, frameH, anchorPoint);
  return true;
}

export function applyPhotoFieldPanToGroup(group: Group, panX: number, panY: number, zoom?: number): void {
  const g = ax(group);
  if (!g.isPhotoField || !g.photoFieldFilled) return;
  const fw = Number(g.photoFieldFw ?? group.width ?? 1);
  const fh = Number(g.photoFieldFh ?? group.height ?? 1);
  const fitMode = resolvePhotoFieldFitMode(g);
  const innerList = group.getObjects('image');
  const inner = innerList[0] as FabricImage | undefined;
  if (!inner) return;
  const { iw, ih } = getFabricImageIntrinsicSize(inner);
  const nextZoom = normalizePhotoFieldZoom(zoom ?? g.photoFieldZoom ?? 1);
  const layout = zoomPhotoFieldLayout(computePhotoFieldLayout(fitMode, fw, fh, iw, ih), nextZoom);
  const clamped = clampPhotoFieldPan(fw, fh, layout, panX, panY, fitMode);
  g.photoFieldPanX = clamped.panX;
  g.photoFieldPanY = clamped.panY;
  g.photoFieldZoom = nextZoom;
  placeFitImageInPhotoFieldFrame(inner, layout, clamped.panX, clamped.panY);
  inner.setCoords();
  group.setCoords();
}

export function getFilledPhotoCropContext(field: FabricObject): {
  previewUrl: string;
  frameW: number;
  frameH: number;
  iw: number;
  ih: number;
  panX: number;
  panY: number;
  zoom: number;
  fitMode: PhotoFieldFitMode;
} | null {
  const o = ax(field);

  if (field.type === 'group' && o.isPhotoField && o.photoFieldFilled) {
    const grp = field as Group;
    const inner = grp.getObjects('image')[0] as FabricImage | undefined;
    if (!inner?.getElement) return null;
    const el = inner.getElement() as HTMLImageElement | undefined;
    const fallback =
      typeof el?.src === 'string' && el.src.length ? el.src : (inner.getSrc?.() ?? '');
    if (!fallback) return null;
    const previewUrl = resolvePhotoFieldModalPreviewUrl(inner, fallback);
    const { iw, ih } = getFabricImageIntrinsicSize(inner);
    return {
      previewUrl,
      frameW: Number(o.photoFieldFw ?? grp.width ?? 1),
      frameH: Number(o.photoFieldFh ?? grp.height ?? 1),
      iw,
      ih,
      panX: Number(o.photoFieldPanX ?? 0),
      panY: Number(o.photoFieldPanY ?? 0),
      zoom: normalizePhotoFieldZoom(o.photoFieldZoom ?? 1),
      fitMode: resolvePhotoFieldFitMode(o),
    };
  }

  if (field.type === 'image' && o.isPhotoField) {
    const img = field as FabricImage;
    const br = img.getBoundingRect();
    const el = img.getElement() as HTMLImageElement | undefined;
    const fallback =
      typeof el?.src === 'string' && el.src.length ? el.src : (img.getSrc?.() ?? '');
    if (!fallback) return null;
    const previewUrl = resolvePhotoFieldModalPreviewUrl(img, fallback);
    const { iw, ih } = getFabricImageIntrinsicSize(img);
    return {
      previewUrl,
      frameW: br.width,
      frameH: br.height,
      iw,
      ih,
      panX: Number(o.photoFieldPanX ?? 0),
      panY: Number(o.photoFieldPanY ?? 0),
      zoom: normalizePhotoFieldZoom(o.photoFieldZoom ?? 1),
      fitMode: resolvePhotoFieldFitMode(o),
    };
  }

  return null;
}

/** Старые макеты — изображение isPhotoField: группа с cover при первом кадрировании. */
export async function wrapLegacyFilledPhotoImage(
  canvas: Canvas,
  img: FabricImage,
): Promise<Group | null> {
  const o = ax(img);
  if (!o.isPhotoField || img.type !== 'image') return null;

  const br = img.getBoundingRect();
  const fw = Math.max(1, br.width);
  const fh = Math.max(1, br.height);
  const panX = Number(o.photoFieldPanX ?? 0);
  const panY = Number(o.photoFieldPanY ?? 0);
  const preservedId = typeof o.id === 'string' ? o.id : undefined;

  const el = img.getElement() as HTMLImageElement | undefined;
  const src = typeof el?.src === 'string' && el.src.length ? el.src : (img.getSrc?.() ?? '');
  if (!src) return null;

  const fresh = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' });
  canvas.remove(img);

  const { iw, ih } = getFabricImageIntrinsicSize(fresh);

  const group = buildFilledPhotoFieldGroup({
    left: br.left,
    top: br.top,
    frameW: fw,
    frameH: fh,
    intrinsicW: iw,
    intrinsicH: ih,
    image: fresh,
    id: preservedId,
    panX,
    panY,
    fitMode: 'cover',
  });

  canvas.add(group);
  return group;
}
