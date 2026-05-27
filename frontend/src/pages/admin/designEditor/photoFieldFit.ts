import './fabricDesignSerialization';

import {
  FabricImage,
  Rect,
  Group,
  LayoutManager,
  LayoutStrategy,
  classRegistry,
} from 'fabric';
import type { Canvas } from 'fabric';
import type { FabricObject } from 'fabric';
import type { LayoutStrategyResult, StrictLayoutContext } from 'fabric';
import {
  clampPhotoFieldPan,
  computePhotoFieldLayout,
  type PhotoFieldFitMode,
  type PhotoFitLayout,
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

classRegistry.setClass(PhotoFieldFilledLayoutStrategy);
/** Совместимость с ранними сохранениями JSON: не подменять на FitContentLayout — иначе bbox раздувается под полное изображение cover. */
classRegistry.setClass(PhotoFieldFilledLayoutStrategy, 'photo-field-static');

/** Не пересобирает детей через fit-content; рамка и клип совпадают по координатам с плейсхолдером (-fw/2,-fh/2). */
export function createPhotoFieldStaticLayoutManager(): LayoutManager {
  return new LayoutManager(new PhotoFieldFilledLayoutStrategy());
}

export {
  clampPhotoFieldPan,
  computeContainLayout,
  computeCoverLayout,
  computePhotoFieldLayout,
  type PhotoFieldFitMode,
  type PhotoFitLayout,
} from './photoFieldLayout';

export {
  resolvePhotoFieldFrameSize,
  pickEmptyPhotoFieldFrameRect,
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

function normalizePhotoFieldZoom(value: unknown): number {
  const zoom = Number(value ?? 1);
  return Number.isFinite(zoom) ? Math.max(1, Math.min(6, zoom)) : 1;
}

function zoomPhotoFieldLayout(layout: PhotoFitLayout, zoom: number): PhotoFitLayout {
  const safeZoom = normalizePhotoFieldZoom(zoom);
  return {
    scale: layout.scale * safeZoom,
    displayW: layout.displayW * safeZoom,
    displayH: layout.displayH * safeZoom,
    baseLeft: layout.baseLeft - ((layout.displayW * safeZoom) - layout.displayW) / 2,
    baseTop: layout.baseTop - ((layout.displayH * safeZoom) - layout.displayH) / 2,
  };
}

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
