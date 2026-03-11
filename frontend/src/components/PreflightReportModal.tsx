import React, { useEffect, useRef, useState } from 'react';
import { AppIcon } from './ui/AppIcon';
import { fetchOrderFileForPreview, type PreflightReport } from '../api';
import './PreflightReportModal.css';

const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs';

async function loadPdfJs(): Promise<{
  version: string;
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{ getPage: (n: number) => Promise<PDFPage> }> };
}> {
  const g = window as Window & { pdfjsLib?: unknown };
  if (g.pdfjsLib) return g.pdfjsLib as Awaited<ReturnType<typeof loadPdfJs>>;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = PDFJS_CDN;
    script.onload = () => {
      if (g.pdfjsLib) resolve(g.pdfjsLib as Awaited<ReturnType<typeof loadPdfJs>>);
      else reject(new Error('PDF.js не загрузился'));
    };
    script.onerror = () => reject(new Error('Ошибка загрузки PDF.js'));
    document.head.appendChild(script);
  });
}

interface PDFPage {
  getViewport: (p: { scale: number }) => { width: number; height: number };
  render: (p: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[];
  }) => { promise: Promise<void> };
}

interface PreflightReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  report: PreflightReport | null;
  isLoading: boolean;
  error?: string | null;
  orderId?: number;
  fileId?: number;
}

const TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  jpeg: 'JPG',
  png: 'PNG',
  tiff: 'TIFF',
};

function formatInfo(info: Record<string, unknown>): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  if (info.pageCount != null) items.push({ label: 'Страниц', value: String(info.pageCount) });
  if (info.width != null && info.height != null) items.push({ label: 'Размер', value: `${info.width}×${info.height}` });
  if (info.dpi != null) items.push({ label: 'DPI', value: String(info.dpi) });
  if (info.colorSpace != null) items.push({ label: 'Цвет', value: String(info.colorSpace) });
  if (info.fileSize != null) items.push({ label: 'Размер файла', value: `${Math.round(Number(info.fileSize) / 1024)} KB` });
  if (info.bleedBox != null) {
    const bb = info.bleedBox as { width?: number; height?: number };
    items.push({ label: 'BleedBox', value: `${bb.width ?? '?'}×${bb.height ?? '?'}` });
  }
  return items;
}

