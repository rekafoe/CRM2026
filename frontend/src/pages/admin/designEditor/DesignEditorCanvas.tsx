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
  ActiveSelection,
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
} from './constants';
import type { TextBlockPresetKind } from './constants';
import { isLikelyImageFile, looksLikeHttpUrl } from '../../../utils/imageFile';
import { reloadFabricCanvasFonts } from '../../../utils/fabricFontReload';
import { createSmartGuideSession, resolveSmartGuideSnapAtPointer } from './smartGuides/snapSession';
import type { SmartGuidePointer, SmartGuideSession } from './smartGuides/types';
import { splitSpreadCanvasToPagesSync } from './spreadCanvas';
import { PrepressOverlay } from './PrepressOverlay';
import {
  applyPhotoFieldPanToGroup,
  bakeEmptyPhotoFieldScaleInPlace,
  bakeFilledPhotoFieldScaleInPlace,
  buildFilledPhotoFieldGroup,
  ensurePhotoFieldStaticLayout,
  restoreBakedPhotoFieldDimensions,
  getFabricImageIntrinsicSize,
  getFilledPhotoCropContext,
  resolvePhotoFieldFitMode,
  resolvePhotoFieldFrameSize,
} from './photoFieldFit';
import {
  pickEmptyPhotoFieldFrameRect,
  syncFilledPhotoFieldSceneAnchor,
} from './photoFieldGeometry';
import { resolvePhotoFieldSizeForPage } from './photoFieldClientSizing';
import { createEmptyPhotoField, finalizeEmptyPhotoFieldPlacement } from './photoFieldEmpty';
import { PhotoFieldCropModal } from './PhotoFieldCropModal';
import { PhotoFieldFillOverlay } from './PhotoFieldFillOverlay';
import { cropSpreadThumbnail } from './cropSpreadThumbnail';
import {
  EditorInAppFieldSheets,
  type PhotoPickSheetState,
  type TextEditSheetState,
} from './EditorInAppFieldSheets';
import { isRestrictiveInAppBrowser, shouldPreferTextEditSheet } from './inAppBrowser';
import {
  applyTextSelectionChrome,
  applyPhotoFieldSelectionChrome,
  isTextLikeFabricObject,
} from './designEditorTextChrome';
import {
  bakeTextObjectScaleInPlace,
  captureTextScaleDraft,
  type TextScaleBakeDraft,
} from './designEditorTextScale';
import { createClientTextbox } from './designEditorClientText';
import { resolveTextFillHintAfterEdit } from './designEditorTextPlaceholder';
import { findPhotoFieldAtScene, findTextAtScene } from './photoFieldHitTest';
import {
  clearPhotoFieldDropHighlight,
  createPhotoFieldDropHighlightState,
  updatePhotoFieldDropHighlight,
} from './photoFieldDropHighlight';
import {
  fabricDeserializeReviver,
  loadDesignPageScene,
  loadSpreadMergedScene,
} from './designPageLoader';
import {
  applyFormatToTextField,
  dehydrateTextObjectsInFabricJSON,
  finishTextEditOnObject,
  prepareTextObjectsOnCanvas,
  stripFabricStylesForEditing,
  type TextStyleRun,
} from './textStyleRuns';
import { createPageTransitionGate } from './pageTransitionGate';
import {
  CanvasHistoryStack,
  addImageFileToCanvas,
  addImageUrlToCanvas,
  applyBasicModeConstraints,
  bakeClientPhotoFieldIfNeeded,
  beginTextEditingOnCanvas,
  canDeleteObjectInBasicMode,
  canDuplicateObjectInBasicMode,
  canKeyboardTransformObject,
  canvasToJSON,
  clearFilledPhotoField,
  deletePhotoFieldTargetInBasicMode,
  duplicateActiveObjects,
  fillPhotoField,
  findDesignObjectByIdDeep,
  findPhotoFieldByIdDeep,
  getObjProps,
  isBasicDecorShape,
  isClientAddedPhotoField,
  isCoarsePointerEnvironment,
  isCoarsePointerEvent,
  isMobileTextInputEnvironment,
  isTextLikeObject,
  keepGrabPointAlignedWithSnap,
  lockTextInlineEditing,
  moveActiveObjectsByKeyboard,
  normalizeTextForDisplay,
  normalizeTextForFabric,
  parsePageLoadKey,
  pinFabricHiddenTextarea,
  releaseBasicModeConstraints,
  resolveClientPhotoFieldId,
  resolveInteractiveTargetAtScene,
  resolveKeyboardNudgePx,
  getKeyboardTargetObjects,
  resolvePhotoFieldTarget,
  scenePointFromInteractionEvent,
  scenePointToClient,
  wrapLegacyFilledPhotoImage,
  asAny,
  CLIPBOARD_PASTE_OFFSET_PX,
  cloneFabricObjects,
  activateClonedObjects,
  detachFabricObject,
} from './canvas';
import { registerCanvasEventHandlers } from './canvas/registerCanvasEventHandlers';
import type { AnyObj } from './canvas/canvasUtils';
import type { EditorMode, ResolveImageFileUrl } from './canvas/types';

