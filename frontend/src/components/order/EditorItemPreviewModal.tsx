import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from 'fabric';
import { jsPDF } from 'jspdf';
import type { Item } from '../../types';
import {
  downloadOrderFile,
  generateOrderItemProduction,
  getOrderItemProductionStatus,
  listOrderFiles,
} from '../../api';
import { API_BASE_URL } from '../../config/constants';
import { createDesignSceneGeometry } from '../../pages/admin/designEditor/designGeometry';
import { resolveDesignRenderSceneScale } from '../../pages/admin/designEditor/designEditorState';
import { loadDesignPageScene, type ResolveEditorImageSrc } from '../../pages/admin/designEditor/designPageLoader';
import type { DesignPage, DesignState } from '../../pages/admin/designEditor/types';
import {
  createOrderFileImageSrcResolver,
  loadClientRenderedPagePreviews,
  revokeEditorPreviewObjectUrls,
} from './editorPreviewSources';
import { getEditorItemSummary } from './editorItemSummary';
import { SouvenirPlacementPreview, parsePrintAreas, DEFAULT_PRINT_AREA_TSHIRT } from '../../features/souvenir3d';
import './EditorItemPreviewModal.css';

type ProductionJobRow = {
  id: number;
  jobType: string;
  status: string;
  lastError: string | null;
  attempts: number;
};

type ProductionFileRow = {
  id: number;
  filename: string;
  originalName: string | null;
  metadata: string | null;
};

interface EditorItemPreviewModalProps {
  item: Item | null;
  orderId?: number;
  isOpen: boolean;
  onClose: () => void;
}

type PagePreview = {
  page: number;
  url: string;
  source?: 'client_png' | 'fabric';
  printAreaId?: string;
  printAreaLabel?: string;
};

function readDesignStatePages(designState: DesignState): DesignPage[] {
  if (Array.isArray(designState.pages) && designState.pages.length > 0) {
    if (designState.editorKind === 'souvenir_3d' && Array.isArray(designState.usedPrintAreaIds)) {
      const used = new Set(designState.usedPrintAreaIds);
      return designState.pages.filter((page) => page.printAreaId && used.has(page.printAreaId));
    }
    return designState.pages;
  }
  const pageCount = Math.max(1, Number(designState.pageCount) || 1);
  return Array.from({ length: pageCount }, () => ({ fabricJSON: {} }));
}

function isDesignState(value: unknown): value is DesignState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as DesignState;
  if (Array.isArray(state.pages) && state.pages.length > 0) return true;
  const pageCount = Number(state.pageCount);
  return Number.isFinite(pageCount) && pageCount > 0;
}

async function renderDesignPageToDataUrl(
  page: DesignPage,
  designState: DesignState,
  pageIndex: number,
  multiplier = 1,
  resolveImageSrc?: ResolveEditorImageSrc,
): Promise<string> {
  const widthMm = Number(page.widthMm) > 0 ? Number(page.widthMm) : designState.pageWidth;
  const heightMm = Number(page.heightMm) > 0 ? Number(page.heightMm) : designState.pageHeight;
  const geometry = createDesignSceneGeometry({
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    safeZoneMm: designState.prepress?.safeZoneMm ?? 0,
    bleedMm: designState.prepress?.bleedMm ?? 0,
    scale: resolveDesignRenderSceneScale(designState),
  });
  const element = document.createElement('canvas');
  const canvas = new Canvas(element, {
    width: geometry.pageWidthPx,
    height: geometry.pageHeightPx,
    backgroundColor: 'white',
    preserveObjectStacking: true,
  });
  try {
    await loadDesignPageScene({
      canvas,
      pageData: page,
      pageIndex,
      template: null,
      pageW: geometry.pageWidthPx,
      pageH: geometry.pageHeightPx,
      apiBaseUrl: API_BASE_URL,
      resolveImageSrc,
      // Иначе text_* при рендере preview «прыгает» относительно редактора.
      preserveTextLayout: true,
    });
    return canvas.toDataURL({ format: 'png', multiplier });
  } finally {
    canvas.dispose();
  }
}

