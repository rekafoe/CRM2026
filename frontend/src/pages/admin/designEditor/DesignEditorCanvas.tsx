import './fabricDesignSerialization';
import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback,
} from 'react';
import {
  Canvas,
  FabricImage,
  IText,
  Rect,
  Circle,
  Line,
  Triangle,
  Point,
  Group,
  Shadow,
} from 'fabric';
import type { FabricObject } from 'fabric';
import type { CollageLayout, DesignTemplate } from '../../../api';
import type { DesignPage, SelectedObjProps } from './types';
import {
  TEXT_BLOCK_PRESETS,
  TEXT_FONTS,
  SIDEBAR_PHOTO_DRAG_MIME,
  FABRIC_CUSTOM_PROPS,
} from './constants';
import type { TextBlockPresetKind } from './constants';
import { isLikelyImageFile, looksLikeHttpUrl } from '../../../utils/imageFile';
import { computeSnap } from './snapGuide';
import { splitSpreadCanvasToPagesSync } from './spreadCanvas';
import { PrepressOverlay } from './PrepressOverlay';
import {
  applyPhotoFieldPanToGroup,
  buildFilledPhotoFieldGroup,
  getFabricImageIntrinsicSize,
  getFilledPhotoCropContext,
  resolvePhotoFieldFitMode,
  resolvePhotoFieldFrameSize,
  wrapLegacyFilledPhotoImage,
} from './photoFieldFit';
import {
  pickEmptyPhotoFieldFrameRect,
  syncFilledPhotoFieldSceneAnchor,
} from './photoFieldGeometry';
import { PhotoFieldCropModal } from './PhotoFieldCropModal';
import { findPhotoFieldAtScene } from './photoFieldHitTest';
import {
  fabricDeserializeReviver,
  loadDesignPageScene,
  loadSpreadMergedScene,
} from './designPageLoader';

// ─── Custom property names saved in Fabric JSON ───────────────────────────────

const CUSTOM_PROPS = FABRIC_CUSTOM_PROPS;

// ─── Public handle exposed via forwardRef ────────────────────────────────────

/** Результат сохранения текущего вида холста (одна страница или пара разворота). */
export type SavePageResult =
  | { kind: 'single'; json: Record<string, unknown> }
  | { kind: 'spread'; left: Record<string, unknown>; right: Record<string, unknown> };

export interface DesignEditorCanvasHandle {
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  addText: () => void;
  /** Текст с пресетом размера (заголовок / подзаголовок / обычный) */
  addTextPreset: (kind: TextBlockPresetKind) => void;
  addImageFromFile: (file: File) => Promise<void>;
  addImageFromUrl: (url: string) => Promise<void>;
  addPhotoField: () => void;
  /** Создаёт набор пустых полей для фото по шаблону коллажа. */
  applyCollageLayout: (layout: CollageLayout, paddingPercent: number) => void;
  /** Подставляет свободные изображения на макете в пустые поля для фото (по порядку объектов). */
  autofillPhotoFields: () => Promise<void>;
  addShape: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
  getDataURL: (opts?: { multiplier?: number }) => string;
  saveCurrentPage: () => Promise<SavePageResult>;
  /** Загрузка одной страницы в узкий холст (экспорт PDF и т.п.). */
  loadPageForExport: (pageData: DesignPage) => Promise<void>;
  /** Восстановить ширину холста и контент после export (разворот или одна страница). */
  applyEditorViewState: (pagesOverride?: DesignPage[]) => Promise<void>;
  setTextProp: (key: string, value: unknown) => void;
  /** За один раз обновить начертание текста (без гонок тогглов) */
  setTextStyle: (props: { fontWeight?: string; fontStyle?: string }) => void;
  /** Свойства Fabric для выделенного i-text / textbox (тень — Shadow или null) */
  applyTextPropsToSelection: (props: Record<string, unknown>) => void;
  setObjProp: (key: string, value: unknown) => void;
  setCanvasBackground: (color: string) => void;
  setCanvasBackgroundImage: (dataUrl: string) => Promise<void>;
  clearCanvasBackground: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  flipSelected: (axis: 'x' | 'y') => void;
  getZoom: () => number;
  setZoom: (z: number) => void;
  /** Снимок текущей страницы в виде data-URL (JPEG, маленький масштаб для миниатюры) */
  captureThumb: () => string;
  /** Пересчитать позицию плавающей панели текста (скролл, зум, смена выделения) */
  syncTextFloatingAnchor: () => void;
  /** После CSS fit-zoom / скролла — синхронизировать hit-test и рамку выделения с экраном */
  syncCanvasOffset: () => void;
}

// ─── Props ───────────────────────────────────────────────────────────────────

/** basic — только заполнение предопределённых зон; advanced — полный доступ */
export type EditorMode = 'basic' | 'advanced';