export type { EditorMode } from './canvas/types';

// ─── Public handle exposed via forwardRef ────────────────────────────────────

/** Результат сохранения текущего вида холста (одна страница или пара разворота). */
export type SavePageResult =
  | { kind: 'single'; json: Record<string, unknown> }
  | { kind: 'spread'; left: Record<string, unknown>; right: Record<string, unknown> };

export interface DesignEditorCanvasHandle {
  undo: () => void;
  redo: () => void;
  focusDesignObject: (id: string, options?: { editText?: boolean }) => boolean;
  replacePhotoField: (id: string) => boolean;
  clearPhotoField: (id: string) => boolean;
  deleteSelected: () => void;
  /** Компенсация CSS fit-zoom, чтобы маркеры выделения были читаемы на экране */
  setSelectionDisplayScale: (scale: number) => void;
  duplicateSelected: () => void;
  addText: () => void;
  /** Текст с пресетом размера (заголовок / подзаголовок / обычный) */
  addTextPreset: (kind: TextBlockPresetKind) => void;
  addImageFromFile: (file: File) => Promise<void>;
  addImageFromUrl: (url: string) => Promise<void>;
  fillPhotoFieldFromFile: (id: string, file: File) => Promise<boolean>;
  fillPhotoFieldFromUrl: (id: string, url: string, originalName?: string) => Promise<boolean>;
  addPhotoField: (options?: {
    width?: number;
    height?: number;
    aspectW?: number;
    aspectH?: number;
  }) => void;
  /** Создаёт набор пустых полей для фото по шаблону коллажа. */
  applyCollageLayout: (layout: CollageLayout, paddingPercent: number) => void;
  /** Подставляет свободные изображения на макете в пустые поля для фото (по порядку объектов). */
  autofillPhotoFields: () => Promise<void>;
  addShape: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
  getDataURL: (opts?: { multiplier?: number }) => string;
  saveCurrentPage: () => Promise<SavePageResult>;
  /** Загрузка одной страницы в узкий холст (экспорт PDF и т.п.). */
  loadPageForExport: (pageData: DesignPage, pageIndex?: number) => Promise<void>;
  /** Восстановить ширину холста и контент после export (разворот или одна страница). */
  applyEditorViewState: (pagesOverride?: DesignPage[]) => Promise<void>;
  /** Пересчитать текст после document.fonts (кастомные шрифты CRM). */
  reloadTextFonts: () => Promise<void>;
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
  openTextEditSheetForActive: () => boolean;
  /** Inline-редактирование на холсте (клавиатура на мобилке). */
  beginTextEditingForActive: () => boolean;
  /** Дождаться завершения async-перехода страницы/разворота */
  whenPageTransitionIdle: () => Promise<void>;
  isPageTransitionBusy: () => boolean;
}

