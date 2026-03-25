import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert, Button } from '../../components/common';
import {
  getDesignTemplate,
  uploadOrderFile,
  updateOrderItem,
  updateDesignTemplate,
  fetchImageFromUrl,
  type DesignTemplate,
} from '../../api';
import { filterLikelyImageFiles, isLikelyImageFile, looksLikeHttpUrl } from '../../utils/imageFile';
import { API_BASE_URL } from '../../config/constants';
import { Shadow } from 'fabric';
import {
  MM_TO_PX,
  SAFE_ZONE_MM,
  getExportPixelRatio,
  SIDEBAR_ITEMS,
  EMPTY_PAGE,
  type TextBlockPresetKind,
} from './designEditor/constants';
import { mergePagesWithSavedSnapshot, type PageSaveSnapshot } from './designEditor/mergePagesSnapshot';
import {
  patchAllTextInFabricJSON,
  extractUsedFontFamiliesFromPages,
} from './designEditor/patchFabricTextObjects';
import type {
  DesignPage,
  DesignState,
  SidebarSection,
  SelectedObjProps,
  SidebarPhotoItem,
  TextEffectsValues,
} from './designEditor/types';

const SIDEBAR_PHOTO_MAX = 500;
import { buildStripItems } from './designEditor/spreadUtils';
import { PageStrip } from './designEditor/PageStrip';
import { DesignEditorSidebar } from './designEditor/DesignEditorSidebar';
import { DesignEditorPanel } from './designEditor/DesignEditorPanel';
import { DesignEditorToolbar } from './designEditor/DesignEditorToolbar';
import {
  DesignEditorCanvas,
  type DesignEditorCanvasHandle,
  type EditorMode,
} from './designEditor/DesignEditorCanvas';
import { CanvasRulers, type GuideLine } from './designEditor/CanvasRulers';
import { ImagePickerModal } from '../../components/ImagePickerModal';
import { TextFloatingToolbar } from './designEditor/TextFloatingToolbar';
import '../../styles/admin-page-layout.css';
import './DesignEditorPage.css';