interface DesignEditorCanvasProps {
  template: DesignTemplate | null;
  /** Ширина одной страницы (логическая), px */
  pageWidthPx: number;
  /** Фактическая ширина Fabric-холста: pageWidthPx или 2× при развороте */
  canvasWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
  bleedPx: number;
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
  pages: DesignPage[];
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  currentPage: number;
  /** Стабильный ключ вида: single-3 или spread-0-1 — смена перезагружает холст */
  pageLoadKey: string;
  /** Индексы левой и правой страницы разворота или null */
  spreadPairPages: [number, number] | null;
  showGuides: boolean;
  apiBaseUrl: string;
  mode?: EditorMode;
  onSelectionChange: (info: SelectedObjProps | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onZoomChange: (zoom: number) => void;
  /** Вызывается при уходе со страницы — передаёт индекс и thumbnail */
  onPageThumbReady?: (pageIndex: number, thumbUrl: string) => void;
  /** Перетаскивание ссылки на изображение (браузер отдаёт URL, не File) */
  onDropRemoteImageUrl?: (url: string) => Promise<void>;
  /** Файл из галереи сайдбара по id (drag&drop в поле фото / на холст) */
  getSidebarPhotoFile?: (id: string) => File | undefined;
  /** Убрать фото из галереи после успешного drop на холст */
  onSidebarPhotoDropped?: (id: string) => void;
  /** Custom guide lines (positions in canvas px, safe-zone relative) */
  guideLinesPx?: { axis: 'h' | 'v'; pos: number }[];
  /** Callback: вернуть snap-линии для overlay рендера */
  onSnapLinesChange?: (lines: { axis: 'h' | 'v'; pos: number }[]) => void;
  /** Якорь плавающей панели текста (центр верхней границы bbox), экранные координаты */
  onTextFloatingAnchor?: (pos: { x: number; y: number } | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

/** Применяет ограничения basic-режима к объектам холста */
function applyBasicModeConstraints(canvas: Canvas): void {
  canvas.getObjects().forEach((obj) => {
    const o = obj as unknown as AnyObj;
    if (o.isBackground) {
      obj.set({ selectable: false, evented: false });
    } else if (o.isPhotoField) {
      // фото-поле: можно кликнуть, но нельзя двигать
      obj.set({
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        hasBorders: true,
      });
    } else if (obj.type === 'i-text' || obj.type === 'textbox') {
      // текстовое поле: только редактирование текста
      obj.set({
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        hasBorders: true,
      });
    } else {
      // любые другие объекты (фигуры, изображения) — заблокированы
      obj.set({ selectable: false, evented: false });
    }
  });
  canvas.requestRenderAll();
}

/** Снимает ограничения basic-режима (полный редактор) */
function releaseBasicModeConstraints(canvas: Canvas): void {
  canvas.getObjects().forEach((obj) => {
    const o = obj as unknown as AnyObj;
    if (o.isBackground) {
      obj.set({ selectable: false, evented: false });
      return;
    }
    if (o.isPhotoField && o.photoFieldFilled === true && obj.type === 'group') {
      obj.set({
        selectable: true,
        evented: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: true,
        hasBorders: true,
      });
      return;
    }
    obj.set({
      selectable: true,
      evented: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
      hasControls: true,
      hasBorders: true,
    });
  });
  canvas.requestRenderAll();
}

function asAny(obj: unknown): AnyObj {
  return obj as unknown as AnyObj;
}

/** Поле для фото может быть внутри группы; `canvas.getObjects().find` его не находит. */
function findPhotoFieldByIdDeep(canvas: Canvas, fieldId: string): FabricObject | undefined {
  if (!fieldId) return undefined;
  const walk = (list: FabricObject[]): FabricObject | undefined => {
    for (const o of list) {
      if (asAny(o).isPhotoField && String(asAny(o).id ?? '') === fieldId) return o;
      if (typeof (o as Group).getObjects === 'function') {
        const nested = walk((o as Group).getObjects());
        if (nested) return nested;
      }
    }
    return undefined;
  };
  return walk(canvas.getObjects());
}

function getObjProps(obj: unknown): SelectedObjProps {
  const o = asAny(obj);
  const typeName = (o.type as string) ?? '';
  const isPhoto = !!o.isPhotoField;

  let type: SelectedObjProps['type'] = 'other';
  if (isPhoto) type = 'photoField';
  else if (typeName === 'i-text' || typeName === 'textbox') type = 'IText';
  else if (typeName === 'image') type = 'image';
  else if (typeName === 'rect') type = 'rect';
  else if (typeName === 'circle') type = 'circle';
  else if (typeName === 'line') type = 'line';
  else if (typeName === 'triangle') type = 'triangle';

  return {
    type,
    text: type === 'IText' ? (o.text as string) : undefined,
    fontFamily: o.fontFamily as string | undefined,
    fontSize: o.fontSize as number | undefined,
    fontWeight: (o.fontWeight as string) ?? 'normal',
    fontStyle: (o.fontStyle as string) ?? 'normal',
    underline: !!(o.underline),
    textAlign: (o.textAlign as string) ?? 'left',
    lineHeight: type === 'IText' ? (typeof o.lineHeight === 'number' ? o.lineHeight : 1.16) : undefined,
    fill: o.fill as string | undefined,
    stroke: o.stroke as string | undefined,
    strokeWidth: o.strokeWidth as number | undefined,
    opacity: (o.opacity as number) ?? 1,
    flipX: !!(o.flipX),
    flipY: !!(o.flipY),
    locked: !!(o.locked),
  };
}

/** Сцена Fabric → координаты клиента (для плавающей панели над текстом) */
function scenePointToClient(canvas: Canvas, sx: number, sy: number): { x: number; y: number } {
  const vpt = canvas.viewportTransform!;
  const vp = new Point(sx, sy).transform(vpt);
  const upper = canvas.upperCanvasEl;
  const b = upper.getBoundingClientRect();
  return {
    x: b.left + (vp.x / upper.width) * b.width,
    y: b.top + (vp.y / upper.height) * b.height,
  };
}

function canvasToJSON(canvas: Canvas): Record<string, unknown> {
  return canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
}

function createPhotoFieldGroup(opts: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}): Group {
  const { id, left, top, width, height } = opts;
  const frame = new Rect({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    width,
    height,
    fill: 'rgba(248, 250, 252, 0.96)',
    stroke: '#94a3b8',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    rx: 6,
    ry: 6,
  });
  const minSide = Math.min(width, height);
  const badgeR = Math.max(12, Math.min(22, minSide * 0.22));
  const badgeCx = width / 2;
  const badgeCy = height / 2;
  const badge = new Circle({
    left: badgeCx,
    top: badgeCy,
    originX: 'center',
    originY: 'center',
    radius: badgeR,
    fill: '#ffffff',
    stroke: '#e2e8f0',
    strokeWidth: 1,
    selectable: false,
    evented: false,
  });
  const camBodyW = badgeR * 0.82;
  const camBodyH = badgeR * 0.55;
  const camBody = new Rect({
    left: badgeCx,
    top: badgeCy + 1,
    originX: 'center',
    originY: 'center',
    width: camBodyW,
    height: camBodyH,
    rx: 2,
    ry: 2,
    fill: 'transparent',
    stroke: '#64748b',
    strokeWidth: 1.5,
    selectable: false,
    evented: false,
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
    fill: '#64748b',
    selectable: false,
    evented: false,
  });
  const camLens = new Circle({
    left: badgeCx,
    top: badgeCy + 1,
    originX: 'center',
    originY: 'center',
    radius: Math.max(2, badgeR * 0.15),
    fill: 'transparent',
    stroke: '#64748b',
    strokeWidth: 1.5,
    selectable: false,
    evented: false,
  });
  const group = new Group([frame, badge, camBody, camTop, camLens], {
    left,
    top,
    originX: 'left',
    originY: 'top',
    subTargetCheck: true,
  });
  asAny(group).isPhotoField = true;
  asAny(group).photoFieldFilled = false;
  asAny(group).photoFieldFw = width;
  asAny(group).photoFieldFh = height;
  asAny(group).id = id;
  return group;
}

function parsePageLoadKey(
  key: string,
): { type: 'single'; index: number } | { type: 'spread'; left: number; right: number } | null {
  const m = key.match(/^single-(\d+)$/);
  if (m) return { type: 'single', index: parseInt(m[1], 10) };
  const s = key.match(/^spread-(\d+)-(\d+)$/);
  if (s) return { type: 'spread', left: parseInt(s[1], 10), right: parseInt(s[2], 10) };
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const DesignEditorCanvas = forwardRef<DesignEditorCanvasHandle, DesignEditorCanvasProps>(
  (
    {
      template,
      pageWidthPx,
      canvasWidthPx,
      pageHeightPx,
      safeZonePx,
      bleedPx,
      showBleed,
      showTrim,
      showSafeZone,
      pages,
      setPages,
      currentPage,
      pageLoadKey,
      spreadPairPages,
      showGuides,
      apiBaseUrl,
      mode = 'advanced',
      onSelectionChange,
      onHistoryChange,
      onZoomChange,
      onPageThumbReady,
      onDropRemoteImageUrl,
      getSidebarPhotoFile,
      onSidebarPhotoDropped,
      guideLinesPx,
      onSnapLinesChange,
      onTextFloatingAnchor,
    },
    ref,
  ) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
    const isLoadingRef = useRef(false);
    const prevPageLoadKeyRef = useRef<string | null>(null);
    /** Блокирует синхронный resize по canvasWidthPx во время async split/load при смене pageLoadKey */
    const pageTransitionLockRef = useRef(false);
    const spreadPairPagesRef = useRef(spreadPairPages);
    spreadPairPagesRef.current = spreadPairPages;
    const pageWidthRef = useRef(pageWidthPx);
    pageWidthRef.current = pageWidthPx;
    const pageHeightRef = useRef(pageHeightPx);
    pageHeightRef.current = pageHeightPx;
    const canvasWidthRef = useRef(canvasWidthPx);
    canvasWidthRef.current = canvasWidthPx;
    const pageLoadKeyRef = useRef(pageLoadKey);
    pageLoadKeyRef.current = pageLoadKey;
    const currentPageRef = useRef(currentPage);
    currentPageRef.current = currentPage;
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const templateRef = useRef(template);
    templateRef.current = template;
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const remoteUrlHandlerRef = useRef(onDropRemoteImageUrl);
    remoteUrlHandlerRef.current = onDropRemoteImageUrl;
    const getSidebarPhotoFileRef = useRef(getSidebarPhotoFile);
    getSidebarPhotoFileRef.current = getSidebarPhotoFile;
    const onSidebarPhotoDroppedRef = useRef(onSidebarPhotoDropped);
    onSidebarPhotoDroppedRef.current = onSidebarPhotoDropped;
    const pageThumbReadyRef = useRef(onPageThumbReady);
    pageThumbReadyRef.current = onPageThumbReady;
    const guidesRef = useRef(guideLinesPx);
    guidesRef.current = guideLinesPx;
    const snapLinesRef = useRef(onSnapLinesChange);
    snapLinesRef.current = onSnapLinesChange;
    const onTextFloatingAnchorRef = useRef(onTextFloatingAnchor);
    onTextFloatingAnchorRef.current = onTextFloatingAnchor;
    const textAnchorRafRef = useRef(0);
    const scheduleTextAnchorRef = useRef<(() => void) | null>(null);

    const photoPickerTargetIdRef = useRef<string | null>(null);
    const photoFileInputRef = useRef<HTMLInputElement>(null);
    /** Последняя точка над холстом — для Ctrl+V во фото-поле (иначе попадало в addImage). */
    const photoPasteSceneRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [localSnapLines, setLocalSnapLines] = useState<{ axis: 'h' | 'v'; pos: number }[]>([]);
    const snapOverlayKeyRef = useRef('');

    /** Модалка смещения кадра (cover) в заполненном поле для фото */
    const [cropModal, setCropModal] = useState<{
      fieldId: string;
      previewUrl: string;
      frameW: number;
      frameH: number;
      iw: number;
      ih: number;
      panX: number;
      panY: number;
      fitMode: 'cover' | 'contain';
    } | null>(null);

    const snapLinesSignature = useCallback((lines: { axis: 'h' | 'v'; pos: number }[]) => {
      if (lines.length === 0) return '';
      return [...lines]
        .sort((a, b) => (a.axis === b.axis ? a.pos - b.pos : a.axis.localeCompare(b.axis)))
        .map((l) => `${l.axis}:${l.pos.toFixed(2)}`)
        .join(';');
    }, []);

    // ── History ──────────────────────────────────────────────────────────────

    const saveSnapshot = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas || isLoadingRef.current) return;
      const json = JSON.stringify(canvasToJSON(canvas));
      const { stack, index } = historyRef.current;
      const newStack = stack.slice(0, index + 1);
      newStack.push(json);
      if (newStack.length > 50) newStack.shift();
      historyRef.current = { stack: newStack, index: newStack.length - 1 };
      onHistoryChange(newStack.length > 1, false);
    }, [onHistoryChange]);

