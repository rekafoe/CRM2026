import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from 'fabric';
import { jsPDF } from 'jspdf';
import type { Item } from '../../types';
import {
  downloadOrderFile,
  generateOrderItemProduction,
  getOrderItemProductionStatus,
} from '../../api';
import { API_BASE_URL } from '../../config/constants';
import { createDesignSceneGeometry } from '../../pages/admin/designEditor/designGeometry';
import { loadDesignPageScene } from '../../pages/admin/designEditor/designPageLoader';
import type { DesignPage, DesignState } from '../../pages/admin/designEditor/types';
import { getEditorItemSummary } from './editorItemSummary';
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
};

function isDesignState(value: unknown): value is DesignState {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as DesignState).pages));
}

async function renderDesignPageToDataUrl(
  page: DesignPage,
  designState: DesignState,
  pageIndex: number,
  multiplier = 1,
): Promise<string> {
  const geometry = createDesignSceneGeometry({
    pageWidthMm: designState.pageWidth,
    pageHeightMm: designState.pageHeight,
    safeZoneMm: designState.prepress?.safeZoneMm ?? 0,
    bleedMm: designState.prepress?.bleedMm ?? 0,
    scale: designState.sceneScale ?? 1,
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
    });
    return canvas.toDataURL({ format: 'png', multiplier });
  } finally {
    canvas.dispose();
  }
}

async function exportDesignStatePdf(designState: DesignState): Promise<void> {
  const doc = new jsPDF({
    orientation: designState.pageWidth > designState.pageHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [designState.pageWidth, designState.pageHeight],
    compress: true,
  });

  for (let i = 0; i < designState.pages.length; i++) {
    if (i > 0) doc.addPage([designState.pageWidth, designState.pageHeight], designState.pageWidth > designState.pageHeight ? 'landscape' : 'portrait');
    const dataUrl = await renderDesignPageToDataUrl(designState.pages[i], designState, i, 2);
    doc.addImage(dataUrl, 'PNG', 0, 0, designState.pageWidth, designState.pageHeight);
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
    if (!isOpen || !designState) {
      setPagePreviews([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      designState.pages.map(async (page, index) => ({
        page: index + 1,
        url: await renderDesignPageToDataUrl(page, designState, index, 1),
      })),
    )
      .then((previews) => {
        if (!cancelled) setPagePreviews(previews);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось построить preview макета');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [designState, isOpen]);

  if (!isOpen || !item || !summary) return null;

  const handleExportPdf = async () => {
    if (!designState) return;
    try {
      setExporting(true);
      setError(null);
      await exportDesignStatePdf(designState);
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

  return (
    <div className="editor-preview-modal__overlay" onClick={onClose}>
      <div className="editor-preview-modal" onClick={(event) => event.stopPropagation()}>
        <header className="editor-preview-modal__header">
          <div>
            <h3>{summary.label}</h3>
            <p>{summary.detail}</p>
          </div>
          <button type="button" className="editor-preview-modal__close" onClick={onClose}>Закрыть</button>
        </header>

        <div className="editor-preview-modal__meta">
          {item.params.editorDraftToken && <span>Draft: {item.params.editorDraftToken}</span>}
          {item.params.designTemplateId != null && <span>Template ID: {item.params.designTemplateId}</span>}
          {item.params.editorDraftMode && <span>Mode: {item.params.editorDraftMode}</span>}
        </div>

        {error && <div className="editor-preview-modal__error">{error}</div>}

        {orderId && designState && (
          <section className="editor-preview-modal__production" aria-labelledby="editor-production-heading">
            <div className="editor-preview-modal__production-header">
              <h4 id="editor-production-heading">Production PDF (CRM)</h4>
              <button
                type="button"
                className="editor-preview-modal__primary"
                onClick={() => void handleRegenerateProduction()}
                disabled={productionRegenerating || productionLoading}
              >
                {productionRegenerating ? 'В очереди…' : 'Перегенерировать'}
              </button>
            </div>
            {productionLoading ? (
              <p className="editor-preview-modal__production-hint">Загрузка статуса…</p>
            ) : (
              <>
                {productionJobs.length > 0 && (
                  <ul className="editor-preview-modal__production-jobs">
                    {productionJobs.slice(0, 5).map((job) => (
                      <li key={job.id}>
                        {job.jobType}: {JOB_STATUS_LABEL[job.status] ?? job.status}
                        {job.lastError ? ` — ${job.lastError}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {productionFiles.length > 0 ? (
                  <ul className="editor-preview-modal__production-files">
                    {productionFiles.map((file) => (
                      <li key={file.id}>
                        <button
                          type="button"
                          className="editor-preview-modal__production-file-link"
                          onClick={() => handleDownloadProductionFile(file)}
                        >
                          {file.originalName || file.filename}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="editor-preview-modal__production-hint">
                    Файл ещё не сгенерирован. Воркер создаёт PDF после заказа с сайта (нужен Puppeteer на сервере).
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {summary.layoutIncomplete && summary.layoutIssues && summary.layoutIssues.length > 0 && (
          <div className="editor-preview-modal__layout-issues" role="alert">
            <strong>Макет неполный</strong>
            <ul>
              {summary.layoutIssues.map((issue) => (
                <li key={issue.id} className={`editor-preview-modal__issue editor-preview-modal__issue--${issue.level}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
            {summary.layoutReviewPath && (
              <p className="editor-preview-modal__review-path">Путь: {summary.layoutReviewPath}</p>
            )}
          </div>
        )}

        {designState && (
          <>
            <div className="editor-preview-modal__actions">
              <button type="button" className="editor-preview-modal__primary" onClick={handleExportPdf} disabled={exporting || loading}>
                {exporting ? 'Экспортируем PDF...' : 'Скачать постраничный PDF'}
              </button>
              <span>Страницы экспортируются в порядке 1-{designState.pages.length}.</span>
            </div>
            {loading ? (
              <div className="editor-preview-modal__loading">Строим preview страниц...</div>
            ) : (
              <div className="editor-preview-modal__pages">
                {pagePreviews.map((preview) => (
                  <figure key={preview.page} className="editor-preview-modal__page">
                    <img src={preview.url} alt={`Страница ${preview.page}`} />
                    <figcaption>Страница {preview.page}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </>
        )}

        {photoBatch && (
          <div className="editor-preview-modal__photo-batch">
            {photoBatch.groups?.map((group) => (
              <section key={group.groupSizeId} className="editor-preview-modal__group">
                <h4>{group.groupLabel}</h4>
                <p>{group.quantity} отпечатков · {group.targetSizeMm.width}×{group.targetSizeMm.height} мм</p>
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
  );
};