async function exportDesignStatePdf(
  designState: DesignState,
  resolveImageSrc?: ResolveEditorImageSrc,
): Promise<void> {
  const pages = readDesignStatePages(designState);
  if (pages.length === 0) return;
  const firstWidth = Number(pages[0].widthMm) > 0 ? Number(pages[0].widthMm) : designState.pageWidth;
  const firstHeight = Number(pages[0].heightMm) > 0 ? Number(pages[0].heightMm) : designState.pageHeight;
  const doc = new jsPDF({
    orientation: firstWidth > firstHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [firstWidth, firstHeight],
    compress: true,
  });

  for (let i = 0; i < pages.length; i += 1) {
    const widthMm = Number(pages[i].widthMm) > 0 ? Number(pages[i].widthMm) : designState.pageWidth;
    const heightMm = Number(pages[i].heightMm) > 0 ? Number(pages[i].heightMm) : designState.pageHeight;
    if (i > 0) doc.addPage([widthMm, heightMm], widthMm > heightMm ? 'landscape' : 'portrait');
    const dataUrl = await renderDesignPageToDataUrl(pages[i], designState, i, 2, resolveImageSrc);
    doc.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm);
  }

  doc.save(`order-item-${designState.templateId ?? 'design'}-pages.pdf`);
}

const JOB_STATUS_LABEL: Record<string, string> = {
  pending: 'В очереди',
  processing: 'Генерация…',
  done: 'Готово',
  failed: 'Ошибка',
};