    const undo = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { stack, index } = historyRef.current;
      if (index <= 0) return;
      const newIndex = index - 1;
      historyRef.current.index = newIndex;
      isLoadingRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(stack[newIndex]) as Record<string, unknown>, fabricDeserializeReviver);
        canvas.requestRenderAll();
      } finally {
        isLoadingRef.current = false;
      }
      onHistoryChange(newIndex > 0, newIndex < stack.length - 1);
    }, [onHistoryChange]);

    const redo = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { stack, index } = historyRef.current;
      if (index >= stack.length - 1) return;
      const newIndex = index + 1;
      historyRef.current.index = newIndex;
      isLoadingRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(stack[newIndex]) as Record<string, unknown>, fabricDeserializeReviver);
        canvas.requestRenderAll();
      } finally {
        isLoadingRef.current = false;
      }
      onHistoryChange(newIndex > 0, newIndex < stack.length - 1);
    }, [onHistoryChange]);

    // ── Canvas init (once) ───────────────────────────────────────────────────

    useEffect(() => {
      if (!canvasElRef.current) return;

      const canvas = new Canvas(canvasElRef.current, {
        width: canvasWidthPx,
        height: pageHeightPx,
        backgroundColor: 'white',
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      const trackPasteScene = (ev: Event) => {
        try {
          photoPasteSceneRef.current = canvas.getScenePoint(ev as never);
        } catch {
          /* noop */
        }
      };
      canvas.upperCanvasEl.addEventListener('mousemove', trackPasteScene);

      const scheduleTextAnchor = () => {
        if (!onTextFloatingAnchorRef.current) return;
        cancelAnimationFrame(textAnchorRafRef.current);
        textAnchorRafRef.current = requestAnimationFrame(() => {
          const cb = onTextFloatingAnchorRef.current;
          if (!cb) return;
          const c = fabricRef.current;
          if (!c) {
            cb(null);
            return;
          }
          c.calcOffset();
          const active = c.getActiveObject();
          if (!active || (active.type !== 'i-text' && active.type !== 'textbox')) {
            cb(null);
            return;
          }
          const br = active.getBoundingRect();
          const cx = br.left + br.width / 2;
          const cy = br.top;
          const { x, y } = scenePointToClient(c, cx, cy);
          cb({ x, y });
        });
      };
      scheduleTextAnchorRef.current = scheduleTextAnchor;

      // Selection events
      const updateSel = () => {
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        else onSelectionChange(null);
        scheduleTextAnchor();
      };
      canvas.on('selection:created', updateSel);
      canvas.on('selection:updated', updateSel);
      canvas.on('selection:cleared', () => {
        onSelectionChange(null);
        scheduleTextAnchor();
      });
      canvas.on('after:render', scheduleTextAnchor);

      // Persist changes & update selection info
      const handleModified = () => {
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        saveSnapshot();
      };
      canvas.on('object:modified', handleModified);
      canvas.on('object:added', () => { if (!isLoadingRef.current) saveSnapshot(); });
      canvas.on('object:removed', () => { if (!isLoadingRef.current) saveSnapshot(); });

      // Smart snapping on move
      canvas.on('object:moving', (opt) => {
        const target = opt.target;
        if (!target) return;
        if (target.lockMovementX && target.lockMovementY) return;
        const brT = target.getBoundingRect();
        const excludePeerSnap =
          !!(asAny(target).isPhotoField || (target.group && asAny(target.group).isPhotoField));
        const others = excludePeerSnap
          ? []
          : canvas
              .getObjects()
              .filter((o) => o !== target && !(asAny(o).isBackground))
              .map((o) => {
                const r = o.getBoundingRect();
                return {
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                  scaleX: 1,
                  scaleY: 1,
                };
              });
        const cW = canvas.getWidth() ?? canvasWidthRef.current;
        const snap = computeSnap(
          {
            left: brT.left,
            top: brT.top,
            width: brT.width,
            height: brT.height,
            scaleX: 1,
            scaleY: 1,
          },
          others,
          guidesRef.current ?? [],
          cW,
          pageHeightPx,
          safeZonePx,
          spreadPairPagesRef.current ? { spreadHalfWidthPx: pageWidthRef.current } : undefined,
        );
        if (snap.dx !== 0) target.set('left', (target.left ?? 0) + snap.dx);
        if (snap.dy !== 0) target.set('top', (target.top ?? 0) + snap.dy);
        if (snap.dx !== 0 || snap.dy !== 0) target.setCoords();
        const sig = snapLinesSignature(snap.lines);
        if (sig !== snapOverlayKeyRef.current) {
          snapOverlayKeyRef.current = sig;
          setLocalSnapLines(snap.lines);
          snapLinesRef.current?.(snap.lines);
        }
      });
      const clearSnaps = () => {
        snapOverlayKeyRef.current = '';
        setLocalSnapLines([]);
        snapLinesRef.current?.([]);
      };
      canvas.on('mouse:up', clearSnaps);
      canvas.on('text:changed', () => {
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        saveSnapshot();
        scheduleTextAnchor();
      });

      // Ctrl+wheel: без масштаба сцены Fabric; plain scroll страницы не трогаем
      canvas.on('mouse:wheel', (opt) => {
        const e = opt.e as WheelEvent;
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();
      });

      // Alt+drag pan
      let isPanning = false;
      let lastPan = { x: 0, y: 0 };
      canvas.on('mouse:down', (opt) => {
        if ((opt.e as MouseEvent).altKey) {
          isPanning = true;
          canvas.selection = false;
          lastPan = { x: (opt.e as MouseEvent).clientX, y: (opt.e as MouseEvent).clientY };
        }
      });
      canvas.on('mouse:move', (opt) => {
        if (!isPanning) return;
        const e = opt.e as MouseEvent;
        canvas.relativePan(new Point(e.clientX - lastPan.x, e.clientY - lastPan.y));
        lastPan = { x: e.clientX, y: e.clientY };
      });
      canvas.on('mouse:up', () => { isPanning = false; canvas.selection = true; });

      // Double-click: пустое поле — выбор файла; заполненное — кадрирование
      canvas.on('mouse:dblclick', (opt) => {
        let target = opt.target as FabricObject | undefined;
        if (target?.group && asAny(target.group).isPhotoField) {
          target = target.group as FabricObject;
        }
        if (target && asAny(target).isPhotoField) {
          const fieldId = String((asAny(target).id as string) ?? '').trim();
          if (!fieldId) return;
          const cropCtx = getFilledPhotoCropContext(target);
          if (cropCtx) {
            setCropModal({
              fieldId,
              previewUrl: cropCtx.previewUrl,
              frameW: cropCtx.frameW,
              frameH: cropCtx.frameH,
              iw: cropCtx.iw,
              ih: cropCtx.ih,
              panX: cropCtx.panX,
              panY: cropCtx.panY,
              fitMode: cropCtx.fitMode,
            });
            return;
          }
          photoPickerTargetIdRef.current = fieldId;
          setTimeout(() => photoFileInputRef.current?.click(), 0);
        }
      });

      // Drag-and-drop images onto canvas (файлы ОС, URL, фото из галереи сайдбара)
      const wrapper = canvasElRef.current?.parentElement as HTMLElement | null;
      let removeCanvasDropListeners: (() => void) | null = null;
      if (wrapper) {
        const onDragOver = (e: DragEvent) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };

        const scenePointFromDrop = (e: DragEvent) => {
          const p = canvas.getScenePoint(e);
          return { x: p.x, y: p.y };
        };

        const onDrop = async (e: DragEvent) => {
          e.preventDefault();
          const dt = e.dataTransfer;
          if (!dt) return;

          const { x, y } = scenePointFromDrop(e);
          const hit = findPhotoFieldAtScene(canvas, x, y);

          const sidebarRaw = dt.getData(SIDEBAR_PHOTO_DRAG_MIME);
          if (sidebarRaw) {
            let photoId: string | null = null;
            try {
              const parsed = JSON.parse(sidebarRaw) as { id?: unknown };
              if (typeof parsed?.id === 'string') photoId = parsed.id;
            } catch {
              photoId = null;
            }
            const sideFile =
              photoId && getSidebarPhotoFileRef.current
                ? getSidebarPhotoFileRef.current(photoId)
                : undefined;
            if (photoId && sideFile && isLikelyImageFile(sideFile)) {
              try {
                if (hit) {
                  await fillPhotoField(canvas, hit, sideFile, () => {
                    if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
                    else releaseBasicModeConstraints(canvas);
                  });
                } else {
                  await addImageFileToCanvas(canvas, sideFile);
                }
                onSidebarPhotoDroppedRef.current?.(photoId);
              } catch {
                /* ошибки сети/декода — молча */
              }
              return;
            }
          }

          const file = Array.from(dt.files ?? []).find((f) => isLikelyImageFile(f));
          if (file) {
            if (hit) {
              await fillPhotoField(canvas, hit, file, () => {
                if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
                else releaseBasicModeConstraints(canvas);
              });
            } else {
              await addImageFileToCanvas(canvas, file);
            }
            return;
          }

          const raw =
            dt.getData('text/uri-list') ||
            dt.getData('text/plain') ||
            dt.getData('URL') ||
            '';
          const firstUrl = raw
            .split(/\r?\n/)
            .map((s) => s.trim())
            .find((s) => looksLikeHttpUrl(s));
          if (firstUrl && remoteUrlHandlerRef.current) {
            try {
              await remoteUrlHandlerRef.current(firstUrl);
            } catch {
              /* ошибку показывает родитель */
            }
          }
        };

        wrapper.addEventListener('dragover', onDragOver);
        wrapper.addEventListener('drop', onDrop);
        removeCanvasDropListeners = () => {
          wrapper.removeEventListener('dragover', onDragOver);
          wrapper.removeEventListener('drop', onDrop);
        };
      }

      // Keyboard: Delete, Ctrl+Z, Ctrl+Y
      const onKeyDown = (e: KeyboardEvent) => {
        const active = document.activeElement;
        const wrapper2 = canvasElRef.current?.closest('.fabric-canvas-outer') as HTMLElement | null;
        if (active && active !== document.body && !(wrapper2?.contains(active as Node) ?? false)) {
          return;
        }
        // IText in edit mode — let Fabric handle keys
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as unknown as AnyObj).isEditing) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (modeRef.current !== 'basic') {
            canvas.getActiveObjects().forEach((o) => {
              if (!asAny(o).isBackground) canvas.remove(o);
            });
            canvas.discardActiveObject();
            canvas.requestRenderAll();
          }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          void undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          e.preventDefault();
          void redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
          e.preventDefault();
          if (modeRef.current !== 'basic') duplicateActiveObjects(canvas, saveSnapshot);
        }
      };
      window.addEventListener('keydown', onKeyDown);

      // Ctrl+V — вставка изображения из буфера обмена
      const onPaste = (e: ClipboardEvent) => {
        const active = document.activeElement;
        const wrapper2 = canvasElRef.current?.closest('.fabric-canvas-outer') as HTMLElement | null;
        // Не перехватываем, если фокус в текстовом поле вне холста
        if (
          active &&
          active !== document.body &&
          !(wrapper2?.contains(active as Node) ?? false) &&
          active.tagName !== 'CANVAS'
        ) return;
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as unknown as AnyObj).isEditing) return;

        const items = e.clipboardData?.items ?? [];
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) break;
            const p = photoPasteSceneRef.current;
            void (async () => {
              const hit = findPhotoFieldAtScene(canvas, p.x, p.y);
              if (hit) {
                await fillPhotoField(canvas, hit, file, () => {
                  if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
                  else releaseBasicModeConstraints(canvas);
                });
              } else {
                await addImageFileToCanvas(canvas, file);
              }
            })();
            break;
          }
        }
      };
      window.addEventListener('paste', onPaste);

      return () => {
        removeCanvasDropListeners?.();
        cancelAnimationFrame(textAnchorRafRef.current);
        scheduleTextAnchorRef.current = null;
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('paste', onPaste);
        canvas.upperCanvasEl.removeEventListener('mousemove', trackPasteScene);
        canvas.dispose();
        fabricRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Смена страницы / разворота по pageLoadKey ─────────────────────────────
    // ВАЖНО: этот эффект должен идти ПЕРЕД синхронизацией setDimensions ниже — иначе при
    // выходе из разворота холст сначала сузится, и split увидит неверную геометрию.
    // Split без await + проверка targetKey после await — чтобы не перезаписать холст устаревшим переходом.

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const prevKey = prevPageLoadKeyRef.current;
      if (prevKey === pageLoadKey) return;

      const targetKey = pageLoadKey;
      pageTransitionLockRef.current = true;
      void (async () => {
        try {
          // Снимок страниц после сохранения с холста — сразу, т.к. setPages не обновит pagesRef до следующего рендера
          let snapshotPages: DesignPage[] = pagesRef.current;

          if (prevKey != null) {
            const parsedPrev = parsePageLoadKey(prevKey);
            if (parsedPrev?.type === 'spread') {
              if (pageLoadKeyRef.current !== targetKey) return;
              const { left, right } = splitSpreadCanvasToPagesSync(canvas, pageWidthRef.current);
              snapshotPages = pagesRef.current.map((p, i) => {
                if (i === parsedPrev.left) return { fabricJSON: left };
                if (i === parsedPrev.right) return { fabricJSON: right };
                return p;
              });
              if (pageLoadKeyRef.current !== targetKey) return;
              setPages(snapshotPages);
              const thumbUrl = canvas.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 });
              pageThumbReadyRef.current?.(parsedPrev.left, thumbUrl);
              pageThumbReadyRef.current?.(parsedPrev.right, thumbUrl);
            } else if (parsedPrev?.type === 'single') {
              if (pageLoadKeyRef.current !== targetKey) return;
              const json = canvasToJSON(canvas);
              snapshotPages = pagesRef.current.map((p, i) =>
                i === parsedPrev.index ? { fabricJSON: json } : p,
              );
              if (pageLoadKeyRef.current !== targetKey) return;
              setPages(snapshotPages);
              const thumbUrl = canvas.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 });
              pageThumbReadyRef.current?.(parsedPrev.index, thumbUrl);
            }
          }

          if (pageLoadKeyRef.current !== targetKey) return;
          historyRef.current = { stack: [], index: -1 };
          onHistoryChange(false, false);

          const parsedNext = parsePageLoadKey(targetKey);
          const pw = pageWidthRef.current;
          const ph = pageHeightRef.current;

          if (parsedNext?.type === 'spread') {
            canvas.setDimensions({ width: pw * 2, height: ph });
            if (pageLoadKeyRef.current !== targetKey) return;
            isLoadingRef.current = true;
            await loadSpreadMergedScene({
              canvas,
              leftPage: snapshotPages[parsedNext.left],
              rightPage: snapshotPages[parsedNext.right],
              pageW: pw,
              pageH: ph,
              template: templateRef.current,
              apiBaseUrl,
            });
          } else if (parsedNext?.type === 'single') {
            canvas.setDimensions({ width: pw, height: ph });
            if (pageLoadKeyRef.current !== targetKey) return;
            isLoadingRef.current = true;
            await loadDesignPageScene({
              canvas,
              pageData: snapshotPages[parsedNext.index],
              template: templateRef.current,
              pageW: pw,
              pageH: ph,
              apiBaseUrl,
            });
          }

          if (pageLoadKeyRef.current !== targetKey) return;
          if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
          const snap = JSON.stringify(canvasToJSON(canvas));
          historyRef.current = { stack: [snap], index: 0 };

          const thumb = canvas.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 });
          if (parsedNext?.type === 'spread') {
            pageThumbReadyRef.current?.(parsedNext.left, thumb);
            pageThumbReadyRef.current?.(parsedNext.right, thumb);
          } else if (parsedNext?.type === 'single') {
            pageThumbReadyRef.current?.(parsedNext.index, thumb);
          }

          prevPageLoadKeyRef.current = targetKey;
        } finally {
          isLoadingRef.current = false;
          if (pageLoadKeyRef.current === targetKey) {
            pageTransitionLockRef.current = false;
          }
        }
      })();

      return () => {
        pageTransitionLockRef.current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageLoadKey]);

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || pageTransitionLockRef.current) return;
      if (canvas.getWidth() === canvasWidthPx && canvas.getHeight() === pageHeightPx) return;
      canvas.setDimensions({ width: canvasWidthPx, height: pageHeightPx });
      canvas.requestRenderAll();
    }, [canvasWidthPx, pageHeightPx]);

    // ── Режим basic / advanced: при смене перенастраиваем объекты ─────────────
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      if (mode === 'basic') applyBasicModeConstraints(canvas);
      else releaseBasicModeConstraints(canvas);
    }, [mode]);

    // ── Photo field fill from file input ─────────────────────────────────────

    const handlePhotoFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const canvas = fabricRef.current;
      if (!file || !canvas || !isLikelyImageFile(file)) return;

      const targetId = photoPickerTargetIdRef.current;
      photoPickerTargetIdRef.current = null;

      if (targetId) {
        const field = findPhotoFieldByIdDeep(canvas, targetId);
        if (field) {
          await fillPhotoField(canvas, field, file, () => {
            if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
            else releaseBasicModeConstraints(canvas);
          });
          return;
        }
      }

      await addImageFileToCanvas(canvas, file);
    }, []);

    // ── Imperative API ───────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      undo,
      redo,
      deleteSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        canvas.getActiveObjects().forEach((o) => {
          if (!asAny(o).isBackground) canvas.remove(o);
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      },
      addText: () => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const text = new IText('Текст', {
          left: canvas.width! / 2 - 40,
          top: canvas.height! / 2 - 15,
          fontSize: 28,
          fontFamily: TEXT_FONTS[0].value,
          fill: '#000000',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      addTextPreset: (kind: TextBlockPresetKind) => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const p = TEXT_BLOCK_PRESETS[kind];
        const text = new IText(p.defaultText, {
          left: canvas.width! / 2 - 120,
          top: canvas.height! / 2 - Math.round(p.fontSize / 2),
          fontSize: p.fontSize,
          fontWeight: p.fontWeight,
          lineHeight: p.lineHeight,
          fontFamily: TEXT_FONTS[0].value,
          fill: '#111827',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      addImageFromFile: async (file: File) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        await addImageFileToCanvas(canvas, file);
      },
      addPhotoField: () => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const field = createPhotoFieldGroup({
          id: `field-${Date.now()}`,
          left: canvas.width! / 2 - 70,
          top: canvas.height! / 2 - 70,
          width: 140,
          height: 140,
        });
        canvas.add(field);
        canvas.setActiveObject(field);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      applyCollageLayout: (layout: CollageLayout, paddingPercent: number) => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const cells = Array.isArray(layout.cells) ? layout.cells : [];
        if (cells.length === 0) return;

        const pageSafeLeft = spreadPairPagesRef.current ? (currentPageRef.current % 2 === 1 ? pageWidthRef.current : 0) : 0;
        const safeLeft = pageSafeLeft + safeZonePx;
        const safeTop = safeZonePx;
        const safeWidth = Math.max(1, pageWidthRef.current - safeZonePx * 2);
        const safeHeight = Math.max(1, canvas.height! - safeZonePx * 2);
        const margin = Math.min(0.3, Math.max(0, paddingPercent) / 100 / 2);
        const scale = 1 - 2 * margin;
        const stamp = Date.now();
        const fields = cells
          .map((cell, index) => {
            const x = Math.max(0, Math.min(1, Number(cell.x) || 0));
            const y = Math.max(0, Math.min(1, Number(cell.y) || 0));
            const w = Math.max(0.02, Math.min(1, Number(cell.w) || 0));
            const h = Math.max(0.02, Math.min(1, Number(cell.h) || 0));
            return createPhotoFieldGroup({
              id: `field-${stamp}-${index}`,
              left: safeLeft + (margin + x * scale) * safeWidth,
              top: safeTop + (margin + y * scale) * safeHeight,
              width: Math.max(24, w * scale * safeWidth),
              height: Math.max(24, h * scale * safeHeight),
            });
          });

        canvas.add(...fields);
        canvas.discardActiveObject();
        canvas.setActiveObject(fields[0]);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      autofillPhotoFields: async () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const objects = canvas.getObjects();
        const sources = objects.filter(
          (o) =>
            o.type === 'image' &&
            !asAny(o).isBackground &&
            !asAny(o).isPhotoField,
        ) as FabricImage[];
        const targets = objects.filter((o) => {
          if (!asAny(o).isPhotoField) return false;
          /* Пустая рамка (group) или старый макет: одно image с флагом */
          return o.type === 'group' || o.type === 'image';
        }) as FabricObject[];
        if (sources.length === 0 || targets.length === 0) return;

        const sortReading = (objs: FabricObject[]) =>
          [...objs].sort((a, b) => {
            const ra = a.getBoundingRect();
            const rb = b.getBoundingRect();
            const cya = ra.top + ra.height / 2;
            const cyb = rb.top + rb.height / 2;
            const rowTol = Math.min(96, Math.max(24, canvas.height! * 0.04));
            if (Math.abs(cya - cyb) > rowTol) return cya - cyb;
            return ra.left + ra.width / 2 - (rb.left + rb.width / 2);
          });

        const sortSources = sortReading(sources as FabricObject[]) as FabricImage[];
        const orderedTargets = sortReading(targets);
        const n = Math.min(sortSources.length, orderedTargets.length);
        for (let i = 0; i < n; i++) {
          const src = sortSources[i];
          const field = orderedTargets[i];
          if (src.canvas !== canvas || field.canvas !== canvas) continue;
          const dataUrl = src.toDataURL({ format: 'png', multiplier: 1 });
          const blob = await fetch(dataUrl).then((r) => r.blob());
          const file = new File([blob], `autofill-${i}.png`, { type: 'image/png' });
          await fillPhotoField(canvas, field, file, () => {
            if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
            else releaseBasicModeConstraints(canvas);
          });
          if (src.canvas === canvas) canvas.remove(src);
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      },
      addShape: (type) => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const cx = canvas.width! / 2;
        const cy = canvas.height! / 2;
        let obj;
        switch (type) {
          case 'rect':
            obj = new Rect({ left: cx - 50, top: cy - 30, width: 100, height: 60, fill: '#3b82f6' });
            break;
          case 'circle':
            obj = new Circle({ left: cx - 40, top: cy - 40, radius: 40, fill: '#3b82f6' });
            break;
          case 'line':
            obj = new Line([cx - 60, cy, cx + 60, cy], { stroke: '#1f2937', strokeWidth: 3 });
            break;
          case 'triangle':
            obj = new Triangle({ left: cx - 40, top: cy - 40, width: 80, height: 80, fill: '#3b82f6' });
            break;
          default:
            return;
        }
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      getDataURL: (opts) =>
        fabricRef.current?.toDataURL({ format: 'png', multiplier: opts?.multiplier ?? 2 }) ?? '',
      saveCurrentPage: async (): Promise<SavePageResult> => {
        const canvas = fabricRef.current;
        if (!canvas) return { kind: 'single', json: {} };
        const pw = pageWidthRef.current;
        if (spreadPairPagesRef.current) {
          const { left, right } = splitSpreadCanvasToPagesSync(canvas, pw);
          return { kind: 'spread', left, right };
        }
        return { kind: 'single', json: canvasToJSON(canvas) };
      },
      loadPageForExport: async (pageData: DesignPage) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const pw = pageWidthRef.current;
        const ph = pageHeightRef.current;
        isLoadingRef.current = true;
        try {
          canvas.setDimensions({ width: pw, height: ph });
          await loadDesignPageScene({
            canvas,
            pageData,
            template: templateRef.current,
            pageW: pw,
            pageH: ph,
            apiBaseUrl,
          });
          if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
          canvas.requestRenderAll();
        } finally {
          isLoadingRef.current = false;
        }
      },
      applyEditorViewState: async (pagesOverride?: DesignPage[]) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const pagesSource = pagesOverride ?? pagesRef.current;
        const pair = spreadPairPagesRef.current;
        const key = parsePageLoadKey(pageLoadKeyRef.current);
        const pw = pageWidthRef.current;
        const ph = pageHeightRef.current;
        isLoadingRef.current = true;
        try {
          if (pair && key?.type === 'spread') {
            canvas.setDimensions({ width: pw * 2, height: ph });
            await loadSpreadMergedScene({
              canvas,
              leftPage: pagesSource[pair[0]],
              rightPage: pagesSource[pair[1]],
              pageW: pw,
              pageH: ph,
              template: templateRef.current,
              apiBaseUrl,
            });
          } else if (key?.type === 'single') {
            canvas.setDimensions({ width: pw, height: ph });
            await loadDesignPageScene({
              canvas,
              pageData: pagesSource[key.index],
              template: templateRef.current,
              pageW: pw,
              pageH: ph,
              apiBaseUrl,
            });
          }
          if (modeRef.current === 'basic') applyBasicModeConstraints(canvas);
          canvas.requestRenderAll();
          if (pagesOverride) {
            const snap = JSON.stringify(canvasToJSON(canvas));
            historyRef.current = { stack: [snap], index: 0 };
            onHistoryChange(false, false);
          }
        } finally {
          isLoadingRef.current = false;
        }
      },
      duplicateSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        duplicateActiveObjects(canvas, saveSnapshot);
      },
      addImageFromUrl: async (url: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        await addImageUrlToCanvas(canvas, url);
      },
      setTextProp: (key: string, value: unknown) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active) return;
        active.set({ [key]: value } as Parameters<typeof active.set>[0]);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      setTextStyle: (props: { fontWeight?: string; fontStyle?: string }) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || (active.type !== 'i-text' && active.type !== 'textbox')) return;
        active.set(props as Parameters<typeof active.set>[0]);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      applyTextPropsToSelection: (props: Record<string, unknown>) => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const active = canvas.getActiveObject();
        if (!active || (active.type !== 'i-text' && active.type !== 'textbox')) return;
        const next: Record<string, unknown> = { ...props };
        if (next.shadow != null && typeof next.shadow === 'object' && !(next.shadow instanceof Shadow)) {
          next.shadow = new Shadow(next.shadow as object);
        }
        active.set(next as Parameters<typeof active.set>[0]);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      setObjProp: (key: string, value: unknown) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (!asAny(o).isBackground) o.set({ [key]: value } as Parameters<typeof o.set>[0]);
        });
        canvas.requestRenderAll();
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      setCanvasBackground: (color: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.backgroundColor = color;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).backgroundImage = undefined;
        canvas.requestRenderAll();
        saveSnapshot();
      },
      setCanvasBackgroundImage: async (dataUrl: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
        img.set({
          scaleX: canvas.width! / (img.width || canvas.width!),
          scaleY: canvas.height! / (img.height || canvas.height!),
          originX: 'left',
          originY: 'top',
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
        });
        canvas.set({ backgroundImage: img });
        canvas.requestRenderAll();
        saveSnapshot();
      },
      clearCanvasBackground: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.backgroundColor = '#ffffff';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).backgroundImage = undefined;
        canvas.requestRenderAll();
        saveSnapshot();
      },
      bringForward: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => canvas.bringObjectForward(o));
        canvas.requestRenderAll();
        saveSnapshot();
      },
      sendBackward: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => canvas.sendObjectBackwards(o));
        canvas.requestRenderAll();
        saveSnapshot();
      },
      bringToFront: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => canvas.bringObjectToFront(o));
        canvas.requestRenderAll();
        saveSnapshot();
      },
      sendToBack: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (!asAny(o).isBackground) canvas.sendObjectToBack(o);
        });
        // Убеждаемся, что фон остаётся сзади
        const bg = canvas.getObjects().find((o) => asAny(o).isBackground);
        if (bg) canvas.sendObjectToBack(bg);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      flipSelected: (axis: 'x' | 'y') => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (axis === 'x') o.set({ flipX: !o.flipX });
          else o.set({ flipY: !o.flipY });
        });
        canvas.requestRenderAll();
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      captureThumb: () =>
        fabricRef.current?.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 }) ?? '',
      getZoom: () => fabricRef.current?.getZoom() ?? 1,
      setZoom: (z: number) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.setZoom(Math.min(Math.max(z, 0.1), 10));
        onZoomChange(canvas.getZoom());
      },
      syncTextFloatingAnchor: () => {
        scheduleTextAnchorRef.current?.();
      },
      syncCanvasOffset: () => {
        const c = fabricRef.current;
        if (!c) return;
        c.calcOffset();
        c.requestRenderAll();
      },
    }));

    // ── Render ───────────────────────────────────────────────────────────────

    return (
      <div className="fabric-canvas-outer">
        <div className="fabric-canvas-inner">
          <canvas ref={canvasElRef} />
          {showGuides && (
            <PrepressOverlay
              canvasWidthPx={canvasWidthPx}
              pageWidthPx={pageWidthPx}
              pageHeightPx={pageHeightPx}
              bleedPx={bleedPx}
              safeZonePx={safeZonePx}
              isSpreadView={spreadPairPages != null}
              showBleed={showBleed}
              showTrim={showTrim}
              showSafeZone={showSafeZone}
            />
          )}

          {/* Smart-snap alignment lines */}
          {localSnapLines.length > 0 && (
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: canvasWidthPx,
                height: pageHeightPx,
                pointerEvents: 'none',
                zIndex: 20,
              }}
            >
              {localSnapLines.map((sl, i) =>
                sl.axis === 'v' ? (
                  <line key={i} x1={sl.pos} y1={0} x2={sl.pos} y2={pageHeightPx}
                    stroke="#f43f5e" strokeWidth={0.8} strokeDasharray="3 3" />
                ) : (
                  <line key={i} x1={0} y1={sl.pos} x2={canvasWidthPx} y2={sl.pos}
                    stroke="#f43f5e" strokeWidth={0.8} strokeDasharray="3 3" />
                ),
              )}
            </svg>
          )}
        </div>
        <input
          ref={photoFileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          style={{ display: 'none' }}
          onChange={handlePhotoFileChange}
        />
        {cropModal && (
          <PhotoFieldCropModal
            isOpen
            previewUrl={cropModal.previewUrl}
            frameW={cropModal.frameW}
            frameH={cropModal.frameH}
            intrinsicW={cropModal.iw}
            intrinsicH={cropModal.ih}
            initialPanX={cropModal.panX}
            initialPanY={cropModal.panY}
            fitMode={cropModal.fitMode}
            onClose={() => setCropModal(null)}
            onApply={(panX, panY) => {
              void (async () => {
                const c = fabricRef.current;
                if (!c) return;
                const id = cropModal.fieldId;
                let hit = c.getObjects().find((o) => asAny(o).id === id && asAny(o).isPhotoField);
                if (!hit) return;
                if (hit.type === 'image') {
                  const g = await wrapLegacyFilledPhotoImage(c, hit as FabricImage);
                  hit = g ?? hit;
                }
                if (hit.type === 'group') applyPhotoFieldPanToGroup(hit as Group, panX, panY);
                if (modeRef.current === 'basic') applyBasicModeConstraints(c);
                else releaseBasicModeConstraints(c);
                c.requestRenderAll();
                saveSnapshot();
              })();
            }}
            onReplaceFile={() => {
              const id = cropModal.fieldId;
              setCropModal(null);
              photoPickerTargetIdRef.current = id;
              setTimeout(() => photoFileInputRef.current?.click(), 0);
            }}
          />
        )}
      </div>
    );
  },
);