// ─── Props ───────────────────────────────────────────────────────────────────

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
  /** Optional upload hook: returns stable URL that is persisted in Fabric JSON instead of blob:. */
  resolveImageFileUrl?: ResolveImageFileUrl;
  /** basic: напоминание, если после правки текст пустой или шаблонный */
  onTextFillHint?: (message: string) => void;
  /** После завершения inline-правки текста — синхронизировать fabricJSON в pages для preflight */
  onTextEditCommitted?: () => void;
  /** Debounced: текущая страница canvas → pages[] (preflight / autosave) */
  onCanvasDocumentCommit?: () => void;
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
      resolveImageFileUrl,
      onTextFillHint,
      onTextEditCommitted,
      onCanvasDocumentCommit,
    },
    ref,
  ) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const historyRef = useRef(new CanvasHistoryStack());
    const isLoadingRef = useRef(false);
    const photoFieldBakeLockRef = useRef(false);
    /** Fabric сбрасывает scale до object:modified — размер с scaling сохраняем здесь. */
    const photoFieldResizeDraftRef = useRef<{ fieldId: string; fw: number; fh: number } | null>(null);
    /** true между object:scaling и bake на filled/empty client field (scale сбрасывается до modified). */
    const photoFieldScaleGestureRef = useRef(false);
    const textResizeDraftRef = useRef<TextScaleBakeDraft | null>(null);
    const photoFieldSkipBakeOnceRef = useRef<string | null>(null);
    const prevPageLoadKeyRef = useRef<string | null>(null);
    /** Блокирует синхронный resize по canvasWidthPx во время async split/load при смене pageLoadKey */
    const pageTransitionLockRef = useRef(false);
    const pageTransitionGateRef = useRef<ReturnType<typeof createPageTransitionGate> | null>(null);
    if (!pageTransitionGateRef.current) {
      pageTransitionGateRef.current = createPageTransitionGate();
    }
    const pageTransitionGate = pageTransitionGateRef.current;
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
    const resolveImageFileUrlRef = useRef(resolveImageFileUrl);
    resolveImageFileUrlRef.current = resolveImageFileUrl;
    const clipboardObjectsRef = useRef<FabricObject[]>([]);
    const textAnchorRafRef = useRef(0);
    const inlineTextEditSessionRef = useRef(false);
    const textEditBaselineRef = useRef<{ fieldId: string; text: string } | null>(null);
    const onTextFillHintRef = useRef(onTextFillHint);
    onTextFillHintRef.current = onTextFillHint;
    const onTextEditCommittedRef = useRef(onTextEditCommitted);
    onTextEditCommittedRef.current = onTextEditCommitted;
    const onCanvasDocumentCommitRef = useRef(onCanvasDocumentCommit);
    onCanvasDocumentCommitRef.current = onCanvasDocumentCommit;
    const documentCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleTextAnchorRef = useRef<(() => void) | null>(null);

    const scheduleCanvasDocumentCommit = useCallback(() => {
      if (!onCanvasDocumentCommitRef.current) return;
      if (documentCommitTimerRef.current) clearTimeout(documentCommitTimerRef.current);
      documentCommitTimerRef.current = setTimeout(() => {
        documentCommitTimerRef.current = null;
        if (isLoadingRef.current || pageTransitionLockRef.current) return;
        onCanvasDocumentCommitRef.current?.();
      }, 400);
    }, []);

    const captureTextEditBaseline = useCallback((target: FabricObject) => {
      const fieldId = String(asAny(target).id ?? '').trim();
      if (!fieldId) return;
      textEditBaselineRef.current = {
        fieldId,
        text: normalizeTextForDisplay(getObjProps(target).text),
      };
    }, []);

    const emitTextFillHintIfNeeded = useCallback((textBefore: string | undefined, textAfter: string | undefined) => {
      if (modeRef.current !== 'basic') return;
      const hint = resolveTextFillHintAfterEdit(textBefore, textAfter);
      if (hint) onTextFillHintRef.current?.(hint);
    }, []);

    const photoPickerTargetIdRef = useRef<string | null>(null);
    const photoFileInputRef = useRef<HTMLInputElement>(null);
    /** Последняя точка над холстом — для Ctrl+V во фото-поле (иначе попадало в addImage). */
    const photoPasteSceneRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [localSnapLines, setLocalSnapLines] = useState<{ axis: 'h' | 'v'; pos: number }[]>([]);
    const snapOverlayKeyRef = useRef('');
    const smartGuideSessionRef = useRef<SmartGuideSession | null>(null);
    const photoFieldDropHighlightRef = useRef(createPhotoFieldDropHighlightState());
    const selectionDisplayScaleRef = useRef(1);

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
      zoom: number;
      fitMode: 'cover' | 'contain';
    } | null>(null);
    const [photoPickSheet, setPhotoPickSheet] = useState<PhotoPickSheetState | null>(null);
    const [textEditSheet, setTextEditSheet] = useState<TextEditSheetState | null>(null);

    const [photoFieldFillLoading, setPhotoFieldFillLoading] = useState<{ progress: number } | null>(null);

    const reportPhotoFillProgress = useCallback((progress: number | null) => {
      if (progress == null) {
        setPhotoFieldFillLoading(null);
        return;
      }
      const clamped = Math.min(100, Math.max(0, Math.round(progress)));
      setPhotoFieldFillLoading({ progress: clamped });
    }, []);

    const openTextEditSheetForTarget = useCallback((target: FabricObject): boolean => {
      const canvas = fabricRef.current;
      if (!canvas || !isTextLikeObject(target)) return false;
      const fieldId = String(asAny(target).id ?? '').trim();
      if (!fieldId) return false;
      const active = canvas.getActiveObject();
      if (active && isTextLikeObject(active)) {
        const editing = active as IText;
        if (typeof editing.exitEditing === 'function' && (editing as unknown as AnyObj).isEditing) {
          editing.exitEditing();
        }
      }
      const props = getObjProps(target);
      const rawText = normalizeTextForDisplay(props.text);
      captureTextEditBaseline(target);
      setTextEditSheet({
        fieldId,
        label: rawText.trim() ? rawText.trim().slice(0, 28) : 'Текст',
        text: rawText,
        fontFamily: typeof props.fontFamily === 'string' ? props.fontFamily : 'Arial',
        fontSize: Math.round(Number(props.fontSize) || 24),
        fill: typeof props.fill === 'string' ? props.fill : '#111827',
      });
      canvas.setActiveObject(target);
      onSelectionChange(getObjProps(target));
      canvas.requestRenderAll();
      return true;
    }, [captureTextEditBaseline, onSelectionChange]);

    const openTextEditSheetRef = useRef(openTextEditSheetForTarget);
    openTextEditSheetRef.current = openTextEditSheetForTarget;


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
      const flags = historyRef.current.push(json);
      onHistoryChange(flags.canUndo, flags.canRedo);
      scheduleCanvasDocumentCommit();
    }, [onHistoryChange, scheduleCanvasDocumentCommit]);

    const fillPhotoFieldWithSnapshot = useCallback(
      async (canvas: Canvas, field: FabricObject, file: File): Promise<void> => {
        let changed = false;
        isLoadingRef.current = true;
        reportPhotoFillProgress(0);
        try {
          await fillPhotoField(
            canvas,
            field,
            file,
            (file, onProgress) =>
              resolveImageFileUrlRef.current?.(file, onProgress) ?? Promise.resolve(null),
            () => {
              if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
              else releaseBasicModeConstraints(canvas);
            },
            (value) => reportPhotoFillProgress(value),
          );
          reportPhotoFillProgress(96);
          changed = true;
        } finally {
          isLoadingRef.current = false;
          reportPhotoFillProgress(null);
        }
        if (changed) saveSnapshot();
      },
      [reportPhotoFillProgress, saveSnapshot],
    );

    const undo = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const target = historyRef.current.moveUndo();
      if (!target) return;
      isLoadingRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(target) as Record<string, unknown>, fabricDeserializeReviver);
        prepareTextObjectsOnCanvas(canvas.getObjects());
        canvas.requestRenderAll();
      } finally {
        isLoadingRef.current = false;
      }
      const flags = historyRef.current.flags();
      onHistoryChange(flags.canUndo, flags.canRedo);
    }, [onHistoryChange]);

    const redo = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const target = historyRef.current.moveRedo();
      if (!target) return;
      isLoadingRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(target) as Record<string, unknown>, fabricDeserializeReviver);
        prepareTextObjectsOnCanvas(canvas.getObjects());
        canvas.requestRenderAll();
      } finally {
        isLoadingRef.current = false;
      }
      const flags = historyRef.current.flags();
      onHistoryChange(flags.canUndo, flags.canRedo);
    }, [onHistoryChange]);

    // ── Canvas init (once) ───────────────────────────────────────────────────

    useEffect(() => {
      if (!canvasElRef.current) return;

      const canvas = new Canvas(canvasElRef.current, {
        width: canvasWidthPx,
        height: pageHeightPx,
        backgroundColor: 'white',
        preserveObjectStacking: true,
        selectionColor: 'rgba(37, 99, 235, 0.08)',
        selectionBorderColor: '#2563eb',
      });
      fabricRef.current = canvas;

      const unregisterCanvasHandlers = registerCanvasEventHandlers({
        canvas,
        canvasElRef,
        safeZonePx,
        pageHeightPx,
        onSelectionChange,
        saveSnapshot,
        undo,
        redo,
        fillPhotoFieldWithSnapshot,
        captureTextEditBaseline,
        emitTextFillHintIfNeeded,
        snapLinesSignature,
        setLocalSnapLines,
        setCropModal,
        setPhotoPickSheet,
        fabricRef,
        modeRef,
        isLoadingRef,
        photoFieldBakeLockRef,
        photoFieldResizeDraftRef,
        photoFieldScaleGestureRef,
        textResizeDraftRef,
        photoFieldSkipBakeOnceRef,
        spreadPairPagesRef,
        pageWidthRef,
        canvasWidthRef,
        guidesRef,
        snapLinesRef,
        onTextFloatingAnchorRef,
        onTextEditCommittedRef,
        resolveImageFileUrlRef,
        remoteUrlHandlerRef,
        getSidebarPhotoFileRef,
        onSidebarPhotoDroppedRef,
        clipboardObjectsRef,
        textAnchorRafRef,
        inlineTextEditSessionRef,
        textEditBaselineRef,
        scheduleTextAnchorRef,
        photoPickerTargetIdRef,
        photoFileInputRef,
        photoPasteSceneRef,
        snapOverlayKeyRef,
        smartGuideSessionRef,
        photoFieldDropHighlightRef,
        selectionDisplayScaleRef,
        openTextEditSheetRef,
      });

      return () => {
        unregisterCanvasHandlers();
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
      pageTransitionGate.begin();
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
              const spreadThumbs = await cropSpreadThumbnail(thumbUrl);
              pageThumbReadyRef.current?.(parsedPrev.left, spreadThumbs.left);
              pageThumbReadyRef.current?.(parsedPrev.right, spreadThumbs.right);
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
          historyRef.current.reset();
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
              leftPageIndex: parsedNext.left,
              rightPageIndex: parsedNext.right,
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
              pageIndex: parsedNext.index,
              template: templateRef.current,
              pageW: pw,
              pageH: ph,
              apiBaseUrl,
            });
          }

          if (pageLoadKeyRef.current !== targetKey) return;
          if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
          else lockTextInlineEditing(canvas);
          const snap = JSON.stringify(canvasToJSON(canvas));
          historyRef.current.reset(snap);

          const thumb = canvas.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 });
          if (parsedNext?.type === 'spread') {
            const spreadThumbs = await cropSpreadThumbnail(thumb);
            pageThumbReadyRef.current?.(parsedNext.left, spreadThumbs.left);
            pageThumbReadyRef.current?.(parsedNext.right, spreadThumbs.right);
          } else if (parsedNext?.type === 'single') {
            pageThumbReadyRef.current?.(parsedNext.index, thumb);
          }

          prevPageLoadKeyRef.current = targetKey;
        } finally {
          isLoadingRef.current = false;
          if (pageLoadKeyRef.current === targetKey) {
            pageTransitionLockRef.current = false;
          }
          pageTransitionGate.end();
        }
      })();

      return () => {
        pageTransitionLockRef.current = false;
        pageTransitionGate.end();
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
      if (mode === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
      else {
        releaseBasicModeConstraints(canvas);
        lockTextInlineEditing(canvas);
      }
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
          await fillPhotoFieldWithSnapshot(canvas, field, file);
          return;
        }
      }

      await addImageFileToCanvas(canvas, file, resolveImageFileUrlRef.current);
    }, []);

    // ── Imperative API ───────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      undo,
      redo,
      focusDesignObject: (id, options) => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const target = findDesignObjectByIdDeep(canvas, id);
        if (!target) return false;
        const selectableTarget = target.group ?? target;
        canvas.setActiveObject(selectableTarget);
        if (options?.editText && isTextLikeObject(selectableTarget)) {
          if (shouldPreferTextEditSheet(modeRef.current)) {
            openTextEditSheetForTarget(selectableTarget);
          } else if (!isCoarsePointerEnvironment()) {
            beginTextEditingOnCanvas(canvas, selectableTarget, inlineTextEditSessionRef, captureTextEditBaseline);
          }
        }
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(selectableTarget));
        scheduleTextAnchorRef.current?.();
        return true;
      },
      replacePhotoField: (id) => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        const selectableTarget = field.group ?? field;
        canvas.setActiveObject(selectableTarget);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(selectableTarget));
        if (isRestrictiveInAppBrowser()) {
          setPhotoPickSheet({ fieldId: id, label: 'Фото-поле' });
          return true;
        }
        photoPickerTargetIdRef.current = id;
        photoFileInputRef.current?.click();
        return true;
      },
      deleteSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const targets = canvas.getActiveObjects().filter((obj) => (
          modeRef.current === 'basic'
            ? canDeleteObjectInBasicMode(obj)
            : !asAny(obj).isBackground
        ));
        if (targets.length === 0) return;
        targets.forEach((obj) => {
          if (modeRef.current === 'basic' && (asAny(obj).isPhotoField || resolvePhotoFieldTarget(obj))) {
            deletePhotoFieldTargetInBasicMode(canvas, obj);
          } else {
            detachFabricObject(canvas, obj);
          }
        });
        canvas.discardActiveObject();
        if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        onSelectionChange(null);
        saveSnapshot();
      },
      clearPhotoField: (id) => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        const cleared = clearFilledPhotoField(canvas, field);
        if (!cleared) return false;
        if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(canvas.getActiveObject()!));
        saveSnapshot();
        return true;
      },
      setSelectionDisplayScale: (scale) => {
        const next = Number.isFinite(scale) && scale > 0 ? scale : 1;
        if (Math.abs(selectionDisplayScaleRef.current - next) < 0.01) return;
        selectionDisplayScaleRef.current = next;
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current !== 'basic') return;
        applyBasicModeConstraints(canvas, next);
        const active = canvas.getActiveObject();
        if (active) {
          active.setCoords();
          canvas.requestRenderAll();
        }
      },
      addText: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const text = modeRef.current === 'basic'
          ? createClientTextbox({
              text: 'Текст',
              pageWidthPx: pageWidthRef.current,
              pageHeightPx: pageHeightRef.current,
              safeZonePx,
              fontSize: 28,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#000000',
              centerInSafeZone: true,
            })
          : new IText('Текст', {
              left: canvas.width! / 2 - 40,
              top: canvas.height! / 2 - 15,
              fontSize: 28,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#000000',
            });
        canvas.add(text);
        canvas.setActiveObject(text);
        if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(text));
        saveSnapshot();
      },
      addTextPreset: (kind: TextBlockPresetKind) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const p = TEXT_BLOCK_PRESETS[kind];
        const text = modeRef.current === 'basic'
          ? createClientTextbox({
              text: p.defaultText,
              pageWidthPx: pageWidthRef.current,
              pageHeightPx: pageHeightRef.current,
              safeZonePx,
              fontSize: p.fontSize,
              fontWeight: p.fontWeight,
              lineHeight: p.lineHeight,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#111827',
              centerInSafeZone: true,
            })
          : new IText(p.defaultText, {
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
        if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(text));
        saveSnapshot();
      },
      addImageFromFile: async (file: File) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        await addImageFileToCanvas(canvas, file, resolveImageFileUrlRef.current);
      },
      fillPhotoFieldFromFile: async (id: string, file: File) => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        await fillPhotoFieldWithSnapshot(canvas, field, file);
        return true;
      },
      fillPhotoFieldFromUrl: async (id: string, url: string, originalName?: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        const response = await fetch(url);
        if (!response.ok) return false;
        const blob = await response.blob();
        const contentType = blob.type || 'image/jpeg';
        const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const file = new File([blob], originalName || `photo-field-${Date.now()}.${ext}`, { type: contentType });
        await fillPhotoFieldWithSnapshot(canvas, field, file);
        return true;
      },
      addPhotoField: (options) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const pair = spreadPairPagesRef.current;
        const pageSafeLeft = pair && currentPageRef.current === pair[1] ? pageWidthRef.current : 0;
        const safeLeft = pageSafeLeft + safeZonePx;
        const safeTop = safeZonePx;
        const safeWidth = Math.max(1, pageWidthRef.current - safeZonePx * 2);
        const safeHeight = Math.max(1, canvas.height! - safeZonePx * 2);

        let width: number;
        let height: number;
        const aspectW = Number(options?.aspectW);
        const aspectH = Number(options?.aspectH);
        if (Number.isFinite(aspectW) && aspectW > 0 && Number.isFinite(aspectH) && aspectH > 0) {
          ({ width, height } = resolvePhotoFieldSizeForPage({
            aspectW,
            aspectH,
            pageWidthPx: pageWidthRef.current,
            pageHeightPx: pageHeightRef.current,
            safeZonePx,
          }));
        } else if (options?.width != null && options?.height != null) {
          width = Math.max(32, Number(options.width) || 32);
          height = Math.max(32, Number(options.height) || width);
        } else {
          ({ width, height } = resolvePhotoFieldSizeForPage({
            aspectW: 1,
            aspectH: 1,
            pageWidthPx: pageWidthRef.current,
            pageHeightPx: pageHeightRef.current,
            safeZonePx,
          }));
        }

        const fieldId = `field-${Date.now()}`;
        const fieldLeft = safeLeft + (safeWidth - width) / 2;
        const fieldTop = safeTop + (safeHeight - height) / 2;
        const field = createEmptyPhotoField({
          id: fieldId,
          left: fieldLeft,
          top: fieldTop,
          width,
          height,
          clientAdded: true,
        });
        photoFieldSkipBakeOnceRef.current = fieldId;
        canvas.add(field);
        finalizeEmptyPhotoFieldPlacement(field as Group, { x: fieldLeft, y: fieldTop });
        canvas.setActiveObject(field);
        if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(field));
        saveSnapshot();
      },
      applyCollageLayout: (layout: CollageLayout, paddingPercent: number) => {
        const canvas = fabricRef.current;
        if (!canvas || modeRef.current === 'basic') return;
        const cells = Array.isArray(layout.cells) ? layout.cells : [];
        if (cells.length === 0) return;

        const pair = spreadPairPagesRef.current;
        const pageSafeLeft = pair && currentPageRef.current === pair[1] ? pageWidthRef.current : 0;
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
            const left = safeLeft + (margin + x * scale) * safeWidth;
            const top = safeTop + (margin + y * scale) * safeHeight;
            return {
              field: createEmptyPhotoField({
                id: `field-${stamp}-${index}`,
                left,
                top,
                width: Math.max(24, w * scale * safeWidth),
                height: Math.max(24, h * scale * safeHeight),
              }),
              anchor: { x: left, y: top },
            };
          });

        canvas.add(...fields.map((entry) => entry.field));
        for (const entry of fields) {
          finalizeEmptyPhotoFieldPlacement(entry.field as Group, entry.anchor);
        }
        canvas.discardActiveObject();
        canvas.setActiveObject(fields[0]!.field);
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
          /* Пустая рамка (rect/group) или старый макет: одно image с флагом */
          return o.type === 'rect' || o.type === 'group' || o.type === 'image';
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
          await fillPhotoFieldWithSnapshot(canvas, field, file);
          if (src.canvas === canvas) canvas.remove(src);
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      },
      addShape: (type) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
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
        if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(obj));
        saveSnapshot();
      },
      getDataURL: (opts) =>
        fabricRef.current?.toDataURL({ format: 'png', multiplier: opts?.multiplier ?? 2 }) ?? '',
      saveCurrentPage: async (): Promise<SavePageResult> => {
        await pageTransitionGate.waitUntilIdle();
        const canvas = fabricRef.current;
        if (!canvas) return { kind: 'single', json: {} };
        const pw = pageWidthRef.current;
        clearPhotoFieldDropHighlight(canvas, photoFieldDropHighlightRef.current);
        if (spreadPairPagesRef.current) {
          const { left, right } = splitSpreadCanvasToPagesSync(canvas, pw);
          return { kind: 'spread', left, right };
        }
        return { kind: 'single', json: canvasToJSON(canvas) };
      },
      loadPageForExport: async (pageData: DesignPage, pageIndex = 0) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const pw = pageWidthRef.current;
        const ph = pageHeightRef.current;
        clearPhotoFieldDropHighlight(canvas, photoFieldDropHighlightRef.current);
        isLoadingRef.current = true;
        try {
          canvas.setDimensions({ width: pw, height: ph });
          await loadDesignPageScene({
            canvas,
            pageData,
            pageIndex,
            template: templateRef.current,
            pageW: pw,
            pageH: ph,
            apiBaseUrl,
          });
          if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
          canvas.requestRenderAll();
        } finally {
          isLoadingRef.current = false;
        }
      },
      reloadTextFonts: async () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        await reloadFabricCanvasFonts(canvas);
      },
      applyEditorViewState: async (pagesOverride?: DesignPage[]) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        clearPhotoFieldDropHighlight(canvas, photoFieldDropHighlightRef.current);
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
              leftPageIndex: pair[0],
              rightPageIndex: pair[1],
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
              pageIndex: key.index,
              template: templateRef.current,
              pageW: pw,
              pageH: ph,
              apiBaseUrl,
            });
          }
          if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
          canvas.requestRenderAll();
          if (pagesOverride) {
            const snap = JSON.stringify(canvasToJSON(canvas));
            historyRef.current.reset(snap);
            onHistoryChange(false, false);
          }
        } finally {
          isLoadingRef.current = false;
        }
      },
      duplicateSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        duplicateActiveObjects(canvas, modeRef.current, saveSnapshot, selectionDisplayScaleRef.current);
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
        if (!active || !isTextLikeObject(active)) return;
        applyFormatToTextField(active as IText & { textStyleRuns?: TextStyleRun[] }, { [key]: value });
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      setTextStyle: (props: { fontWeight?: string; fontStyle?: string }) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return;
        applyFormatToTextField(active as IText & { textStyleRuns?: TextStyleRun[] }, props);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      applyTextPropsToSelection: (props: Record<string, unknown>) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return;
        const next: Record<string, unknown> = { ...props };
        if (next.shadow != null && typeof next.shadow === 'object' && !(next.shadow instanceof Shadow)) {
          next.shadow = new Shadow(next.shadow as object);
        }
        applyFormatToTextField(active as IText & { textStyleRuns?: TextStyleRun[] }, next);
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
        if (modeRef.current === 'basic') {
          applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
        }
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
      openTextEditSheetForActive: () => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return false;
        return openTextEditSheetForTarget(active);
      },
      beginTextEditingForActive: () => {
        const canvas = fabricRef.current;
        if (!canvas) return false;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return false;
        if (shouldPreferTextEditSheet(modeRef.current)) {
          return openTextEditSheetForTarget(active);
        }
        if (isCoarsePointerEnvironment()) {
          return true;
        }
        beginTextEditingOnCanvas(canvas, active, inlineTextEditSessionRef, captureTextEditBaseline);
        return true;
      },
      whenPageTransitionIdle: () => pageTransitionGate.waitUntilIdle(),
      isPageTransitionBusy: () => pageTransitionGate.isBusy(),
    }));


    const applyPhotoFileToTarget = useCallback(async (fieldId: string, file: File) => {
      const canvas = fabricRef.current;
      if (!canvas || !isLikelyImageFile(file)) return;
      const field = findPhotoFieldByIdDeep(canvas, fieldId);
      if (!field) return;
      await fillPhotoFieldWithSnapshot(canvas, field, file);
    }, [fillPhotoFieldWithSnapshot]);

    const handleInAppPhotoSelected = useCallback(async (file: File) => {
      const fieldId = photoPickSheet?.fieldId ?? photoPickerTargetIdRef.current;
      if (!fieldId) return;
      setPhotoPickSheet(null);
      photoPickerTargetIdRef.current = null;
      await applyPhotoFileToTarget(fieldId, file);
    }, [photoPickSheet, applyPhotoFileToTarget]);

    const handleInAppTextClose = useCallback(() => {
      textEditBaselineRef.current = null;
      setTextEditSheet(null);
    }, []);

    const handleInAppTextSave = useCallback((text: string) => {
      const canvas = fabricRef.current;
      if (!canvas || !textEditSheet) return;
      const textBefore = textEditSheet.text;
      const target = findDesignObjectByIdDeep(canvas, textEditSheet.fieldId);
      if (!target || !isTextLikeObject(target)) {
        textEditBaselineRef.current = null;
        setTextEditSheet(null);
        return;
      }
      const textObj = target as IText;
      textObj.set('text', normalizeTextForFabric(text));
      finishTextEditOnObject(textObj, textBefore);
      canvas.setActiveObject(textObj);
      canvas.requestRenderAll();
      onSelectionChange(getObjProps(textObj));
      saveSnapshot();
      scheduleTextAnchorRef.current?.();
      emitTextFillHintIfNeeded(textBefore, normalizeTextForDisplay(text));
      textEditBaselineRef.current = null;
      setTextEditSheet(null);
    }, [emitTextFillHintIfNeeded, textEditSheet, onSelectionChange, saveSnapshot]);

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
          {photoFieldFillLoading && (
            <PhotoFieldFillOverlay progress={photoFieldFillLoading.progress} />
          )}
        </div>
        <input
          ref={photoFileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="visually-hidden-file-input"
          aria-hidden
          tabIndex={-1}
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
            initialZoom={cropModal.zoom}
            fitMode={cropModal.fitMode}
            onClose={() => setCropModal(null)}
            onApply={(panX, panY, zoom) => {
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
                if (hit.type === 'group') applyPhotoFieldPanToGroup(hit as Group, panX, panY, zoom);
                if (modeRef.current === 'basic') applyBasicModeConstraints(c);
                else releaseBasicModeConstraints(c);
                c.requestRenderAll();
                saveSnapshot();
              })();
            }}
            onReplaceFile={() => {
              const id = cropModal.fieldId;
              setCropModal(null);
              if (isRestrictiveInAppBrowser()) {
                setPhotoPickSheet({ fieldId: id, label: 'Фото-поле' });
                return;
              }
              photoPickerTargetIdRef.current = id;
              photoFileInputRef.current?.click();
            }}
          />
        )}
        <EditorInAppFieldSheets
          photoPick={photoPickSheet}
          textEdit={textEditSheet}
          onPhotoClose={() => setPhotoPickSheet(null)}
          onPhotoSelected={(file) => void handleInAppPhotoSelected(file)}
          onTextClose={handleInAppTextClose}
          onTextSave={handleInAppTextSave}
        />
      </div>
    );
  },
);

DesignEditorCanvas.displayName = 'DesignEditorCanvas';