export const EditorItemPreviewModal: React.FC<EditorItemPreviewModalProps> = ({
  item,
  orderId,
  isOpen,
  onClose,
}) => {
  const summary = useMemo(() => (item ? getEditorItemSummary(item) : null), [item]);
  const designState = isDesignState(item?.params.designState) ? item.params.designState : null;
  const photoBatch = item?.params.photoBatch ?? null;
  const [pagePreviews, setPagePreviews] = useState<PagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [productionJobs, setProductionJobs] = useState<ProductionJobRow[]>([]);
  const [productionFiles, setProductionFiles] = useState<ProductionFileRow[]>([]);
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionRegenerating, setProductionRegenerating] = useState(false);
  const [previewSource, setPreviewSource] = useState<'client_png' | 'fabric' | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const resolveImageSrcRef = useRef<ResolveEditorImageSrc | undefined>(undefined);
  const designPages = useMemo(
    () => (designState ? readDesignStatePages(designState) : []),
    [designState],
  );

  const loadProductionStatus = useCallback(async () => {
    if (!orderId || !item?.id || !designState) return;
    setProductionLoading(true);
    try {
      const { data } = await getOrderItemProductionStatus(orderId, item.id);
      setProductionJobs((data as { jobs?: ProductionJobRow[] }).jobs ?? []);
      setProductionFiles((data as { productionFiles?: ProductionFileRow[] }).productionFiles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статус production PDF');
    } finally {
      setProductionLoading(false);
    }
  }, [designState, item?.id, orderId]);

  useEffect(() => {
    if (!isOpen) {
      setProductionJobs([]);
      setProductionFiles([]);
      return;
    }
    void loadProductionStatus();
  }, [isOpen, loadProductionStatus]);

  useEffect(() => {
    if (!isOpen) {
      setPagePreviews([]);
      setPreviewSource(null);
      revokeEditorPreviewObjectUrls(objectUrlsRef.current);
      resolveImageSrcRef.current = undefined;
      return;
    }
    if (!designState || !item?.id) {
      setPagePreviews([]);
      setPreviewSource(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    revokeEditorPreviewObjectUrls(objectUrlsRef.current);

    void (async () => {
      try {
        let resolveImageSrc: ResolveEditorImageSrc | undefined;
        if (orderId) {
          const { data: files } = await listOrderFiles(orderId);
          const clientPreviews = await loadClientRenderedPagePreviews(
            orderId,
            item.id,
            files ?? [],
            objectUrlsRef.current,
          );
          if (clientPreviews && clientPreviews.length > 0) {
            if (!cancelled) {
              setPagePreviews(clientPreviews.map((preview) => ({
                ...preview,
                source: 'client_png' as const,
                printAreaId: designPages[preview.page - 1]?.printAreaId,
                printAreaLabel: designPages[preview.page - 1]?.printAreaLabel,
              })));
              setPreviewSource('client_png');
            }
            return;
          }
          resolveImageSrc = createOrderFileImageSrcResolver(
            orderId,
            files ?? [],
            objectUrlsRef.current,
          );
          resolveImageSrcRef.current = resolveImageSrc;
        }

        const previews = await Promise.all(
          designPages.map(async (page, index) => ({
            page: index + 1,
            url: await renderDesignPageToDataUrl(page, designState, index, 1, resolveImageSrc),
            source: 'fabric' as const,
            printAreaId: page.printAreaId,
            printAreaLabel: page.printAreaLabel,
          })),
        );
        if (!cancelled) {
          setPagePreviews(previews);
          setPreviewSource('fabric');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось построить preview макета');
          setPagePreviews([]);
          setPreviewSource(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokeEditorPreviewObjectUrls(objectUrlsRef.current);
    };
  }, [designPages, designState, isOpen, item?.id, orderId]);

  if (!isOpen || !item || !summary) return null;

  const handleExportPdf = async () => {
    if (!designState) return;
    try {
      setExporting(true);
      setError(null);
      await exportDesignStatePdf(designState, resolveImageSrcRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось экспортировать PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerateProduction = async () => {
    if (!orderId || !item?.id) return;
    try {
      setProductionRegenerating(true);
      setError(null);
      await generateOrderItemProduction(orderId, item.id);
      await loadProductionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось поставить production PDF в очередь');
    } finally {
      setProductionRegenerating(false);
    }
  };

  const handleDownloadProductionFile = (file: ProductionFileRow) => {
    if (!orderId) return;
    const name = file.originalName || file.filename;
    downloadOrderFile(orderId, file.id, name).catch((err) => {
      setError(err instanceof Error ? err.message : 'Не удалось скачать production PDF');
    });
  };

  const latestJob = productionJobs[0] ?? null;
  const latestProductionFile = productionFiles[0] ?? null;
  const productionStatus = latestJob?.status ?? (latestProductionFile ? 'done' : null);
  const showPlacement = summary.kind === 'souvenir3d' && Boolean(designState);
  const souvenirPrintAreas = parsePrintAreas(item.params.printAreas);
  const previewNote =
    previewSource === 'client_png'
      ? 'client PNG с сайта'
      : previewSource === 'fabric'
        ? 'рендер из designState'
        : null;

  return (
    <div className="editor-preview-modal__overlay" onClick={onClose}>
      <div className="editor-preview-modal" onClick={(event) => event.stopPropagation()}>
        <header className="editor-preview-modal__header">
          <div>
            <h3>{summary.label}</h3>
            <p>{summary.detail}</p>
          </div>
          <button type="button" className="editor-preview-modal__close" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="editor-preview-modal__toolbar">
          {designState && (
            <button
              type="button"
              className="editor-preview-modal__primary"
              onClick={() => void handleExportPdf()}
              disabled={exporting || loading}
            >
              {exporting ? 'Экспорт…' : 'Скачать PDF'}
            </button>
          )}

          {orderId && designState && (
            <>
              <div className="editor-preview-modal__status">
                <span>Production PDF</span>
                {productionLoading ? (
                  <span className="editor-preview-modal__status-badge">…</span>
                ) : productionStatus ? (
                  <span
                    className={`editor-preview-modal__status-badge editor-preview-modal__status-badge--${productionStatus}`}
                  >
                    {JOB_STATUS_LABEL[productionStatus] ?? productionStatus}
                  </span>
                ) : (
                  <span className="editor-preview-modal__status-badge">нет файла</span>
                )}
                {latestProductionFile && (
                  <button
                    type="button"
                    className="editor-preview-modal__link-btn"
                    onClick={() => handleDownloadProductionFile(latestProductionFile)}
                  >
                    Скачать
                  </button>
                )}
              </div>
              {latestJob?.status === 'failed' && latestJob.lastError && (
                <p className="editor-preview-modal__production-error" title={latestJob.lastError}>
                  {latestJob.lastError}
                </p>
              )}
              <button
                type="button"
                className="editor-preview-modal__secondary"
                onClick={() => void handleRegenerateProduction()}
                disabled={productionRegenerating || productionLoading}
              >
                {productionRegenerating ? 'В очереди…' : 'Перегенерировать'}
              </button>
            </>
          )}

          <span className="editor-preview-modal__toolbar-spacer" />
          {previewNote && (
            <span className="editor-preview-modal__previews-note">{previewNote}</span>
          )}
        </div>

        {error && <div className="editor-preview-modal__error">{error}</div>}

        {summary.layoutIncomplete && summary.layoutIssues && summary.layoutIssues.length > 0 && (
          <div className="editor-preview-modal__layout-issues" role="alert">
            <strong>Макет неполный</strong>
            <ul>
              {summary.layoutIssues.map((issue) => (
                <li
                  key={issue.id}
                  className={`editor-preview-modal__issue editor-preview-modal__issue--${issue.level}`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className={`editor-preview-modal__body${showPlacement ? ' editor-preview-modal__body--with-placement' : ''}`}
        >
          {showPlacement && designState && (
            <aside className="editor-preview-modal__placement" aria-labelledby="editor-placement-heading">
              <h4 id="editor-placement-heading" className="editor-preview-modal__placement-title">
                Куда наносить
              </h4>
              <p className="editor-preview-modal__placement-hint">
                Схема для оператора. В печать идёт плоский макет справа.
              </p>
              {pagePreviews.map((preview, index) => {
                const page = designPages[index];
                const configured = souvenirPrintAreas.find((area) => area.id === preview.printAreaId)
                  ?? souvenirPrintAreas[index];
                return (
                  <SouvenirPlacementPreview
                    key={preview.printAreaId ?? preview.page}
                    compact
                    printArea={
                      configured
                      ?? {
                        ...DEFAULT_PRINT_AREA_TSHIRT,
                        id: page?.printAreaId ?? `area-${preview.page}`,
                        widthMm: Number(page?.widthMm ?? designState.pageWidth) || DEFAULT_PRINT_AREA_TSHIRT.widthMm,
                        heightMm: Number(page?.heightMm ?? designState.pageHeight) || DEFAULT_PRINT_AREA_TSHIRT.heightMm,
                        label: preview.printAreaLabel || page?.printAreaLabel || summary.printAreaLabel || DEFAULT_PRINT_AREA_TSHIRT.label,
                      }
                    }
                    printImageUrl={preview.url}
                  />
                );
              })}
            </aside>
          )}

          <div className="editor-preview-modal__previews">
            {designState && (
              <div className="editor-preview-modal__previews-head">
                <h4 className="editor-preview-modal__previews-title">
                  Макет{pagePreviews.length > 1 ? ` · ${pagePreviews.length} стр.` : ''}
                </h4>
              </div>
            )}

            {designState ? (
              loading ? (
                <div className="editor-preview-modal__loading">Строим preview…</div>
              ) : pagePreviews.length > 0 ? (
                <div
                  className={`editor-preview-modal__pages${pagePreviews.length === 1 ? ' editor-preview-modal__pages--single' : ''}`}
                >
                  {pagePreviews.map((preview) => (
                    <figure key={preview.page} className="editor-preview-modal__page">
                      <img src={preview.url} alt={preview.printAreaLabel ?? `Страница ${preview.page}`} />
                      <figcaption>{preview.printAreaLabel ?? `Страница ${preview.page}`}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="editor-preview-modal__loading">Нет данных для preview.</div>
              )
            ) : null}

            {photoBatch && (
              <div className="editor-preview-modal__photo-batch">
                {photoBatch.groups?.map((group) => (
                  <section key={group.groupSizeId} className="editor-preview-modal__group">
                    <h4>{group.groupLabel}</h4>
                    <p>
                      {group.quantity} отпечатков · {group.targetSizeMm.width}×{group.targetSizeMm.height} мм
                    </p>
                    <ul>
                      {group.items?.map((photo) => (
                        <li key={`${group.groupSizeId}-${photo.fileId}`}>
                          {photo.originalName} · {photo.quantity} шт. · {photo.fitMode} · поворот {photo.rotation}°
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