export const PreflightReportModal: React.FC<PreflightReportModalProps> = ({
  isOpen,
  onClose,
  fileName,
  report,
  isLoading,
  error,
  orderId = 0,
  fileId = 0,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pdfRendered, setPdfRendered] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  const targetFormat = report?.info?.targetFormat as { width_mm: number; height_mm: number } | undefined;
  const showPreview = targetFormat && orderId > 0 && fileId > 0;

  useEffect(() => {
    if (!showPreview || !report) return;
    setPreviewUrl(null);
    setPreviewError(null);
    setPdfRendered(false);
    let cancelled = false;
    fetchOrderFileForPreview(orderId, fileId)
      .then(async (blob) => {
        if (cancelled) return;
        const isPdf = report.type === 'pdf';
        if (isPdf) {
          try {
            const pdfjsLib = await loadPdfJs();
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;
            const doc = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
            if (cancelled) return;
            const page = await doc.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            const container = pdfContainerRef.current;
            if (!container || cancelled) return;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const outputScale = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            const renderCtx = {
              canvasContext: ctx,
              viewport,
              transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
            };
            await page.render(renderCtx).promise;
            if (cancelled) return;
            container.innerHTML = '';
            container.appendChild(canvas);
            setPdfRendered(true);
          } catch (err) {
            if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Ошибка рендеринга PDF');
          }
        } else {
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          setPreviewUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Ошибка загрузки');
      });
    return () => {
      cancelled = true;
      const url = previewUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
        previewUrlRef.current = null;
      }
      if (pdfContainerRef.current) pdfContainerRef.current.innerHTML = '';
    };
  }, [showPreview, orderId, fileId, report?.type]);

  const BLEED_MM = 3;
  const isImage = report && (report.type === 'jpeg' || report.type === 'png' || report.type === 'tiff');
  const trimLabel = targetFormat ? `Линия обрезки ${targetFormat.width_mm}×${targetFormat.height_mm} мм` : '';

  // Область превью = target + bleed; линия обрезки = target (3 мм от краёв)
  let bleedWidth = 0;
  let bleedHeight = 0;
  let trimLeft = 0;
  let trimTop = 0;
  let trimWidth = 100;
  let trimHeight = 100;
  if (targetFormat && targetFormat.width_mm > 0 && targetFormat.height_mm > 0) {
    bleedWidth = targetFormat.width_mm + 2 * BLEED_MM;
    bleedHeight = targetFormat.height_mm + 2 * BLEED_MM;
    trimLeft = (BLEED_MM / bleedWidth) * 100;
    trimTop = (BLEED_MM / bleedHeight) * 100;
    trimWidth = (targetFormat.width_mm / bleedWidth) * 100;
    trimHeight = (targetFormat.height_mm / bleedHeight) * 100;
  }

  if (!isOpen) return null;

  return (
    <div className="preflight-modal-overlay" onClick={onClose}>
      <div className="preflight-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preflight-modal-header">
          <h3>
            <AppIcon name="shield" size="sm" className="preflight-title-icon" />
            Префлайт: {fileName}
          </h3>
          <button type="button" className="preflight-btn-close" onClick={onClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </div>

        <div className="preflight-modal-body">
          <div className="preflight-modal-content">
            {isLoading && (
              <div className="preflight-loading">
                <AppIcon name="refresh" size="lg" />
                <span>Проверка макета...</span>
              </div>
            )}

            {error && (
              <div className="preflight-error">
                <AppIcon name="warning" size="sm" />
                {error}
              </div>
            )}

            {!isLoading && !error && report && (
              <>
                <div className={`preflight-status-badge preflight-status-badge--${report.valid ? 'ok' : 'error'}`}>
                  {report.valid ? (
                    <><AppIcon name="check" size="xs" /> Готов к печати</>
                  ) : (
                    <><AppIcon name="warning" size="xs" /> Есть проблемы</>
                  )}
                </div>

                <div className="preflight-info-grid">
                  <span className="preflight-info-label">Формат</span>
                  <span className="preflight-info-value">{TYPE_LABELS[report.type] ?? report.type}</span>
                  {formatInfo(report.info).map(({ label, value }) => (
                    <React.Fragment key={label}>
                      <span className="preflight-info-label">{label}</span>
                      <span className="preflight-info-value">{value}</span>
                    </React.Fragment>
                  ))}
                </div>

                {report.issues.length > 0 && (
                  <div className="preflight-issues">
                    <h4>Результаты проверки</h4>
                    <ul>
                      {report.issues.map((issue, i) => (
                        <li key={i} className={`preflight-issue preflight-issue--${issue.severity}`}>
                          {issue.severity === 'error' && <AppIcon name="x" size="xs" />}
                          {issue.severity === 'warning' && <AppIcon name="warning" size="xs" />}
                          {issue.severity === 'info' && <AppIcon name="info" size="xs" />}
                          <span>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {showPreview && (
            <div className="preflight-preview-panel">
              <h4 className="preflight-preview-panel-title">Превью</h4>
              <p className="preflight-preview-desc">Исходник масштабирован под формат + вылет 3 мм</p>
              {previewError && (
                <div className="preflight-preview-error">{previewError}</div>
              )}
              <div
                className="preflight-preview-wrap"
                data-bleed-ratio={bleedWidth > 0 && bleedHeight > 0 ? (bleedWidth / bleedHeight).toFixed(2) : undefined}
              >
              {previewUrl && isImage && (
                <div
                  className="preflight-preview"
                  style={{
                    aspectRatio: bleedWidth > 0 && bleedHeight > 0 ? `${bleedWidth} / ${bleedHeight}` : undefined,
                  }}
                >
                  <img src={previewUrl} alt="Макет" className="preflight-preview-img" />
                  <div
                    className="preflight-preview-overlay"
                    style={{
                      left: `${trimLeft}%`,
                      top: `${trimTop}%`,
                      width: `${trimWidth}%`,
                      height: `${trimHeight}%`,
                    }}
                    title={trimLabel}
                  />
                  <span className="preflight-preview-label">{trimLabel}</span>
                </div>
              )}
              {showPreview && report?.type === 'pdf' && (
                <div
                  className="preflight-preview preflight-preview-pdf"
                  style={{
                    aspectRatio: bleedWidth > 0 && bleedHeight > 0 ? `${bleedWidth} / ${bleedHeight}` : undefined,
                  }}
                >
                  <div ref={pdfContainerRef} className="preflight-preview-pdf-canvas" />
                  {!pdfRendered && (
                    <span className="preflight-preview-pdf-placeholder">PDF-превью загружается...</span>
                  )}
                  {pdfRendered && targetFormat && (
                    <>
                      <div
                        className="preflight-preview-overlay"
                        style={{
                          left: `${trimLeft}%`,
                          top: `${trimTop}%`,
                          width: `${trimWidth}%`,
                          height: `${trimHeight}%`,
                        }}
                        title={trimLabel}
                      />
                      <span className="preflight-preview-label">{trimLabel}</span>
                    </>
                  )}
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
