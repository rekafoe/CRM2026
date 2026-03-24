import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert, Button } from '../../components/common';
import { getDesignTemplate, uploadOrderFile, updateOrderItem, type DesignTemplate } from '../../api';
import { API_BASE_URL } from '../../config/constants';
import {
  MM_TO_PX,
  SAFE_ZONE_MM,
  getExportPixelRatio,
  SIDEBAR_ITEMS,
  EMPTY_PAGE,
} from './designEditor/constants';
import type { DesignPage, SidebarSection, SelectedObjProps } from './designEditor/types';
import { DesignEditorSidebar } from './designEditor/DesignEditorSidebar';
import { DesignEditorPanel } from './designEditor/DesignEditorPanel';
import { DesignEditorToolbar } from './designEditor/DesignEditorToolbar';
import {
  DesignEditorCanvas,
  type DesignEditorCanvasHandle,
} from './designEditor/DesignEditorCanvas';
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
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);

  // ── Page spec ───────────────────────────────────────────────────────────────
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

  // ── Canvas ref (imperative handle) ──────────────────────────────────────────
  const canvasHandleRef = useRef<DesignEditorCanvasHandle | null>(null);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [ui, setUi] = useState<{ showGuides: boolean; sidebarSection: SidebarSection | null }>({
    showGuides: true,
    sidebarSection: 'photo',
  });
  const { showGuides, sidebarSection } = ui;

  const [photoPanel, setPhotoPanel] = useState({
    sort: 'name' as 'name' | 'date',
    autofill: false,
    hideUsed: false,
  });
  const { sort: photoSort, autofill: photoAutofill, hideUsed: photoHideUsed } = photoPanel;

  const [exportingPdf, setExportingPdf] = useState(false);

  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerInitialFiles, setImagePickerInitialFiles] = useState<File[]>([]);

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
      let spec: { width_mm?: number; height_mm?: number; page_count?: number } = {};
      try {
        if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
      } catch {
        // ignore parse error
      }
      const w = spec.width_mm ?? 90;
      const h = spec.height_mm ?? 55;
      const count = Math.max(1, Math.min(99, Number(spec.page_count) || 1));
      const sc = Math.min(500 / (w * MM_TO_PX), 2);
      setTemplateState((s) => ({ ...s, template: t, loading: false, error: null }));
      setPageSpec({ pageWidth: w, pageHeight: h, pageCount: count, scale: sc });
      setPages(Array.from({ length: count }, () => ({ ...EMPTY_PAGE })));
      setCurrentPage(0);
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

  // ── Image from file picker ───────────────────────────────────────────────────
  const addImageFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    void canvasHandleRef.current?.addImageFromFile(file);
  }, []);

  const handleAddImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) addImageFromFile(file);
      e.target.value = '';
    },
    [addImageFromFile],
  );

  const openImagePicker = useCallback((initialFiles?: File[]) => {
    setImagePickerInitialFiles(initialFiles ?? []);
    setImagePickerOpen(true);
  }, []);

  const handleImagePickerSelect = useCallback(
    (files: File[]) => {
      files.filter((f) => f.type.startsWith('image/')).forEach((f) => addImageFromFile(f));
      setImagePickerOpen(false);
      setImagePickerInitialFiles([]);
    },
    [addImageFromFile],
  );

  const handlePhotoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
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
    canvasHandleRef.current?.addText();
  }, []);

  const handleTextChange = useCallback((text: string) => {
    canvasHandleRef.current?.setTextProp('text', text);
  }, []);

  const handleFontChange = useCallback((fontFamily: string) => {
    canvasHandleRef.current?.setTextProp('fontFamily', fontFamily);
  }, []);

  const handleFontSizeChange = useCallback((fontSize: number) => {
    canvasHandleRef.current?.setTextProp('fontSize', fontSize);
  }, []);

  const handleTextColorChange = useCallback((fill: string) => {
    canvasHandleRef.current?.setTextProp('fill', fill);
  }, []);

  const handleFontWeightToggle = useCallback(() => {
    const w = selectedObj?.fontWeight === 'bold' ? 'normal' : 'bold';
    canvasHandleRef.current?.setTextProp('fontWeight', w);
  }, [selectedObj?.fontWeight]);

  const handleFontStyleToggle = useCallback(() => {
    const s = selectedObj?.fontStyle === 'italic' ? 'normal' : 'italic';
    canvasHandleRef.current?.setTextProp('fontStyle', s);
  }, [selectedObj?.fontStyle]);

  const handleUnderlineToggle = useCallback(() => {
    canvasHandleRef.current?.setTextProp('underline', !selectedObj?.underline);
  }, [selectedObj?.underline]);

  const handleTextAlignChange = useCallback((textAlign: string) => {
    canvasHandleRef.current?.setTextProp('textAlign', textAlign);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const handle = canvasHandleRef.current;
    if (!handle) return;

    const currentJson = handle.saveCurrentPage();
    const updatedPages = pages.map((p, i) =>
      i === currentPage ? { fabricJSON: currentJson } : p,
    );

    const designState = {
      templateId: templateId ? parseInt(templateId, 10) : null,
      pageWidth,
      pageHeight,
      pageCount,
      pages: updatedPages,
    };

    if (hasOrderContext) {
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
              designState,
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
    } else {
      console.log('Design state:', designState);
      alert('Макет сохранён в консоль. Для сохранения в заказ откройте редактор из карточки заказа.');
    }
  }, [
    pages,
    currentPage,
    templateId,
    pageWidth,
    pageHeight,
    pageCount,
    hasOrderContext,
    orderId,
    orderItemId,
    navigate,
  ]);

  // ── PDF export ────────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    const handle = canvasHandleRef.current;
    if (!handle || pageCount < 1) return;

    setExportingPdf(true);
    try {
      // Save current page state first
      const currentJson = handle.saveCurrentPage();
      const allPages = pages.map((p, i) =>
        i === currentPage ? { fabricJSON: currentJson } : p,
      );

      const doc = new jsPDF({
        unit: 'mm',
        format: [pageWidth, pageHeight],
        hotfixes: ['px_scaling'],
      });

      for (let i = 0; i < pageCount; i++) {
        await handle.loadPage(allPages[i] ?? EMPTY_PAGE);
        // Allow render to settle
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const dataUrl = handle.getDataURL({ multiplier: 2 });
        if (i > 0) doc.addPage([pageWidth, pageHeight]);
        doc.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
      }

      doc.save(`maket-${template?.name ?? 'maket'}-all.pdf`);

      // Restore current page view
      await handle.loadPage(allPages[currentPage] ?? EMPTY_PAGE);
    } catch (err) {
      console.error(err);
      setTemplateState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Ошибка экспорта в PDF',
      }));
    } finally {
      setExportingPdf(false);
    }
  }, [pages, currentPage, pageCount, pageWidth, pageHeight, template?.name]);

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

        <div className="design-editor-main">
          {/* Скрытый input для добавления изображений из тулбара */}
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
            selectedObj={selectedObj}
            currentPage={currentPage}
            pageCount={pageCount}
            onPagePrev={() => setCurrentPage((p) => Math.max(0, p - 1))}
            onPageNext={() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1))}
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
            onUndo={() => canvasHandleRef.current?.undo()}
            onRedo={() => canvasHandleRef.current?.redo()}
            onDeleteSelected={() => canvasHandleRef.current?.deleteSelected()}
            zoom={zoom}
            onZoomIn={() => canvasHandleRef.current?.setZoom((canvasHandleRef.current.getZoom() * 1.2))}
            onZoomOut={() => canvasHandleRef.current?.setZoom((canvasHandleRef.current.getZoom() / 1.2))}
            onZoomReset={() => canvasHandleRef.current?.setZoom(1)}
            onTextColorChange={handleTextColorChange}
            onFontWeightToggle={handleFontWeightToggle}
            onFontStyleToggle={handleFontStyleToggle}
            onUnderlineToggle={handleUnderlineToggle}
            onTextAlignChange={handleTextAlignChange}
            onFontChange={handleFontChange}
            onFontSizeChange={handleFontSizeChange}
          />

          <div className="design-editor-canvas-wrap">
            <DesignEditorCanvas
              ref={canvasHandleRef}
              template={template}
              pageWidthPx={pageW}
              pageHeightPx={pageH}
              safeZonePx={safeZonePx}
              pages={pages}
              setPages={setPages}
              currentPage={currentPage}
              showGuides={showGuides}
              apiBaseUrl={API_BASE_URL}
              onSelectionChange={setSelectedObj}
              onHistoryChange={(u, r) => {
                setCanUndo(u);
                setCanRedo(r);
              }}
              onZoomChange={setZoom}
            />
          </div>

          <div className="design-editor-info">
            <p>
              Формат: {pageWidth}×{pageHeight} мм &nbsp;|&nbsp; Масштаб:{' '}
              {Math.round(zoom * 100)}%
            </p>
            {showGuides && (
              <p className="design-editor-guides-legend">
                <span style={{ color: '#c41e3a' }}>—</span> линия обрезки &nbsp;
                <span style={{ color: '#0d9488' }}>—</span> безопасная зона ({SAFE_ZONE_MM} мм)
                &nbsp;|&nbsp; Alt+перетащить — панорамирование
              </p>
            )}
            {hasOrderContext ? (
              <p>
                Макет будет загружен в заказ #{orderId}
                {orderItemId > 0 ? ' и привязан к позиции' : ''}.
              </p>
            ) : (
              <p>
                Перетаскивайте фото. Двойной клик по полю для фото — загрузить изображение.
              </p>
            )}
          </div>
        </div>

        <ImagePickerModal
          isOpen={imagePickerOpen}
          onClose={() => {
            setImagePickerOpen(false);
            setImagePickerInitialFiles([]);
          }}
          onSelect={handleImagePickerSelect}
          initialFiles={imagePickerInitialFiles}
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
              onAddPhotoField={() => canvasHandleRef.current?.addPhotoField()}
              onAddShape={(type) => canvasHandleRef.current?.addShape(type)}
              onPhotoDrop={handlePhotoDrop}
              onPhotoDragOver={handlePhotoDropOver}
              photoSort={photoSort}
              onPhotoSortChange={(v) => setPhotoPanel((p) => ({ ...p, sort: v }))}
              photoAutofill={photoAutofill}
              onPhotoAutofillChange={(v) => setPhotoPanel((p) => ({ ...p, autofill: v }))}
              photoHideUsed={photoHideUsed}
              onPhotoHideUsedChange={(v) => setPhotoPanel((p) => ({ ...p, hideUsed: v }))}
              onAddText={handleAddText}
              selectedObj={selectedObj}
              onTextChange={handleTextChange}
              onFontChange={handleFontChange}
              onFontSizeChange={handleFontSizeChange}
              onTextColorChange={handleTextColorChange}
              onFontWeightToggle={handleFontWeightToggle}
              onFontStyleToggle={handleFontStyleToggle}
              onUnderlineToggle={handleUnderlineToggle}
              onTextAlignChange={handleTextAlignChange}
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
      </div>
    </AdminPageLayout>
  );
};

export default DesignEditorPage;