export const DesignEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const orderId = parseInt(searchParams.get('orderId') ?? '0', 10);
  const orderItemId = parseInt(searchParams.get('orderItemId') ?? '0', 10);
  const hasOrderContext = orderId > 0;
  const isMainAppRoute = location.pathname.startsWith('/design-editor/');
  const catalogPath = isMainAppRoute ? '/design-templates' : '/adminpanel/design-templates';

  /** Из заказа — сначала упрощённое заполнение; из каталога — полный редактор */
  const [editorMode, setEditorMode] = useState<EditorMode>(() =>
    hasOrderContext ? 'basic' : 'advanced',
  );

  // ── Template ────────────────────────────────────────────────────────────────
  const [templateState, setTemplateState] = useState<{
    template: DesignTemplate | null;
    loading: boolean;
    error: string | null;
  }>({ template: null, loading: true, error: null });

  const [saving, setSaving] = useState(false);

  // ── Pages / canvas state ────────────────────────────────────────────────────
  const [pages, setPages] = useState<DesignPage[]>([{ ...EMPTY_PAGE }]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedObj, setSelectedObj] = useState<SelectedObjProps | null>(null);
  /** Экранные координаты якоря плавающей панели текста (центр верхней границы bbox) */
  const [textFloatingAnchor, setTextFloatingAnchor] = useState<{ x: number; y: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);

  // ── Thumbnails (pageIndex → data URL) ──────────────────────────────────────
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const handlePageThumbReady = useCallback((pageIdx: number, dataUrl: string) => {
    setThumbnails((prev) => ({ ...prev, [pageIdx]: dataUrl }));
  }, []);

  // ── Spread mode ─────────────────────────────────────────────────────────────
  const [spreadMode, setSpreadMode] = useState(false);
  const [coverPages, setCoverPages] = useState(1);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [showRulers, setShowRulers] = useState(true);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [snapLines, setSnapLines] = useState<{ axis: 'h' | 'v'; pos: number }[]>([]);

  // ── fit-zoom: CSS-масштаб, чтобы вписать холст в контейнер ─────────────────
  const [fitZoom, setFitZoom] = useState(1);
  const [rulerOrigin, setRulerOrigin] = useState({ x: 0, y: 0 });

  // ── Page spec (scale=1 — натуральный размер; fitZoom вписывает в экран) ─────
  const [pageSpec, setPageSpec] = useState({
    pageWidth: 90,
    pageHeight: 55,
    pageCount: 1,
    scale: 1,
  });
  const { pageWidth, pageHeight, pageCount, scale } = pageSpec;
  const pageW = Math.round(pageWidth * MM_TO_PX * scale);
  const pageH = Math.round(pageHeight * MM_TO_PX * scale);
  const safeZonePx = SAFE_ZONE_MM * MM_TO_PX * scale;

  /** Guide lines converted from mm (safe-zone-relative) to canvas px */
  const guideLinesPx = useMemo(
    () => guides.map((g) => ({
      axis: g.axis,
      pos: (g.posMM + SAFE_ZONE_MM) * MM_TO_PX * scale,
    })),
    [guides, scale],
  );

  const projectUsedFonts = useMemo(
    () => extractUsedFontFamiliesFromPages(pages),
    [pages],
  );

  // ── Spread view: вычисляем, какие страницы входят в текущий разворот ────────
  const stripItems = buildStripItems(pageCount, spreadMode, coverPages);
  const currentStripItem = stripItems.find((item) => item.pages.includes(currentPage));
  const isSpreadView = spreadMode && (currentStripItem?.pages.length ?? 1) === 2;

  // ── Пересчитываем fitZoom при изменении контейнера / формата / режима ────────
  useEffect(() => {
    const el = viewportRef.current ?? scrollAreaRef.current;
    if (!el || !pageW || !pageH) return;
    const contentW = isSpreadView ? pageW * 2 + 4 : pageW + 40;
    const contentH = pageH + (isSpreadView ? 50 : 40);
    const canvasPadX = isSpreadView ? 0 : 20;
    const canvasPadY = isSpreadView ? 0 : 20;
    const compute = () => {
      const aw = el.clientWidth;
      const ah = el.clientHeight;
      if (aw < 100 || ah < 100) return;
      const zW = aw / contentW;
      const zH = ah / contentH;
      const z = Math.max(0.1, Math.min(zW, zH, 3));
      setFitZoom(z);
      setRulerOrigin({
        x: (aw - contentW * z) / 2 + canvasPadX * z,
        y: (ah - contentH * z) / 2 + canvasPadY * z,
      });
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, [pageW, pageH, isSpreadView]);

  useEffect(() => {
    if (editorMode === 'basic') setTextFloatingAnchor(null);
  }, [editorMode]);

  useEffect(() => {
    const el = scrollAreaRef.current;
    const sync = () => {
      canvasHandleRef.current?.syncTextFloatingAnchor();
    };
    el?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      el?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    canvasHandleRef.current?.syncTextFloatingAnchor();
  }, [fitZoom]);

  /** При выделении текста открываем раздел «Текст» в сайдбаре (расширенный режим) */
  useEffect(() => {
    if (editorMode !== 'advanced') return;
    if (selectedObj?.type === 'IText') {
      setUi((u) => ({ ...u, sidebarSection: 'text' }));
    }
  }, [selectedObj?.type, editorMode]);
  /** Левая страница в виде разворота (= currentPage, всегда первая из пары) */
  const leftPageIdx = isSpreadView ? (currentStripItem?.pages[0] ?? currentPage) : currentPage;
  /** Правая страница разворота */
  const rightPageIdx = isSpreadView ? (currentStripItem?.pages[1] ?? currentPage + 1) : -1;

  /** Ключ загрузки холста: одна страница или единый разворот (два индекса) */
  const pageLoadKey = useMemo(() => {
    if (isSpreadView && rightPageIdx >= 0) {
      return `spread-${leftPageIdx}-${rightPageIdx}`;
    }
    return `single-${currentPage}`;
  }, [isSpreadView, leftPageIdx, rightPageIdx, currentPage]);

  const spreadPairPages: [number, number] | null =
    isSpreadView && rightPageIdx >= 0 ? [leftPageIdx, rightPageIdx] : null;

  // ── Canvas refs (imperative handles) ────────────────────────────────────────
  const canvasHandleRef = useRef<DesignEditorCanvasHandle | null>(null);

  const activeCanvas = useCallback(() => canvasHandleRef.current, []);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [ui, setUi] = useState<{ showGuides: boolean; sidebarSection: SidebarSection | null }>({
    showGuides: true,
    sidebarSection: 'photo',
  });
  const { showGuides, sidebarSection } = ui;

  const [photoPanel, setPhotoPanel] = useState({
    sort: 'name' as 'name' | 'date',
  });
  const { sort: photoSort } = photoPanel;

  const [exportingPdf, setExportingPdf] = useState(false);

  /** Ошибки в рабочем режиме (загрузка по URL, сохранение и т.д.) */
  const [editorError, setEditorError] = useState<string | null>(null);
  /** Краткое сообщение после сохранения макета в шаблон (без заказа) */
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerInitialFiles, setImagePickerInitialFiles] = useState<File[]>([]);
  /** Фото, загруженные в проект и ещё не размещённые на макете (превью в панели) */
  const [sidebarPhotos, setSidebarPhotos] = useState<SidebarPhotoItem[]>([]);
  const sidebarPhotosRef = useRef<SidebarPhotoItem[]>([]);
  sidebarPhotosRef.current = sidebarPhotos;

  const [collageState, setCollageState] = useState({
    photoCount: 3,
    filterSuitable: false,
    padding: 20,
    selectedTemplateId: null as number | null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { template, loading, error } = templateState;

  // ── Load template ────────────────────────────────────────────────────────────
  const loadTemplate = useCallback(async () => {
    const id = parseInt(templateId ?? '0', 10);
    if (!id) {
      setTemplateState((s) => ({ ...s, error: 'Не указан шаблон', loading: false }));
      return;
    }
    try {
      setTemplateState((s) => ({ ...s, loading: true, error: null }));
      const res = await getDesignTemplate(id);
      const t = res.data;
      let spec: {
        width_mm?: number;
        height_mm?: number;
        page_count?: number;
        spread_mode?: boolean;
        cover_pages?: number;
        designState?: DesignState;
      } = {};
      try {
        if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
      } catch {
        // ignore parse error
      }
      const ds = spec.designState;
      const w = ds?.pageWidth ?? spec.width_mm ?? 90;
      const h = ds?.pageHeight ?? spec.height_mm ?? 55;
      const count = ds?.pages?.length
        ? Math.max(1, Math.min(99, ds.pages.length))
        : Math.max(1, Math.min(99, Number(spec.page_count) || 1));
      const sm = !!(ds?.spread_mode ?? spec.spread_mode);
      const sc = 1; // fitZoom обеспечивает визуальное вписывание
      const cp = Math.max(0, Math.min(3, Number(ds?.cover_pages ?? spec.cover_pages ?? 1)));
      setTemplateState((s) => ({ ...s, template: t, loading: false, error: null }));
      setPageSpec({ pageWidth: w, pageHeight: h, pageCount: count, scale: sc });
      if (ds?.pages && ds.pages.length > 0) {
        setPages(
          ds.pages.map((p) => ({
            fabricJSON: (p.fabricJSON ?? {}) as Record<string, unknown>,
          })),
        );
      } else {
        setPages(Array.from({ length: count }, () => ({ ...EMPTY_PAGE })));
      }
      setCurrentPage(0);
      setThumbnails({});
      setSpreadMode(sm);
      setCoverPages(cp);
    } catch (err: unknown) {
      setTemplateState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Не удалось загрузить шаблон',
        loading: false,
      }));
    }
  }, [templateId]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  useEffect(() => {
    if (!saveSuccessMessage) return;
    const t = window.setTimeout(() => setSaveSuccessMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [saveSuccessMessage]);

  // ── Image from file picker ───────────────────────────────────────────────────
  const addImageFromFile = useCallback(async (file: File) => {
    if (!isLikelyImageFile(file)) return;
    await activeCanvas()?.addImageFromFile(file);
  }, [activeCanvas]);

  useEffect(() => {
    return () => {
      for (const p of sidebarPhotosRef.current) {
        URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, []);

  const appendSidebarPhotosFromFiles = useCallback((files: File[]) => {
    const images = filterLikelyImageFiles(files, { trustOsPicker: true });
    if (images.length === 0) return;
    setSidebarPhotos((prev) => {
      const next = [...prev];
      for (const file of images) {
        if (next.length >= SIDEBAR_PHOTO_MAX) break;
        next.push({
          id: crypto.randomUUID(),
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          file,
          addedAt: Date.now(),
        });
      }
      return next;
    });
  }, []);

  const removeSidebarPhoto = useCallback((id: string) => {
    setSidebarPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const handleLibraryPhotoClick = useCallback(
    async (id: string) => {
      if (!canvasHandleRef.current) return;
      const item = sidebarPhotos.find((p) => p.id === id);
      if (!item) return;
      try {
        await addImageFromFile(item.file);
        removeSidebarPhoto(id);
      } catch {
        /* остаётся в списке неразмещённых */
      }
    },
    [sidebarPhotos, addImageFromFile, removeSidebarPhoto],
  );

  // ── Capture thumb of current page immediately (after canvas is ready) ───────
  const captureCurrentThumb = useCallback(() => {
    const url = canvasHandleRef.current?.captureThumb();
    if (!url) return;
    setThumbnails((prev) => ({ ...prev, [leftPageIdx]: url }));
    if (isSpreadView && rightPageIdx >= 0) {
      setThumbnails((prev) => ({ ...prev, [rightPageIdx]: url }));
    }
  }, [leftPageIdx, rightPageIdx, isSpreadView]);

  // ── Add / remove pages & spreads ─────────────────────────────────────────────
  const handleAddSpread = useCallback(() => {
    // Сохраняем миниатюру текущей страницы перед добавлением
    captureCurrentThumb();
    const addCount = 2;
    setPages((prev) => [...prev, ...Array.from({ length: addCount }, () => ({ ...EMPTY_PAGE }))]);
    setPageSpec((s) => ({ ...s, pageCount: s.pageCount + addCount }));
  }, [captureCurrentThumb]);

  const handleAddPage = useCallback(() => {
    captureCurrentThumb();
    setPages((prev) => [...prev, { ...EMPTY_PAGE }]);
    setPageSpec((s) => ({ ...s, pageCount: s.pageCount + 1 }));
  }, [captureCurrentThumb]);

  const handleDeleteLast = useCallback(() => {
    const removeCount = spreadMode ? 2 : 1;
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, prev.length - removeCount);
      return next.length ? next : [{ ...EMPTY_PAGE }];
    });
    setPageSpec((s) => {
      const newCount = Math.max(1, s.pageCount - removeCount);
      return { ...s, pageCount: newCount };
    });
    setCurrentPage((p) => {
      const safeMax = Math.max(0, pageCount - 1 - removeCount);
      return Math.min(p, safeMax);
    });
    setThumbnails((prev) => {
      const next = { ...prev };
      for (let i = 0; i < removeCount; i++) delete next[pageCount - 1 - i];
      return next;
    });
  }, [spreadMode, pageCount]);

  const handleGoToPage = useCallback((pageIndex: number) => {
    captureCurrentThumb();
    setCurrentPage(pageIndex);
  }, [captureCurrentThumb]);

  const handleImageUrlSubmit = useCallback(
    async (url: string) => {
      const u = url.trim();
      if (!u) return;
      if (!looksLikeHttpUrl(u)) {
        setEditorError('Нужна ссылка https:// или http:// на файл');
        return;
      }
      try {
        setEditorError(null);
        const res = await fetchImageFromUrl(u);
        const blob = res.data;
        const ct = blob.type || 'image/jpeg';
        const ext = (ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const file = new File([blob], `photo-${Date.now()}.${ext}`, { type: ct });
        appendSidebarPhotosFromFiles([file]);
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : 'Ошибка';
        const msg = raw.replace(/^\d+:\s*/, '').trim() || 'Не удалось загрузить по ссылке';
        setEditorError(msg);
      }
    },
    [appendSidebarPhotosFromFiles],
  );

  const handleAddImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && isLikelyImageFile(file)) {
        appendSidebarPhotosFromFiles([file]);
      }
      e.target.value = '';
    },
    [appendSidebarPhotosFromFiles],
  );

  const openImagePicker = useCallback((initialFiles?: File[]) => {
    setImagePickerInitialFiles(initialFiles ?? []);
    setImagePickerOpen(true);
  }, []);

  const handleImagePickerSelect = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        setImagePickerOpen(false);
        setImagePickerInitialFiles([]);
        return;
      }
      appendSidebarPhotosFromFiles(files);
      setImagePickerOpen(false);
      setImagePickerInitialFiles([]);
    },
    [appendSidebarPhotosFromFiles],
  );

  const handlePhotoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files ?? []).filter((f) => isLikelyImageFile(f));
      if (files.length > 0) openImagePicker(files);
    },
    [openImagePicker],
  );

  const handlePhotoDropOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // ── Text ─────────────────────────────────────────────────────────────────────
  const handleAddText = useCallback(() => {
    activeCanvas()?.addText();
  }, [activeCanvas]);

  const handleTextChange = useCallback((text: string) => {
    activeCanvas()?.setTextProp('text', text);
  }, [activeCanvas]);

  const handleFontChange = useCallback((fontFamily: string) => {
    activeCanvas()?.setTextProp('fontFamily', fontFamily);
  }, [activeCanvas]);

  const handleFontSizeChange = useCallback((fontSize: number) => {
    activeCanvas()?.setTextProp('fontSize', fontSize);
  }, [activeCanvas]);

  const handleTextColorChange = useCallback((fill: string) => {
    activeCanvas()?.setTextProp('fill', fill);
  }, [activeCanvas]);

  const handleFontWeightToggle = useCallback(() => {
    const w = selectedObj?.fontWeight === 'bold' ? 'normal' : 'bold';
    activeCanvas()?.setTextProp('fontWeight', w);
  }, [selectedObj?.fontWeight, activeCanvas]);

  const handleFontStyleToggle = useCallback(() => {
    const s = selectedObj?.fontStyle === 'italic' ? 'normal' : 'italic';
    activeCanvas()?.setTextProp('fontStyle', s);
  }, [selectedObj?.fontStyle, activeCanvas]);

  const handleUnderlineToggle = useCallback(() => {
    activeCanvas()?.setTextProp('underline', !selectedObj?.underline);
  }, [selectedObj?.underline, activeCanvas]);

  const handleTextAlignChange = useCallback((textAlign: string) => {
    activeCanvas()?.setTextProp('textAlign', textAlign);
  }, [activeCanvas]);

  const handleTextFontVariant = useCallback((fontWeight: string, fontStyle: string) => {
    canvasHandleRef.current?.setTextStyle({ fontWeight, fontStyle });
  }, []);

  const handleLineHeightChange = useCallback((lineHeight: number) => {
    activeCanvas()?.setTextProp('lineHeight', lineHeight);
  }, [activeCanvas]);

  const handleAddTextPreset = useCallback((kind: TextBlockPresetKind) => {
    canvasHandleRef.current?.addTextPreset(kind);
  }, []);

  const handleSidebarApplyFont = useCallback(
    async (fontFamily: string) => {
      const handle = canvasHandleRef.current;
      if (!handle) return;
      if (selectedObj?.type === 'IText') {
        handle.applyTextPropsToSelection({ fontFamily });
        return;
      }
      const saved = await handle.saveCurrentPage();
      const merged = mergePagesWithSavedSnapshot(pages, saved as PageSaveSnapshot, {
        currentPage,
        leftPageIdx,
        rightPageIdx,
      });
      const nextPages = merged.map((p) => ({
        fabricJSON: patchAllTextInFabricJSON(p.fabricJSON as Record<string, unknown>, { fontFamily }),
      }));
      setPages(nextPages);
      await handle.applyEditorViewState(nextPages);
    },
    [selectedObj?.type, currentPage, leftPageIdx, rightPageIdx, pages],
  );

  const handleSidebarApplyTextColor = useCallback(
    async (fill: string) => {
      const handle = canvasHandleRef.current;
      if (!handle) return;
      if (selectedObj?.type === 'IText') {
        handle.applyTextPropsToSelection({ fill });
        return;
      }
      const saved = await handle.saveCurrentPage();
      const merged = mergePagesWithSavedSnapshot(pages, saved as PageSaveSnapshot, {
        currentPage,
        leftPageIdx,
        rightPageIdx,
      });
      const nextPages = merged.map((p) => ({
        fabricJSON: patchAllTextInFabricJSON(p.fabricJSON as Record<string, unknown>, { fill }),
      }));
      setPages(nextPages);
      await handle.applyEditorViewState(nextPages);
    },
    [selectedObj?.type, currentPage, leftPageIdx, rightPageIdx, pages],
  );

  const handleSidebarApplyEffects = useCallback(
    async (v: TextEffectsValues) => {
      const handle = canvasHandleRef.current;
      if (!handle) return;
      if (selectedObj?.type === 'IText') {
        const props: Record<string, unknown> = {
          opacity: v.opacity,
          strokeWidth: v.strokeWidth,
          stroke: v.strokeWidth > 0 ? v.stroke : undefined,
        };
        if (v.strokeWidth === 0) {
          props.stroke = '';
        }
        if (v.softShadow) {
          props.shadow = new Shadow({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 0, offsetY: 5 });
        } else {
          props.shadow = null;
        }
        handle.applyTextPropsToSelection(props);
        return;
      }
      const patch: Record<string, unknown> = {
        opacity: v.opacity,
        strokeWidth: v.strokeWidth,
        stroke: v.strokeWidth > 0 ? v.stroke : '',
      };
      const saved = await handle.saveCurrentPage();
      const merged = mergePagesWithSavedSnapshot(pages, saved as PageSaveSnapshot, {
        currentPage,
        leftPageIdx,
        rightPageIdx,
      });
      const nextPages = merged.map((p) => ({
        fabricJSON: patchAllTextInFabricJSON(p.fabricJSON as Record<string, unknown>, patch),
      }));
      setPages(nextPages);
      await handle.applyEditorViewState(nextPages);
    },
    [selectedObj?.type, currentPage, leftPageIdx, rightPageIdx, pages],
  );

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!canvasHandleRef.current) return;

    const saved = await canvasHandleRef.current.saveCurrentPage();
    let updatedPages: DesignPage[];
    if (saved.kind === 'spread') {
      updatedPages = pages.map((p, i) => {
        if (i === leftPageIdx) return { fabricJSON: saved.left };
        if (i === rightPageIdx) return { fabricJSON: saved.right };
        return p;
      });
    } else {
      updatedPages = pages.map((p, i) =>
        i === currentPage ? { fabricJSON: saved.json } : p,
      );
    }

    const designState: DesignState = {
      templateId: templateId ? parseInt(templateId, 10) : null,
      pageWidth,
      pageHeight,
      pageCount,
      pages: updatedPages,
      spread_mode: spreadMode,
      cover_pages: coverPages,
    };

    if (hasOrderContext) {
      const handle = canvasHandleRef.current;
      try {
        setSaving(true);
        setTemplateState((s) => ({ ...s, error: null }));
        const dataUrl = handle.getDataURL({ multiplier: getExportPixelRatio() });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `maket-${Date.now()}.png`, { type: 'image/png' });
        await uploadOrderFile(orderId, file, orderItemId > 0 ? orderItemId : undefined);
        if (orderItemId > 0) {
          await updateOrderItem(orderId, orderItemId, {
            params: {
              designState: designState as unknown as Record<string, unknown>,
              designTemplateId: templateId ? parseInt(templateId, 10) : undefined,
            },
          });
        }
        navigate(-1);
      } catch (err: unknown) {
        setTemplateState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : 'Ошибка сохранения',
        }));
      } finally {
        setSaving(false);
      }
      return;
    }

    const tid = templateId ? parseInt(templateId, 10) : 0;
    if (!tid) {
      setEditorError('Не удалось сохранить: не указан шаблон.');
      return;
    }

    try {
      setSaving(true);
      setSaveSuccessMessage(null);
      setEditorError(null);
      let specObj: Record<string, unknown> = {};
      try {
        if (template?.spec) {
          specObj =
            typeof template.spec === 'string' ? JSON.parse(template.spec) : { ...(template.spec as object) };
        }
      } catch {
        specObj = {};
      }
      const mergedSpec = {
        ...specObj,
        width_mm: pageWidth,
        height_mm: pageHeight,
        page_count: pageCount,
        spread_mode: spreadMode,
        cover_pages: coverPages,
        designState,
      };
      const res = await updateDesignTemplate(tid, { spec: mergedSpec });
      setTemplateState((s) => ({ ...s, template: res.data }));
      setPages(updatedPages);
      setSaveSuccessMessage('Макет сохранён в шаблоне. При следующем открытии подтянется из каталога.');
    } catch (err: unknown) {
      setEditorError(err instanceof Error ? err.message : 'Ошибка сохранения шаблона');
    } finally {
      setSaving(false);
    }
  }, [
    pages,
    currentPage,
    templateId,
    template,
    pageWidth,
    pageHeight,
    pageCount,
    spreadMode,
    coverPages,
    hasOrderContext,
    orderId,
    orderItemId,
    navigate,
    leftPageIdx,
    rightPageIdx,
  ]);

  // ── PDF export ────────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    const handle = canvasHandleRef.current;
    if (!handle || pageCount < 1) return;

    setExportingPdf(true);
    try {
      const saved = await handle.saveCurrentPage();
      let allPages = pages;
      if (saved.kind === 'spread') {
        allPages = pages.map((p, i) => {
          if (i === leftPageIdx) return { fabricJSON: saved.left };
          if (i === rightPageIdx) return { fabricJSON: saved.right };
          return p;
        });
      } else {
        allPages = pages.map((p, i) => (i === currentPage ? { fabricJSON: saved.json } : p));
      }

      const doc = new jsPDF({
        unit: 'mm',
        format: [pageWidth, pageHeight],
        hotfixes: ['px_scaling'],
      });

      for (let i = 0; i < pageCount; i++) {
        await handle.loadPageForExport(allPages[i] ?? EMPTY_PAGE);
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const dataUrl = handle.getDataURL({ multiplier: 2 });
        if (i > 0) doc.addPage([pageWidth, pageHeight]);
        doc.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
      }

      doc.save(`maket-${template?.name ?? 'maket'}-all.pdf`);

      await handle.applyEditorViewState();
    } catch (err) {
      console.error(err);
      setTemplateState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Ошибка экспорта в PDF',
      }));
    } finally {
      setExportingPdf(false);
    }
  }, [pages, currentPage, pageCount, pageWidth, pageHeight, template?.name, leftPageIdx, rightPageIdx]);

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminPageLayout
        title="Редактор макета"
        icon={<AppIcon name="image" size="sm" />}
        onBack={() => navigate(-1)}
      >
        <div className="design-editor-loading">Загрузка шаблона...</div>
      </AdminPageLayout>
    );
  }

  if (error || !template) {
    return (
      <AdminPageLayout
        title="Редактор макета"
        icon={<AppIcon name="image" size="sm" />}
        onBack={() => navigate(-1)}
      >
        {error && <Alert type="error">{error}</Alert>}
        <Button variant="secondary" onClick={() => navigate(catalogPath)}>
          Вернуться в каталог
        </Button>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={`Редактор: ${template.name}`}
      icon={<AppIcon name="image" size="sm" />}
      onBack={() => navigate(-1)}
    >
      <div className="design-editor">
        <DesignEditorSidebar
          activeSection={sidebarSection}
          onSectionChange={(v) => setUi((u) => ({ ...u, sidebarSection: v }))}
        />

        {sidebarSection && (
          <aside
            className="design-editor-panel"
            aria-label={`Панель: ${SIDEBAR_ITEMS.find((i) => i.id === sidebarSection)?.label}`}
          >
            <DesignEditorPanel
              section={sidebarSection}
              onClose={() => setUi((u) => ({ ...u, sidebarSection: null }))}
              onAddImage={() => openImagePicker()}
              onAddPhotoField={() => activeCanvas()?.addPhotoField()}
              onAddShape={(type) => activeCanvas()?.addShape(type)}
              onSetBackground={(c) => activeCanvas()?.setCanvasBackground(c)}
              onSetBackgroundImage={(d) => activeCanvas()?.setCanvasBackgroundImage(d) ?? Promise.resolve()}
              onClearBackground={() => activeCanvas()?.clearCanvasBackground()}
              canvasWidth={pageW}
              canvasHeight={pageH}
              onSetObjProp={(k, v) => activeCanvas()?.setObjProp(k, v)}
              onDuplicateObj={() => activeCanvas()?.duplicateSelected()}
              onDeleteObj={() => activeCanvas()?.deleteSelected()}
              onBringForward={() => activeCanvas()?.bringForward()}
              onSendBackward={() => activeCanvas()?.sendBackward()}
              onBringToFront={() => activeCanvas()?.bringToFront()}
              onSendToBack={() => activeCanvas()?.sendToBack()}
              onFlipX={() => activeCanvas()?.flipSelected('x')}
              onFlipY={() => activeCanvas()?.flipSelected('y')}
              onPhotoDrop={handlePhotoDrop}
              onPhotoDragOver={handlePhotoDropOver}
              onImageUrlSubmit={handleImageUrlSubmit}
              photoSort={photoSort}
              onPhotoSortChange={(v) => setPhotoPanel((p) => ({ ...p, sort: v }))}
              onAutofillPhotoFields={() => void activeCanvas()?.autofillPhotoFields()}
              photoLibrary={sidebarPhotos}
              onLibraryPhotoClick={handleLibraryPhotoClick}
              onLibraryPhotoRemove={removeSidebarPhoto}
              selectedObj={selectedObj}
              onTextChange={handleTextChange}
              onAddTextPreset={handleAddTextPreset}
              usedFonts={projectUsedFonts}
              onApplyFont={handleSidebarApplyFont}
              onApplyTextColor={handleSidebarApplyTextColor}
              onApplyEffects={handleSidebarApplyEffects}
              collagePhotoCount={collageState.photoCount}
              onCollagePhotoCountChange={(v) => setCollageState((c) => ({ ...c, photoCount: v }))}
              collageFilterSuitable={collageState.filterSuitable}
              onCollageFilterSuitableChange={(v) =>
                setCollageState((c) => ({ ...c, filterSuitable: v }))
              }
              collagePadding={collageState.padding}
              onCollagePaddingChange={(v) => setCollageState((c) => ({ ...c, padding: v }))}
              collageSelectedTemplateId={collageState.selectedTemplateId}
              onCollageSelectTemplate={(id) =>
                setCollageState((c) => ({ ...c, selectedTemplateId: id }))
              }
            />
          </aside>
        )}

        <div className="design-editor-main">
          {/* Скрытый input для добавления изображений из тулбара */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={handleAddImage}
            style={{ display: 'none' }}
            aria-hidden
          />

          <DesignEditorToolbar
            mode={editorMode}
            onModeChange={setEditorMode}
            onAddText={handleAddText}
            selectedObj={selectedObj}
            currentPage={currentPage}
            pageCount={pageCount}
            onPagePrev={() => {
              const step = isSpreadView ? 2 : 1;
              handleGoToPage(Math.max(0, leftPageIdx - step));
            }}
            onPageNext={() => {
              const step = isSpreadView ? 2 : 1;
              handleGoToPage(Math.min(pageCount - 1, leftPageIdx + step));
            }}
            showGuides={showGuides}
            onGuidesToggle={() => setUi((u) => ({ ...u, showGuides: !u.showGuides }))}
            onSave={handleSave}
            saving={saving}
            hasOrderContext={hasOrderContext}
            onExportPdf={() => void handleExportPdf()}
            exportingPdf={exportingPdf}
            onClose={() => navigate(catalogPath)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => activeCanvas()?.undo()}
            onRedo={() => activeCanvas()?.redo()}
            onDeleteSelected={() => activeCanvas()?.deleteSelected()}
            onDuplicateSelected={() => activeCanvas()?.duplicateSelected()}
            zoom={zoom}
            onZoomIn={() => { const c = activeCanvas(); c?.setZoom((c.getZoom() * 1.2)); }}
            onZoomOut={() => { const c = activeCanvas(); c?.setZoom((c.getZoom() / 1.2)); }}
            onZoomReset={() => activeCanvas()?.setZoom(1)}
            onTextColorChange={handleTextColorChange}
            onFontWeightToggle={handleFontWeightToggle}
            onFontStyleToggle={handleFontStyleToggle}
            onUnderlineToggle={handleUnderlineToggle}
            onTextAlignChange={handleTextAlignChange}
            onFontChange={handleFontChange}
            onFontSizeChange={handleFontSizeChange}
            suppressTextFormat={
              editorMode === 'advanced' &&
              selectedObj?.type === 'IText' &&
              textFloatingAnchor !== null
            }
          />

          <div
            className={`design-editor-scroll-area${showRulers ? '' : ' no-rulers'}`}
            ref={scrollAreaRef}
          >
          {showRulers && (
            <CanvasRulers
              widthMM={isSpreadView ? pageWidth * 2 : pageWidth}
              heightMM={pageHeight}
              fitZoom={fitZoom}
              originX={rulerOrigin.x}
              originY={rulerOrigin.y}
              guides={guides}
              onGuidesChange={setGuides}
            />
          )}
          <div className="design-editor-viewport" ref={viewportRef}>

          {editorError && (
            <Alert type="error" onClose={() => setEditorError(null)}>
              {editorError}
            </Alert>
          )}
          {saveSuccessMessage && (
            <Alert type="success" onClose={() => setSaveSuccessMessage(null)}>
              {saveSuccessMessage}
            </Alert>
          )}

          <div
            className="design-editor-fit-scaler"
            style={{ transform: `scale(${fitZoom})` }}
          >

          {/* Один экземпляр холста: при смене isSpreadView нельзя размонтировать второй canvas — правки теряются. */}
          <div
            className={isSpreadView ? 'design-editor-spread-wrap' : 'design-editor-canvas-wrap'}
          >
            <div
              className={
                isSpreadView ? 'design-editor-spread-book design-editor-spread-book--unified' : undefined
              }
              style={isSpreadView ? undefined : { display: 'contents' }}
            >
              <div
                className={isSpreadView ? 'design-editor-spread-unified-canvas' : undefined}
                style={isSpreadView ? undefined : { display: 'contents' }}
              >
                <DesignEditorCanvas
                  ref={canvasHandleRef}
                  template={template}
                  pageWidthPx={pageW}
                  canvasWidthPx={isSpreadView ? pageW * 2 : pageW}
                  pageHeightPx={pageH}
                  safeZonePx={safeZonePx}
                  pages={pages}
                  setPages={setPages}
                  currentPage={currentPage}
                  pageLoadKey={pageLoadKey}
                  spreadPairPages={spreadPairPages}
                  showGuides={showGuides}
                  apiBaseUrl={API_BASE_URL}
                  mode={editorMode}
                  onSelectionChange={setSelectedObj}
                  onHistoryChange={(u, r) => {
                    setCanUndo(u);
                    setCanRedo(r);
                  }}
                  onZoomChange={setZoom}
                  onPageThumbReady={handlePageThumbReady}
                  onDropRemoteImageUrl={handleImageUrlSubmit}
                  guideLinesPx={guideLinesPx}
                  onSnapLinesChange={setSnapLines}
                  onTextFloatingAnchor={
                    editorMode === 'advanced' ? setTextFloatingAnchor : undefined
                  }
                />
              </div>
              {isSpreadView && (
                <div className="design-editor-spread-fold">
                  <div className="design-editor-spread-fold-label">
                    не размещайте на разворотах лица/текст
                  </div>
                </div>
              )}
            </div>
            {isSpreadView && (
              <div className="design-editor-spread-label">
                {currentStripItem?.label ?? `Разворот`}
              </div>
            )}
          </div>

          </div>{/* /design-editor-fit-scaler */}

          </div>{/* /design-editor-viewport */}
          </div>{/* /design-editor-scroll-area */}

          <PageStrip
            items={buildStripItems(pageCount, spreadMode, coverPages)}
            currentPage={currentPage}
            thumbnails={thumbnails}
            thumbW={pageW}
            thumbH={pageH}
            spreadMode={spreadMode}
            onGoTo={handleGoToPage}
            onAddSpread={handleAddSpread}
            onAddPage={handleAddPage}
            onDeleteLast={handleDeleteLast}
            canDelete={pageCount > (spreadMode ? 1 + coverPages : 1)}
            onSpreadModeToggle={() => setSpreadMode((v) => !v)}
            infoLine={`${pageWidth}×${pageHeight} мм · ${Math.round(zoom * 100)}% · Ctrl+колесо — зум`}
            collapsed={stripCollapsed}
            onCollapse={() => setStripCollapsed((v) => !v)}
          />
        </div>

        {editorMode === 'advanced' &&
          selectedObj?.type === 'IText' &&
          textFloatingAnchor && (
            <TextFloatingToolbar
              anchor={textFloatingAnchor}
              selectedObj={selectedObj}
              onFontChange={handleFontChange}
              onFontSizeChange={handleFontSizeChange}
              onTextColorChange={handleTextColorChange}
              onFontVariantChange={handleTextFontVariant}
              onFontWeightToggle={handleFontWeightToggle}
              onFontStyleToggle={handleFontStyleToggle}
              onUnderlineToggle={handleUnderlineToggle}
              onTextAlignChange={handleTextAlignChange}
              onLineHeightChange={handleLineHeightChange}
              onDuplicate={() => activeCanvas()?.duplicateSelected()}
              onBringForward={() => activeCanvas()?.bringForward()}
              onDelete={() => activeCanvas()?.deleteSelected()}
            />
          )}

        <ImagePickerModal
          isOpen={imagePickerOpen}
          onClose={() => {
            setImagePickerOpen(false);
            setImagePickerInitialFiles([]);
          }}
          onSelect={handleImagePickerSelect}
          initialFiles={imagePickerInitialFiles}
        />
      </div>
    </AdminPageLayout>
  );
};

export default DesignEditorPage;
