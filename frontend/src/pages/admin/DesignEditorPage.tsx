import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import Konva from 'konva';
import { jsPDF } from 'jspdf';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert, Button } from '../../components/common';
import { getDesignTemplate, uploadOrderFile, updateOrderItem, type DesignTemplate } from '../../api';
import { API_BASE_URL } from '../../config/constants';
import {
  PAGE_OFFSET,
  MM_TO_PX,
  SAFE_ZONE_MM,
  getExportPixelRatio,
  SIDEBAR_ITEMS,
  EMPTY_PAGE,
} from './designEditor/constants';
import type { DesignPage, SidebarSection, CanvasImage, CanvasText, CanvasPhotoField } from './designEditor/types';
import { DesignEditorSidebar } from './designEditor/DesignEditorSidebar';
import { DesignEditorPanel } from './designEditor/DesignEditorPanel';
import { DesignEditorToolbar } from './designEditor/DesignEditorToolbar';
import { DesignEditorCanvas } from './designEditor/DesignEditorCanvas';
import { ImagePickerModal } from '../../components/ImagePickerModal';
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

  /** Шаблон и статус загрузки */
  const [templateState, setTemplateState] = useState<{
    template: DesignTemplate | null;
    loading: boolean;
    error: string | null;
  }>({ template: null, loading: true, error: null });

  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState<DesignPage[]>([{ ...EMPTY_PAGE }]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedPhotoFieldId, setSelectedPhotoFieldId] = useState<string | null>(null);

  /** Размеры и масштаб страницы (из spec шаблона) */
  const [pageSpec, setPageSpec] = useState({
    pageWidth: 210,
    pageHeight: 297,
    pageCount: 1,
    scale: 1,
  });

  /** UI: направляющие и открытая панель сайдбара */
  const [ui, setUi] = useState<{ showGuides: boolean; sidebarSection: SidebarSection | null }>({
    showGuides: true,
    sidebarSection: 'photo',
  });

  /** Настройки панели «Фото» */
  const [photoPanel, setPhotoPanel] = useState({
    sort: 'name' as 'name' | 'date',
    autofill: false,
    hideUsed: false,
  });

  /** Состояние экспорта в PDF */
  const [pdfExport, setPdfExport] = useState<{
    active: boolean;
    progress: { current: number; total: number } | null;
  }>({ active: false, progress: null });

  const { template, loading, error } = templateState;
  const { pageWidth, pageHeight, pageCount, scale } = pageSpec;
  const { showGuides, sidebarSection } = ui;
  const { sort: photoSort, autofill: photoAutofill, hideUsed: photoHideUsed } = photoPanel;
  const { active: exportingPdf, progress: pdfExportProgress } = pdfExport;

  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerInitialFiles, setImagePickerInitialFiles] = useState<File[]>([]);

  /** Коллажи: количество фото, фильтр, отступ, выбранный шаблон */
  const [collageState, setCollageState] = useState({
    photoCount: 3,
    filterSuitable: false,
    padding: 20,
    selectedTemplateId: null as number | null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const guidesLayerRef = useRef<Konva.Layer>(null);
  const pdfExportRef = useRef<{ doc: jsPDF; nextIndex: number; initialPage: number } | null>(null);

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
      let spec: { width_mm?: number; height_mm?: number; page_count?: number } = {};
      try {
        if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
      } catch {}
      const w = spec.width_mm ?? 210;
      const h = spec.height_mm ?? 297;
      const count = Math.max(1, Math.min(99, Number(spec.page_count) || 1));
      setTemplateState((s) => ({ ...s, template: t, loading: false, error: null }));
      setPageSpec({
        pageWidth: w,
        pageHeight: h,
        pageCount: count,
        scale: Math.min(500 / (w * MM_TO_PX), 2),
      });
      setPages((prev) => {
        if (prev.length === count) return prev;
        if (prev.length > count) return prev.slice(0, count);
        return [
          ...prev,
          ...Array.from({ length: count - prev.length }, () => ({ ...EMPTY_PAGE })),
        ];
      });
      setCurrentPage((p) => (p >= count ? Math.max(0, count - 1) : p));
    } catch (err: unknown) {
      setTemplateState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Не удалось загрузить шаблон',
        loading: false,
      }));
    } finally {
      setTemplateState((s) => ({ ...s, loading: false }));
    }
  }, [templateId]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const stageW = Math.ceil(pageWidth * MM_TO_PX * scale) + 80;
  const stageH = Math.ceil(pageHeight * MM_TO_PX * scale) + 80;
  const pageW = pageWidth * MM_TO_PX * scale;
  const pageH = pageHeight * MM_TO_PX * scale;
  const safeZonePx = SAFE_ZONE_MM * MM_TO_PX * scale;
  const currentPageData = pages[currentPage] ?? EMPTY_PAGE;
  const selectedText = selectedTextId ? currentPageData.texts.find((t) => t.id === selectedTextId) : null;

  const addImageFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const maxW = pageW * 0.5;
      const maxH = pageH * 0.5;
      let w = img.width;
      let h = img.height;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h);
        w *= r;
        h *= r;
      }
      const newImage: CanvasImage = {
        id: `img-${Date.now()}`,
        x: PAGE_OFFSET,
        y: PAGE_OFFSET,
        width: w,
        height: h,
        src: url,
      };
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPage] ?? EMPTY_PAGE;
        next[currentPage] = { ...page, images: [...page.images, newImage] };
        return next;
      });
    };
    img.src = url;
  }, [pageW, pageH, currentPage]);

  const handleAddImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addImageFromFile(file);
    e.target.value = '';
  }, [addImageFromFile]);

  const openImagePicker = useCallback((initialFiles?: File[]) => {
    setImagePickerInitialFiles(initialFiles ?? []);
    setImagePickerOpen(true);
  }, []);

  const handleImagePickerSelect = useCallback(
    (files: File[]) => {
      files.filter((f) => f.type.startsWith('image/')).forEach((file) => addImageFromFile(file));
      setImagePickerOpen(false);
      setImagePickerInitialFiles([]);
    },
    [addImageFromFile],
  );

  const handlePhotoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) openImagePicker(files);
  }, [openImagePicker]);

  const handlePhotoDropOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleAddText = useCallback(() => {
    const newText: CanvasText = {
      id: `text-${Date.now()}`,
      x: PAGE_OFFSET + 20,
      y: PAGE_OFFSET + 20,
      text: 'Текст',
      fontSize: Math.max(14, Math.round(24 * scale)),
      fontFamily: 'Arial',
    };
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? EMPTY_PAGE;
      next[currentPage] = { ...page, texts: [...page.texts, newText] };
      return next;
    });
  }, [scale, currentPage]);

  const handleAddPhotoField = useCallback(() => {
    const w = 100;
    const h = 100;
    const newField: CanvasPhotoField = {
      id: `field-${Date.now()}`,
      x: PAGE_OFFSET + 20,
      y: PAGE_OFFSET + 20,
      width: w,
      height: h,
    };
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? EMPTY_PAGE;
      next[currentPage] = { ...page, photoFields: [...page.photoFields, newField] };
      return next;
    });
    setSelectedPhotoFieldId(newField.id);
    setSelectedTextId(null);
    setSelectedImageId(null);
  }, [currentPage]);

  const handlePhotoFieldDrop = useCallback((fieldId: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const src = URL.createObjectURL(file);
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? EMPTY_PAGE;
      next[currentPage] = {
        ...page,
        photoFields: page.photoFields.map((f) => (f.id === fieldId ? { ...f, src } : f)),
      };
      return next;
    });
  }, [currentPage]);

  const getPhotoFieldIdAt = useCallback((stageX: number, stageY: number) => {
    const page = pages[currentPage] ?? EMPTY_PAGE;
    const f = page.photoFields.find(
      (field) =>
        stageX >= field.x && stageX <= field.x + field.width &&
        stageY >= field.y && stageY <= field.y + field.height
    );
    return f?.id ?? null;
  }, [currentPage, pages]);

  const handleTextChange = useCallback((text: string) => {
    if (!selectedTextId) return;
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? EMPTY_PAGE;
      next[currentPage] = { ...page, texts: page.texts.map((t) => (t.id === selectedTextId ? { ...t, text } : t)) };
      return next;
    });
  }, [currentPage, selectedTextId]);

  const handleFontChange = useCallback((fontFamily: string) => {
    if (!selectedTextId) return;
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? EMPTY_PAGE;
      next[currentPage] = { ...page, texts: page.texts.map((t) => (t.id === selectedTextId ? { ...t, fontFamily } : t)) };
      return next;
    });
  }, [currentPage, selectedTextId]);

  const handleFontSizeChange = useCallback((fontSize: number) => {
    if (!selectedTextId) return;
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? EMPTY_PAGE;
      next[currentPage] = { ...page, texts: page.texts.map((t) => (t.id === selectedTextId ? { ...t, fontSize } : t)) };
      return next;
    });
  }, [currentPage, selectedTextId]);

  const handleSave = useCallback(async () => {
    const designState = {
      templateId: templateId ? parseInt(templateId, 10) : null,
      pageWidth,
      pageHeight,
      pageCount,
      pages: pages.map((p) => ({
        images: p.images.map((i) => ({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height })),
        texts: p.texts.map((t) => ({ id: t.id, x: t.x, y: t.y, text: t.text, fontSize: t.fontSize, fontFamily: t.fontFamily, scaleX: t.scaleX, scaleY: t.scaleY })),
        photoFields: p.photoFields.map((f) => ({ id: f.id, x: f.x, y: f.y, width: f.width, height: f.height, src: f.src })),
      })),
    };

    if (hasOrderContext) {
      try {
        setSaving(true);
        setTemplateState((s) => ({ ...s, error: null }));
        const stage = stageRef.current;
        if (!stage) {
          setTemplateState((s) => ({ ...s, error: 'Канвас не готов' }));
          return;
        }
        const guidesLayer = guidesLayerRef.current;
        if (guidesLayer) guidesLayer.visible(false);
        const dataUrl = stage.toDataURL({ pixelRatio: getExportPixelRatio(), mimeType: 'image/png' });
        if (guidesLayer) guidesLayer.visible(true);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `maket-${Date.now()}.png`, { type: 'image/png' });
        await uploadOrderFile(orderId, file, orderItemId > 0 ? orderItemId : undefined);
        if (orderItemId > 0) {
          await updateOrderItem(orderId, orderItemId, {
            params: { designState, designTemplateId: templateId ? parseInt(templateId, 10) : undefined },
          });
        }
        navigate(-1);
      } catch (err: unknown) {
        setTemplateState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Ошибка сохранения' }));
      } finally {
        setSaving(false);
      }
    } else {
      console.log('Design state:', designState);
      alert('Макет сохранён в консоль. Для сохранения в заказ откройте редактор из карточки заказа.');
    }
  }, [templateId, pageWidth, pageHeight, pageCount, pages, hasOrderContext, orderId, orderItemId, navigate]);

  const handleExportPdf = useCallback(() => {
    if (!stageRef.current || pageCount < 1) return;
    try {
      const doc = new jsPDF({
        unit: 'mm',
        format: [pageWidth, pageHeight],
        hotfixes: ['px_scaling'],
      });
      pdfExportRef.current = { doc, nextIndex: 0, initialPage: currentPage };
      setPdfExport({ active: true, progress: pageCount > 1 ? { current: 0, total: pageCount } : null });
      setCurrentPage(0);
    } catch (err) {
      console.error(err);
      setTemplateState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Ошибка экспорта в PDF' }));
    }
  }, [pageWidth, pageHeight, pageCount, currentPage]);

  useEffect(() => {
    const ref = pdfExportRef.current;
    const stage = stageRef.current;
    const guidesLayer = guidesLayerRef.current;
    if (!exportingPdf || !ref || ref.nextIndex >= pageCount || !stage) return;
    if (currentPage !== ref.nextIndex) return;

    const pageWpx = pageWidth * MM_TO_PX * scale;
    const pageHpx = pageHeight * MM_TO_PX * scale;
    const pixelRatio = getExportPixelRatio();

    const capture = () => {
      if (guidesLayer) guidesLayer.visible(false);
      const dataUrl = stage.toDataURL({
        x: PAGE_OFFSET,
        y: PAGE_OFFSET,
        width: pageWpx,
        height: pageHpx,
        pixelRatio,
        mimeType: 'image/png',
      });
      if (guidesLayer) guidesLayer.visible(true);

      try {
        if (ref.nextIndex > 0) ref.doc.addPage([pageWidth, pageHeight]);
        ref.doc.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
      } catch (err) {
        console.error(err);
        setTemplateState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Ошибка экспорта в PDF' }));
        pdfExportRef.current = null;
        setPdfExport({ active: false, progress: null });
        setCurrentPage(ref.initialPage);
        return;
      }

      ref.nextIndex += 1;
      setPdfExport((prev) => (prev.progress ? { ...prev, progress: { ...prev.progress, current: ref.nextIndex } } : prev));

      if (ref.nextIndex < pageCount) {
        setCurrentPage(ref.nextIndex);
      } else {
        ref.doc.save(`maket-${template?.name ?? 'maket'}-all.pdf`);
        pdfExportRef.current = null;
        setPdfExport({ active: false, progress: null });
        setCurrentPage(ref.initialPage);
      }
    };

    const rafId = requestAnimationFrame(() => requestAnimationFrame(capture));
    return () => cancelAnimationFrame(rafId);
  }, [exportingPdf, currentPage, pageCount, pageWidth, pageHeight, scale, template?.name]);

  if (loading) {
    return (
      <AdminPageLayout title="Редактор макета" icon={<AppIcon name="image" size="sm" />} onBack={() => navigate(-1)}>
        <div className="design-editor-loading">Загрузка шаблона...</div>
      </AdminPageLayout>
    );
  }

  if (error || !template) {
    return (
      <AdminPageLayout title="Редактор макета" icon={<AppIcon name="image" size="sm" />} onBack={() => navigate(-1)}>
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
        <DesignEditorSidebar activeSection={sidebarSection} onSectionChange={(v) => setUi((u) => ({ ...u, sidebarSection: v }))} />

        <div className="design-editor-main">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAddImage}
            style={{ display: 'none' }}
            aria-hidden
          />
          <DesignEditorToolbar
            onAddText={handleAddText}
            selectedText={selectedText ?? null}
            selectedTextId={selectedTextId}
            currentPage={currentPage}
            pages={pages}
            setPages={setPages}
            pageCount={pageCount}
            onPagePrev={() => { setCurrentPage((p) => Math.max(0, p - 1)); setSelectedTextId(null); setSelectedImageId(null); setSelectedPhotoFieldId(null); }}
            onPageNext={() => { setCurrentPage((p) => Math.min(pageCount - 1, p + 1)); setSelectedTextId(null); setSelectedImageId(null); setSelectedPhotoFieldId(null); }}
            setSelectedTextId={setSelectedTextId}
            showGuides={showGuides}
            onGuidesToggle={() => setUi((u) => ({ ...u, showGuides: !u.showGuides }))}
            onSave={handleSave}
            saving={saving}
            hasOrderContext={hasOrderContext}
            onExportPdf={handleExportPdf}
            exportingPdf={exportingPdf}
            pdfExportProgress={pdfExportProgress}
            onClose={() => navigate(catalogPath)}
          />

          <div className="design-editor-canvas-wrap">
            <DesignEditorCanvas
              template={template}
              stageWidth={stageW}
              stageHeight={stageH}
              pageWidthPx={pageW}
              pageHeightPx={pageH}
              safeZonePx={safeZonePx}
              currentPageData={currentPageData}
              pages={pages}
              currentPage={currentPage}
              setPages={setPages}
              selectedTextId={selectedTextId}
              setSelectedTextId={setSelectedTextId}
              selectedImageId={selectedImageId}
              setSelectedImageId={setSelectedImageId}
              selectedPhotoFieldId={selectedPhotoFieldId}
              setSelectedPhotoFieldId={setSelectedPhotoFieldId}
              onPhotoFieldDrop={handlePhotoFieldDrop}
              getPhotoFieldIdAt={getPhotoFieldIdAt}
              showGuides={showGuides}
              stageRef={stageRef}
              guidesLayerRef={guidesLayerRef}
              apiBaseUrl={API_BASE_URL}
            />
          </div>

          <div className="design-editor-info">
            <p>Формат: {pageWidth}×{pageHeight} мм</p>
            {showGuides && (
              <p className="design-editor-guides-legend">
                <span style={{ color: '#c41e3a' }}>—</span> линия обрезки &nbsp;
                <span style={{ color: '#0d9488' }}>—</span> безопасная зона ({SAFE_ZONE_MM} мм)
              </p>
            )}
            {hasOrderContext ? (
              <p>Макет будет загружен в заказ #{orderId}{orderItemId > 0 ? ' и привязан к позиции' : ''}.</p>
            ) : (
              <p>Перетаскивайте фото. Для сохранения в заказ откройте редактор из карточки заказа (Файлы → Создать макет).</p>
            )}
          </div>
        </div>

        <ImagePickerModal
          isOpen={imagePickerOpen}
          onClose={() => { setImagePickerOpen(false); setImagePickerInitialFiles([]); }}
          onSelect={handleImagePickerSelect}
          initialFiles={imagePickerInitialFiles}
        />

        {sidebarSection && (
          <aside className="design-editor-panel" aria-label={`Панель: ${SIDEBAR_ITEMS.find((i) => i.id === sidebarSection)?.label}`}>
            <DesignEditorPanel
              section={sidebarSection}
              onClose={() => setUi((u) => ({ ...u, sidebarSection: null }))}
              onAddImage={() => openImagePicker()}
              onAddPhotoField={handleAddPhotoField}
              onPhotoDrop={handlePhotoDrop}
              onPhotoDragOver={handlePhotoDropOver}
              photoSort={photoSort}
              onPhotoSortChange={(v) => setPhotoPanel((p) => ({ ...p, sort: v }))}
              photoAutofill={photoAutofill}
              onPhotoAutofillChange={(v) => setPhotoPanel((p) => ({ ...p, autofill: v }))}
              photoHideUsed={photoHideUsed}
              onPhotoHideUsedChange={(v) => setPhotoPanel((p) => ({ ...p, hideUsed: v }))}
              onAddText={handleAddText}
              selectedText={selectedText ?? null}
              onTextChange={handleTextChange}
              onFontChange={handleFontChange}
              onFontSizeChange={handleFontSizeChange}
              collagePhotoCount={collageState.photoCount}
              onCollagePhotoCountChange={(v) => setCollageState((c) => ({ ...c, photoCount: v }))}
              collageFilterSuitable={collageState.filterSuitable}
              onCollageFilterSuitableChange={(v) => setCollageState((c) => ({ ...c, filterSuitable: v }))}
              collagePadding={collageState.padding}
              onCollagePaddingChange={(v) => setCollageState((c) => ({ ...c, padding: v }))}
              collageSelectedTemplateId={collageState.selectedTemplateId}
              onCollageSelectTemplate={(id) => setCollageState((c) => ({ ...c, selectedTemplateId: id }))}
            />
          </aside>
        )}
      </div>
    </AdminPageLayout>
  );
};

export default DesignEditorPage;
