import React, { useMemo, useState } from 'react';
import { OrderFile, Item } from '../types';
import {
  listOrderFiles,
  uploadOrderFile,
  deleteOrderFile,
  approveOrderFile,
  downloadOrderFile,
  getCurrentUser,
  getOrderFileAccessLogs,
  getPreflightReport,
  getOrderItemEditorProductionManifest,
  type OrderFileAccessLog,
  type PreflightReport,
} from '../api';
import { AppIcon } from './ui/AppIcon';
import { OrderFileAccessLogsModal } from './OrderFileAccessLogsModal';
import { PreflightReportModal } from './PreflightReportModal';
import { getEditorItemSummary } from './order/editorItemSummary';
import { sanitizeOrderItemDescription } from './order/orderItemUtils';
import { EditorItemPreviewModal } from './order/EditorItemPreviewModal';
import './FilesModal.css';

const PREFLIGHT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/tiff'];

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  /** Позиции заказа — для привязки файлов и группировки по позициям */
  items?: Item[];
}

function getItemLabel(item: Item, index: number): string {
  const raw = item.params?.description || item.type || '';
  const cleaned = sanitizeOrderItemDescription(String(raw), item.type).trim();
  const name = cleaned || item.type || `Позиция ${index + 1}`;
  const short = name.length > 64 ? `${name.slice(0, 61)}…` : name;
  return `${index + 1}. ${short}`;
}

function isExternalFile(file: OrderFile): boolean {
  return Boolean(file.storage && file.storage !== 'local');
}

function formatFileSize(size?: number): string {
  if (size == null || !Number.isFinite(Number(size))) return '—';
  const bytes = Number(size);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
  return `${Math.round(bytes / 1024 / 1024 / 102.4) / 10} GB`;
}

function getExternalStatusLabel(status?: string | null): string {
  if (status === 'processing') return 'Готовится';
  if (status === 'failed') return 'Ошибка подготовки';
  if (status === 'ready') return 'Готов';
  return status || 'Статус неизвестен';
}

