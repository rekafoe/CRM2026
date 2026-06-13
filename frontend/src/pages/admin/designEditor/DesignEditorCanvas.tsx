import './fabricDesignSerialization';
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback,
} from 'react';
import type { Canvas, FabricObject } from 'fabric';
import type { CollageLayout, DesignTemplate } from '../../../api';
import type { DesignPage, SelectedObjProps } from './types';
import { SIDEBAR_PHOTO_DRAG_MIME } from './constants';
import type { TextBlockPresetKind } from './constants';
import { createSmartGuideSession } from './smartGuides/snapSession';
import type { SmartGuideSession } from './smartGuides/types';
import {
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
import {
  EditorInAppFieldSheets,
  type PhotoPickSheetState,
  type TextEditSheetState,
} from './EditorInAppFieldSheets';
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
import { findPhotoFieldAtScene, findTextAtScene } from './photoFieldHitTest';
import {
  clearPhotoFieldDropHighlight,
  createPhotoFieldDropHighlightState,
  updatePhotoFieldDropHighlight,
} from './photoFieldDropHighlight';
import { loadDesignPageScene, loadSpreadMergedScene } from './designPageLoader';
import { createPageTransitionGate } from './pageTransitionGate';
import {
  CanvasHistoryStack,
} from './canvas';
import { createDesignEditorCanvasHandle } from './canvas/createDesignEditorCanvasHandle';
import { useDesignEditorInAppFieldHandlers } from './canvas/useDesignEditorInAppFieldHandlers';
import { useDesignEditorPhotoFileInput } from './canvas/useDesignEditorPhotoFileInput';
import { useDesignEditorRuntimeEffects } from './canvas/useDesignEditorRuntimeEffects';
import { useDesignEditorTextSheets } from './canvas/useDesignEditorTextSheets';
import { useDesignEditorCanvasSetup } from './canvas/useDesignEditorCanvasSetup';
import { useDesignEditorCanvasHistory } from './canvas/useDesignEditorCanvasHistory';
import { usePageLoadKeyEffect } from './canvas/usePageLoadKeyEffect';
import {
  DesignEditorCanvasView,
  type DesignEditorCanvasCropModalState,
} from './DesignEditorCanvasView';
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
  addText: () => Promise<void>;
  /** Текст с пресетом размера (заголовок / подзаголовок / обычный) */
  addTextPreset: (kind: TextBlockPresetKind) => Promise<void>;
  addImageFromFile: (file: File) => Promise<void>;
  addImageFromUrl: (url: string) => Promise<void>;
  fillPhotoFieldFromFile: (id: string, file: File) => Promise<boolean>;
  fillPhotoFieldFromUrl: (id: string, url: string, originalName?: string) => Promise<boolean>;
  addPhotoField: (options?: {
    width?: number;
    height?: number;
    aspectW?: number;
    aspectH?: number;
  }) => Promise<void>;
  /** Создаёт набор пустых полей для фото по шаблону коллажа. */
  applyCollageLayout: (layout: CollageLayout, paddingPercent: number) => void;
  /** Подставляет свободные изображения на макете в пустые поля для фото (по порядку объектов). */
  autofillPhotoFields: () => Promise<void>;
  addShape: (type: 'rect' | 'circle' | 'line' | 'triangle') => Promise<void>;
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
  /** Lifecycle страницы/разворота: true на start, false на end transition. */
  onPageTransitionBusyChange?: (busy: boolean) => void;
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
      onPageTransitionBusyChange,
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
    const canvasInstanceRef = useRef(0);
    const loadedPageForInstanceRef = useRef(0);
    const [canvasReady, setCanvasReady] = useState(false);
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
    const onTextFillHintRef = useRef(onTextFillHint);
    onTextFillHintRef.current = onTextFillHint;
    const onTextEditCommittedRef = useRef(onTextEditCommitted);
    onTextEditCommittedRef.current = onTextEditCommitted;
    const onCanvasDocumentCommitRef = useRef(onCanvasDocumentCommit);
    onCanvasDocumentCommitRef.current = onCanvasDocumentCommit;
    const onPageTransitionBusyChangeRef = useRef(onPageTransitionBusyChange);
    onPageTransitionBusyChangeRef.current = onPageTransitionBusyChange;
    const documentCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleTextAnchorRef = useRef<(() => void) | null>(null);

    const photoPickerTargetIdRef = useRef<string | null>(null);
    const photoFileInputRef = useRef<HTMLInputElement>(null);
    /** Последняя точка над холстом — для Ctrl+V во фото-поле (иначе попадало в addImage). */
    const photoPasteSceneRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [localSnapLines, setLocalSnapLines] = useState<{ axis: 'h' | 'v'; pos: number }[]>([]);
    const snapOverlayKeyRef = useRef('');
    const smartGuideSessionRef = useRef<SmartGuideSession | null>(null);
    const photoFieldDropHighlightRef = useRef(createPhotoFieldDropHighlightState());
    const selectionDisplayScaleRef = useRef(1);

    const [cropModal, setCropModal] = useState<DesignEditorCanvasCropModalState | null>(null);
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

    const {
      textEditBaselineRef,
      captureTextEditBaseline,
      emitTextFillHintIfNeeded,
      openTextEditSheetForTarget,
      openTextEditSheetRef,
    } = useDesignEditorTextSheets({
      fabricRef,
      modeRef,
      onTextFillHintRef,
      setTextEditSheet,
      onSelectionChange,
    });

    const snapLinesSignature = useCallback((lines: { axis: 'h' | 'v'; pos: number }[]) => {
      if (lines.length === 0) return '';
      return [...lines]
        .sort((a, b) => (a.axis === b.axis ? a.pos - b.pos : a.axis.localeCompare(b.axis)))
        .map((l) => `${l.axis}:${l.pos.toFixed(2)}`)
        .join(';');
    }, []);

    const {
      saveSnapshot,
      fillPhotoFieldWithSnapshot,
      undo,
      redo,
    } = useDesignEditorCanvasHistory({
      fabricRef,
      historyRef,
      isLoadingRef,
      pageTransitionLockRef,
      onCanvasDocumentCommitRef,
      documentCommitTimerRef,
      pageWidthRef,
      pageHeightRef,
      modeRef,
      selectionDisplayScaleRef,
      resolveImageFileUrlRef,
      reportPhotoFillProgress,
      onHistoryChange,
    });

    useDesignEditorCanvasSetup({
      canvasElRef,
      canvasWidthPx,
      pageHeightPx,
      canvasInstanceRef,
      prevPageLoadKeyRef,
      loadedPageForInstanceRef,
      setCanvasReady,
      safeZonePx,
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

    usePageLoadKeyEffect({
      fabricRef,
      canvasReady,
      pageLoadKey,
      apiBaseUrl,
      setPages,
      onHistoryChange,
      pageTransitionGate,
      prevPageLoadKeyRef,
      canvasInstanceRef,
      loadedPageForInstanceRef,
      pageTransitionLockRef,
      pageLoadKeyRef,
      pagesRef,
      pageWidthRef,
      pageHeightRef,
      templateRef,
      modeRef,
      isLoadingRef,
      historyRef,
      pageThumbReadyRef,
      selectionDisplayScaleRef,
    });

    useEffect(() => pageTransitionGate.subscribe((busy) => {
      onPageTransitionBusyChangeRef.current?.(busy);
    }), [pageTransitionGate]);

    useDesignEditorRuntimeEffects({
      fabricRef,
      pageTransitionLockRef,
      canvasWidthPx,
      pageHeightPx,
      mode,
      selectionDisplayScaleRef,
    });

    const handlePhotoFileChange = useDesignEditorPhotoFileInput({
      fabricRef,
      photoPickerTargetIdRef,
      resolveImageFileUrlRef,
      fillPhotoFieldWithSnapshot,
    });

    useImperativeHandle(ref, () => createDesignEditorCanvasHandle({
      fabricRef,
      historyRef,
      isLoadingRef,
      pageTransitionGate,
      spreadPairPagesRef,
      pageWidthRef,
      pageHeightRef,
      currentPageRef,
      pagesRef,
      pageLoadKeyRef,
      templateRef,
      modeRef,
      selectionDisplayScaleRef,
      photoPickerTargetIdRef,
      photoFileInputRef,
      photoFieldSkipBakeOnceRef,
      photoFieldDropHighlightRef,
      inlineTextEditSessionRef,
      scheduleTextAnchorRef,
      resolveImageFileUrlRef,
      safeZonePx,
      apiBaseUrl,
      undo,
      redo,
      saveSnapshot,
      fillPhotoFieldWithSnapshot,
      openTextEditSheetForTarget,
      captureTextEditBaseline,
      setPhotoPickSheet,
      onSelectionChange,
      onZoomChange,
      onHistoryChange,
    }));

    const {
      handleInAppPhotoSelected,
      handleInAppTextClose,
      handleInAppTextSave,
      handleCropApply,
      handleCropReplaceFile,
    } = useDesignEditorInAppFieldHandlers({
      fabricRef,
      photoPickSheet,
      setPhotoPickSheet,
      cropModal,
      setCropModal,
      textEditSheet,
      setTextEditSheet,
      textEditBaselineRef,
      photoPickerTargetIdRef,
      photoFileInputRef,
      modeRef,
      selectionDisplayScaleRef,
      fillPhotoFieldWithSnapshot,
      saveSnapshot,
      emitTextFillHintIfNeeded,
      onSelectionChange,
    });

    return (
      <DesignEditorCanvasView
        canvasElRef={canvasElRef}
        photoFileInputRef={photoFileInputRef}
        showGuides={showGuides}
        canvasWidthPx={canvasWidthPx}
        pageWidthPx={pageWidthPx}
        pageHeightPx={pageHeightPx}
        bleedPx={bleedPx}
        safeZonePx={safeZonePx}
        spreadPairPages={spreadPairPages}
        showBleed={showBleed}
        showTrim={showTrim}
        showSafeZone={showSafeZone}
        localSnapLines={localSnapLines}
        photoFieldFillLoading={photoFieldFillLoading}
        cropModal={cropModal}
        photoPickSheet={photoPickSheet}
        textEditSheet={textEditSheet}
        onPhotoFileChange={handlePhotoFileChange}
        onCropClose={() => setCropModal(null)}
        onCropApply={handleCropApply}
        onCropReplaceFile={handleCropReplaceFile}
        onPhotoPickClose={() => setPhotoPickSheet(null)}
        onPhotoSelected={(file) => void handleInAppPhotoSelected(file)}
        onTextClose={handleInAppTextClose}
        onTextSave={handleInAppTextSave}
      />
    );
  },
);

DesignEditorCanvas.displayName = 'DesignEditorCanvas';