DesignEditorCanvas.displayName = 'DesignEditorCanvas';

// ─── Canvas helpers (module-level) ───────────────────────────────────────────

async function addImageFileToCanvas(canvas: Canvas, file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const maxW = canvas.width! * 0.6;
    const maxH = canvas.height! * 0.6;
    const scale = Math.min(
      img.width! > maxW ? maxW / img.width! : 1,
      img.height! > maxH ? maxH / img.height! : 1,
    );
    img.set({
      left: canvas.width! / 2 - (img.width! * scale) / 2,
      top: canvas.height! / 2 - (img.height! * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  } finally {
    // Fabric может догружать blob после await — откладываем revoke
    setTimeout(() => URL.revokeObjectURL(url), 750);
  }
}

async function addImageUrlToCanvas(canvas: Canvas, url: string): Promise<void> {
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
  const maxW = canvas.width! * 0.6;
  const maxH = canvas.height! * 0.6;
  const scale = Math.min(
    img.width! > maxW ? maxW / img.width! : 1,
    img.height! > maxH ? maxH / img.height! : 1,
  );
  img.set({
    left: canvas.width! / 2 - (img.width! * scale) / 2,
    top: canvas.height! / 2 - (img.height! * scale) / 2,
    scaleX: scale,
    scaleY: scale,
  });
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
}

function duplicateActiveObjects(canvas: Canvas, afterDone: () => void): void {
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  const copies: Parameters<typeof canvas.add>[0][] = [];
  let pending = active.length;
  active.forEach((obj) => {
    obj.clone().then((cloned: typeof obj) => {
      cloned.set({ left: (cloned.left ?? 0) + 16, top: (cloned.top ?? 0) + 16 });
      copies.push(cloned);
      pending--;
      if (pending === 0) {
        canvas.discardActiveObject();
        copies.forEach((c) => canvas.add(c));
        canvas.requestRenderAll();
        afterDone();
      }
    });
  });
}

/** Удалить объект с канваса или из родительской группы (canvas.remove только для потомков корня). */
function detachFabricObject(canvas: Canvas, obj: FabricObject): void {
  const parent = obj.group;
  if (parent) {
    parent.remove(obj);
    parent.set({ dirty: true });
    parent.setCoords();
  } else {
    canvas.remove(obj);
  }
}

/** Снимок трансформа без позиции. origin не копируем — заполненная группа всегда LT, иначе setXY по углу рамки даёт артефакты при center/center у плейсхолдера. */
function snapshotPhotoFieldTransformNoPosition(field: FabricObject): Record<string, unknown> {
  return {
    angle: field.angle ?? 0,
    scaleX: field.scaleX ?? 1,
    scaleY: field.scaleY ?? 1,
    skewX: field.skewX ?? 0,
    skewY: field.skewY ?? 0,
    flipX: !!field.flipX,
    flipY: !!field.flipY,
    opacity: field.opacity ?? 1,
    originX: 'left',
    originY: 'top',
  };
}

/** Левый верх рамки поля на сцене — по серому rect пустого поля или fallback. */
function resolvePhotoFieldFrameSceneTL(field: FabricObject): Point {
  const emptyRect = pickEmptyPhotoFieldFrameRect(field);
  if (emptyRect) {
    const c = emptyRect.getCoords();
    if (c.length >= 1) return c[0]!;
  }
  if (field.type === 'group') {
    const inner = (field as Group).getObjects()[0];
    if (inner?.type === 'rect') {
      const c = inner.getCoords();
      if (c.length >= 1) return c[0]!;
    }
  }
  const c = field.getCoords();
  if (c.length >= 1) return c[0]!;
  const br = field.getBoundingRect();
  return new Point(br.left, br.top);
}

/** Заполняет поле для фото: вписывание без искажений (по умолчанию cover со скрытой частью за клипом; явно contain — целиком в рамке). */
async function fillPhotoField(
  canvas: Canvas,
  field: FabricObject,
  file: File,
  afterFill?: () => void,
): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const f = field as unknown as AnyObj;
    const rawId = f.id;
    const idCandidate =
      rawId != null && String(rawId).trim() !== '' ? String(rawId) : undefined;
    const { fw, fh } = resolvePhotoFieldFrameSize(field);
    const fitMode = resolvePhotoFieldFitMode(f);
    const panX = Number(f.photoFieldPanX ?? 0);
    const panY = Number(f.photoFieldPanY ?? 0);

    const anchorSceneTL = resolvePhotoFieldFrameSceneTL(field);
    const placementSnap = snapshotPhotoFieldTransformNoPosition(field);

    const parent = field.group;
    const stackIndex =
      parent != null ? parent.getObjects().indexOf(field) : -1;

    detachFabricObject(canvas, field);

    const { iw, ih } = getFabricImageIntrinsicSize(img);

    const group = buildFilledPhotoFieldGroup({
      left: 0,
      top: 0,
      frameW: fw,
      frameH: fh,
      intrinsicW: iw,
      intrinsicH: ih,
      image: img,
      id: idCandidate ?? `field-${Date.now()}`,
      panX,
      panY,
      fitMode,
    });

    if (parent != null && stackIndex >= 0) {
      parent.insertAt(stackIndex, group);
      parent.set({ dirty: true });
      parent.setCoords();
    } else if (parent != null) {
      parent.add(group);
      parent.set({ dirty: true });
      parent.setCoords();
    } else {
      canvas.add(group);
    }
    const syncPlacement = (): void => {
      group.set(placementSnap as Parameters<typeof group.set>[0]);
      group.setXY(anchorSceneTL, 'left', 'top');
      group.setCoords();
      syncFilledPhotoFieldSceneAnchor(group, anchorSceneTL);
      applyPhotoFieldPanToGroup(group, panX, panY);
      parent?.setCoords();
      canvas.requestRenderAll();
    };
    syncPlacement();
    queueMicrotask(syncPlacement);
    requestAnimationFrame(syncPlacement);
    canvas.setActiveObject(group);
    afterFill?.();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 750);
  }
}