export const FilesModal: React.FC<FilesModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  items = [],
}) => {
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<number | null>(null);
  const [preflightFile, setPreflightFile] = useState<{ id: number; name: string } | null>(null);
  const [preflightReport, setPreflightReport] = useState<PreflightReport | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [preflightCache, setPreflightCache] = useState<Record<number, PreflightReport>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessLogFile, setAccessLogFile] = useState<{ id: number; name: string } | null>(null);
  const [accessLogs, setAccessLogs] = useState<OrderFileAccessLog[]>([]);
  const [accessLogsLoading, setAccessLogsLoading] = useState(false);
  const [accessLogsError, setAccessLogsError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [editorActionLoading, setEditorActionLoading] = useState(false);
  const [editorActionError, setEditorActionError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      void loadFiles();
      void loadCurrentUserRole();
    }
  }, [isOpen, orderId]);

  const loadCurrentUserRole = async () => {
    try {
      const res = await getCurrentUser();
      setIsAdmin(res.data?.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  };

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const response = await listOrderFiles(orderId);
      setFiles(response.data);
    } catch (error) {
      console.error('Ошибка загрузки файлов:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadProductionManifest = async (item: Item) => {
    setEditorActionLoading(true);
    setEditorActionError(null);
    try {
      const res = await getOrderItemEditorProductionManifest(orderId, item.id);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-${orderNumber || orderId}-item-${item.id}-editor-manifest.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setEditorActionError(error instanceof Error ? error.message : 'Не удалось подготовить production manifest');
    } finally {
      setEditorActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    const input = e.currentTarget;
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: newFile } = await uploadOrderFile(orderId, file, selectedOrderItemId ?? undefined);
      await loadFiles();
      if (input) input.value = '';
      const mime = (newFile?.mime ?? file.type ?? '').toLowerCase();
      if (newFile?.id && PREFLIGHT_MIME_TYPES.includes(mime)) {
        try {
          const res = await getPreflightReport(orderId, newFile.id);
          setPreflightCache((prev) => ({ ...prev, [newFile.id]: res.data }));
        } catch {
          /* manual preflight still available */
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить файл';
      alert(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (isDownloadingAll) return;
    setIsDownloadingAll(true);
    try {
      await Promise.all(
        files.map(
          (file, index) =>
            new Promise<void>((resolve) => {
              window.setTimeout(() => {
                void handleDownloadFile(file).finally(resolve);
              }, index * 200);
            }),
        ),
      );
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDownloadFile = async (file: OrderFile) => {
    if (isExternalFile(file)) {
      if (file.externalStatus && file.externalStatus !== 'ready') {
        alert(`Файл ещё не готов: ${getExternalStatusLabel(file.externalStatus)}`);
        return;
      }
      await downloadOrderFile(orderId, file.id, file.originalName || file.filename).catch((error) => {
        const msg = error instanceof Error ? error.message : 'Не удалось скачать внешний файл';
        alert(msg);
      });
      return;
    }
    await downloadOrderFile(orderId, file.id, file.originalName || file.filename).catch(() =>
      alert('Не удалось скачать файл'),
    );
  };

  const handleApproveFile = async (fileId: number) => {
    try {
      await approveOrderFile(orderId, fileId);
      await loadFiles();
    } catch {
      alert('Не удалось утвердить файл');
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот файл?')) return;
    try {
      await deleteOrderFile(orderId, fileId);
      await loadFiles();
    } catch {
      alert('Не удалось удалить файл');
    }
  };

  const handlePreflight = async (file: OrderFile) => {
    setPreflightFile({ id: file.id, name: file.originalName || file.filename });
    setPreflightReport(null);
    setPreflightError(null);
    setPreflightLoading(true);
    try {
      const res = await getPreflightReport(orderId, file.id);
      setPreflightReport(res.data);
      setPreflightCache((prev) => ({ ...prev, [file.id]: res.data }));
    } catch (err) {
      setPreflightError(err instanceof Error ? err.message : 'Ошибка проверки');
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleAccessLogs = async (file: OrderFile) => {
    setAccessLogFile({ id: file.id, name: file.originalName || file.filename });
    setAccessLogs([]);
    setAccessLogsError(null);
    setAccessLogsLoading(true);
    try {
      const res = await getOrderFileAccessLogs(orderId, file.id);
      setAccessLogs(res.data ?? []);
    } catch (error) {
      setAccessLogsError(error instanceof Error ? error.message : 'Не удалось загрузить журнал');
    } finally {
      setAccessLogsLoading(false);
    }
  };

  const closeAccessLogs = () => {
    setAccessLogFile(null);
    setAccessLogs([]);
    setAccessLogsError(null);
  };

  const getPreflightStatus = (report: PreflightReport): 'ok' | 'warning' | 'error' => {
    const hasError = report.issues?.some((i) => i.severity === 'error') ?? false;
    const hasWarning = report.issues?.some((i) => i.severity === 'warning') ?? false;
    if (hasError || !report.valid) return 'error';
    if (hasWarning) return 'warning';
    return 'ok';
  };

  const closePreflight = () => {
    setPreflightFile(null);
    setPreflightReport(null);
    setPreflightError(null);
  };

  const canPreflight = (file: OrderFile) => {
    if (isExternalFile(file)) return false;
    const m = (file.mime || '').toLowerCase();
    return PREFLIGHT_MIME_TYPES.includes(m);
  };

  const approvedCount = files.filter((f) => f.approved).length;
  const pendingCount = files.length - approvedCount;
  const selectedOrderItem =
    selectedOrderItemId != null ? items.find((item) => item.id === selectedOrderItemId) : null;
  const selectedPhotoBatch = selectedOrderItem?.params?.photoBatch;
  const selectedPhotoBatchSummary = selectedPhotoBatch
    ? `${selectedPhotoBatch.totalFiles ?? 0} файлов · ${selectedPhotoBatch.totalQuantity ?? 0} отпечатков`
    : null;
  const selectedEditorSummary = selectedOrderItem ? getEditorItemSummary(selectedOrderItem) : null;
  const canOpenEditorPreview = Boolean(
    selectedOrderItem?.params.designState || selectedOrderItem?.params.photoBatch,
  );

  const filesByItem = useMemo(() => {
    const map = new Map<number | null, OrderFile[]>();
    for (const f of files) {
      const k = f.orderItemId ?? null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    return map;
  }, [files]);

  const renderFileList = (list: OrderFile[]) =>
    list.map((file) => {
      const cached = canPreflight(file) ? preflightCache[file.id] : null;
      const status = cached ? getPreflightStatus(cached) : null;
      const external = isExternalFile(file);
      const canDownload = !external || !file.externalStatus || file.externalStatus === 'ready';
      return (
        <div
          key={file.id}
          className={`fm-file${file.approved ? ' fm-file--approved' : ''}${external ? ' fm-file--external' : ''}`}
        >
          <div className="fm-file__main">
            <button
              type="button"
              className="fm-file__name"
              onClick={() => void handleDownloadFile(file)}
              title="Скачать"
            >
              {file.originalName || file.filename}
            </button>
            <div className="fm-file__meta">
              <span>{formatFileSize(file.size)}</span>
              {file.uploadedAt && (
                <span>{new Date(file.uploadedAt).toLocaleDateString('ru-RU')}</span>
              )}
              {file.partNumber != null && <span>часть {file.partNumber}</span>}
              {file.artifactType && <span className="fm-chip">{file.artifactType}</span>}
              {external && (
                <span className="fm-chip fm-chip--muted">
                  {file.externalProvider || file.storage}
                  {file.externalStatus ? ` · ${getExternalStatusLabel(file.externalStatus)}` : ''}
                </span>
              )}
              {canPreflight(file) && (
                <span
                  className={`fm-chip fm-chip--preflight fm-chip--preflight-${status ?? 'none'}`}
                  title={
                    status === 'ok'
                      ? 'Префлайт: ок'
                      : status === 'warning'
                        ? 'Префлайт: предупреждения'
                        : status === 'error'
                          ? 'Префлайт: ошибки'
                          : 'Не проверен'
                  }
                >
                  {status === 'ok' && 'Префлайт OK'}
                  {status === 'warning' && 'Префлайт !'}
                  {status === 'error' && 'Префлайт ✕'}
                  {status === null && 'Префлайт'}
                </span>
              )}
              {file.approved && <span className="fm-chip fm-chip--ok">Утверждён</span>}
            </div>
          </div>
          <div className="fm-file__actions">
            {canPreflight(file) && (
              <button
                type="button"
                className="fm-icon-btn"
                onClick={() => void handlePreflight(file)}
                title={cached ? 'Отчёт префлайта' : 'Проверить макет'}
              >
                <AppIcon name="shield" size="xs" />
              </button>
            )}
            <button
              type="button"
              className="fm-icon-btn"
              onClick={() => void handleDownloadFile(file)}
              title={canDownload ? 'Скачать' : 'Файл ещё не готов'}
              disabled={!canDownload}
            >
              <AppIcon name="download" size="xs" />
            </button>
            {isAdmin && (
              <button
                type="button"
                className="fm-icon-btn"
                onClick={() => void handleAccessLogs(file)}
                title="Журнал скачиваний"
              >
                <AppIcon name="folder" size="xs" />
              </button>
            )}
            {!file.approved && (
              <button
                type="button"
                className="fm-icon-btn fm-icon-btn--ok"
                onClick={() => void handleApproveFile(file.id)}
                title="Утвердить"
              >
                <AppIcon name="check" size="xs" />
              </button>
            )}
            <button
              type="button"
              className="fm-icon-btn fm-icon-btn--danger"
              onClick={() => void handleDeleteFile(file.id)}
              title="Удалить"
            >
              <AppIcon name="x" size="xs" />
            </button>
          </div>
        </div>
      );
    });

  if (!isOpen) return null;

  return (
    <div className="files-modal-overlay" onClick={onClose}>
      <div className="files-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div>
            <h3>Файлы макетов</h3>
            <p>Заказ #{orderNumber}</p>
          </div>
          <button type="button" className="fm-btn-close" onClick={onClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </header>

        <div className="fm-toolbar">
          <div className="fm-status">
            <span className="fm-status-badge">{files.length} файлов</span>
            {approvedCount > 0 && (
              <span className="fm-status-badge fm-status-badge--ok">{approvedCount} утв.</span>
            )}
            {pendingCount > 0 && (
              <span className="fm-status-badge fm-status-badge--pending">{pendingCount} ждут</span>
            )}
          </div>

          <span className="fm-toolbar-spacer" />

          {items.length > 0 && (
            <select
              className="fm-select"
              value={selectedOrderItemId ?? ''}
              onChange={(e) =>
                setSelectedOrderItemId(e.target.value === '' ? null : Number(e.target.value))
              }
              title="К какой позиции привязать загрузку"
            >
              <option value="">Общие (без привязки)</option>
              {items.map((it, i) => (
                <option key={it.id} value={it.id}>
                  {getItemLabel(it, i)}
                </option>
              ))}
            </select>
          )}

          {files.length > 0 && (
            <button
              type="button"
              className="fm-btn fm-btn--secondary"
              onClick={() => void handleDownloadAll()}
              disabled={isDownloadingAll}
              aria-busy={isDownloadingAll}
            >
              {isDownloadingAll ? (
                <>
                  <span className="fm-spinner" aria-hidden />
                  Скачиваем…
                </>
              ) : (
                <>
                  <AppIcon name="download" size="xs" />
                  Скачать все
                </>
              )}
            </button>
          )}

          <label className={`fm-btn fm-btn--primary${isUploading ? ' is-busy' : ''}`}>
            <input
              type="file"
              onChange={(e) => void handleFileUpload(e)}
              disabled={isUploading}
              className="fm-file-input"
            />
            {isUploading ? (
              <>
                <AppIcon name="refresh" size="xs" /> Загрузка…
              </>
            ) : (
              <>Загрузить</>
            )}
          </label>
        </div>

        {selectedOrderItem && selectedEditorSummary && (
          <div className={`fm-editor-bar fm-editor-bar--${selectedEditorSummary.kind}`}>
            <div className="fm-editor-bar__text">
              <strong>{selectedEditorSummary.label}</strong>
              <span>{selectedEditorSummary.detail}</span>
              {selectedPhotoBatchSummary && <span>· {selectedPhotoBatchSummary}</span>}
            </div>
            <div className="fm-editor-bar__actions">
              {canOpenEditorPreview && (
                <button
                  type="button"
                  className="fm-btn fm-btn--ghost"
                  onClick={() => setPreviewItem(selectedOrderItem)}
                >
                  Preview
                </button>
              )}
              {canOpenEditorPreview && (
                <button
                  type="button"
                  className="fm-btn fm-btn--ghost"
                  onClick={() => void handleDownloadProductionManifest(selectedOrderItem)}
                  disabled={editorActionLoading}
                >
                  Manifest
                </button>
              )}
            </div>
          </div>
        )}

        {editorActionError && <div className="fm-error">{editorActionError}</div>}

        <div className="fm-body">
          {isLoading ? (
            <div className="fm-empty">Загрузка файлов…</div>
          ) : files.length === 0 ? (
            <div className="fm-empty">
              <AppIcon name="document" size="xl" />
              <strong>Файлов пока нет</strong>
              <span>Загрузите макет или дождитесь файлов с сайта</span>
            </div>
          ) : (
            <div className="fm-list">
              {filesByItem.has(null) && (
                <section className="fm-group">
                  <h4 className="fm-group__title">Общие</h4>
                  {renderFileList(filesByItem.get(null)!)}
                </section>
              )}
              {items.map(
                (it, i) =>
                  filesByItem.has(it.id) && (
                    <section key={it.id} className="fm-group">
                      <h4 className="fm-group__title">{getItemLabel(it, i)}</h4>
                      {renderFileList(filesByItem.get(it.id)!)}
                    </section>
                  ),
              )}
              {Array.from(filesByItem.entries())
                .filter(([k]) => k !== null && !items.some((i) => i.id === k))
                .map(([itemId, list]) => (
                  <section key={`item-${itemId}`} className="fm-group">
                    <h4 className="fm-group__title">Позиция #{itemId}</h4>
                    {renderFileList(list)}
                  </section>
                ))}
            </div>
          )}
        </div>
      </div>

      <PreflightReportModal
        isOpen={preflightFile !== null}
        onClose={closePreflight}
        fileName={preflightFile?.name ?? ''}
        report={preflightReport}
        isLoading={preflightLoading}
        error={preflightError}
        orderId={orderId}
        fileId={preflightFile?.id ?? 0}
      />
      <OrderFileAccessLogsModal
        isOpen={accessLogFile !== null}
        fileName={accessLogFile?.name ?? ''}
        logs={accessLogs}
        isLoading={accessLogsLoading}
        error={accessLogsError}
        onClose={closeAccessLogs}
      />
      <EditorItemPreviewModal
        item={previewItem}
        orderId={orderId}
        isOpen={previewItem !== null}
        onClose={() => setPreviewItem(null)}
      />
    </div>
  );
};
