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
const EXTERNAL_DOWNLOAD_POLL_INTERVAL_MS = 2000;
const EXTERNAL_DOWNLOAD_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

type FileDownloadStage = 'waiting' | 'downloading';

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
  const [fileDownloadStageById, setFileDownloadStageById] = useState<Record<number, FileDownloadStage>>({});
  const [downloadProgressByFileId, setDownloadProgressByFileId] = useState<
    Record<number, { loadedBytes: number; totalBytes: number | null }>
  >({});
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadAllSummary, setDownloadAllSummary] = useState<{
    total: number;
    completed: number;
    failed: number;
    currentFileName: string;
    phase: FileDownloadStage;
  } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      void loadFiles();
      void loadCurrentUserRole();
      return;
    }
    setFileDownloadStageById({});
    setDownloadProgressByFileId({});
    setDownloadNotice(null);
    setDownloadAllSummary(null);
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

  const setFileDownloadStage = (fileId: number, stage: FileDownloadStage | null) => {
    setFileDownloadStageById((prev) => {
      if (stage) return { ...prev, [fileId]: stage };
      if (!(fileId in prev)) return prev;
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    if (!stage) {
      setDownloadProgressByFileId((prev) => {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    }
  };

  const waitForExternalFileReady = async (file: OrderFile): Promise<OrderFile> => {
    const fileName = file.originalName || file.filename;
    const startedAt = Date.now();
    while (true) {
      const response = await listOrderFiles(orderId);
      const latestFiles = response.data ?? [];
      setFiles(latestFiles);
      const latest = latestFiles.find((candidate) => candidate.id === file.id);
      if (!latest) {
        throw new Error(`Файл «${fileName}» больше не найден в заказе.`);
      }
      if (!isExternalFile(latest) || !latest.externalStatus || latest.externalStatus === 'ready') {
        return latest;
      }
      if (latest.externalStatus === 'failed') {
        throw new Error(`Подготовка файла «${fileName}» завершилась ошибкой.`);
      }
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setDownloadNotice(`Подготавливаем «${fileName}»… ${elapsedSeconds} c`);
      if (Date.now() - startedAt > EXTERNAL_DOWNLOAD_WAIT_TIMEOUT_MS) {
        throw new Error(`Превышено время ожидания готовности файла «${fileName}».`);
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, EXTERNAL_DOWNLOAD_POLL_INTERVAL_MS);
      });
    }
  };

  const downloadSingleFile = async (
    file: OrderFile,
    options?: { silent?: boolean; onStageChange?: (stage: FileDownloadStage) => void },
  ): Promise<boolean> => {
    const fileName = file.originalName || file.filename;
    const notifyError = !options?.silent;
    const setStage = (stage: FileDownloadStage) => {
      setFileDownloadStage(file.id, stage);
      options?.onStageChange?.(stage);
    };
    try {
      let latestFile = file;
      if (isExternalFile(latestFile) && latestFile.externalStatus && latestFile.externalStatus !== 'ready') {
        setStage('waiting');
        setDownloadNotice(`Файл «${fileName}» в очереди подготовки…`);
        latestFile = await waitForExternalFileReady(latestFile);
      }
      setStage('downloading');
      await downloadOrderFile(orderId, latestFile.id, fileName, {
        onPhaseChange: (phase) => {
          if (phase === 'requesting') {
            setDownloadNotice(`Запрашиваем «${fileName}»…`);
            options?.onStageChange?.('waiting');
            return;
          }
          if (phase === 'streaming') {
            setDownloadNotice(`Скачиваем «${fileName}»…`);
            options?.onStageChange?.('downloading');
            return;
          }
          if (phase === 'saving') {
            setDownloadNotice(`Подготавливаем сохранение «${fileName}»…`);
            return;
          }
          if (phase === 'done') {
            setDownloadNotice(`Файл «${fileName}» скачан.`);
          }
        },
        onProgress: (loadedBytes, totalBytes) => {
          setDownloadProgressByFileId((prev) => ({
            ...prev,
            [file.id]: { loadedBytes, totalBytes },
          }));
        },
      });
      setDownloadNotice(`Файл «${fileName}» скачан.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось скачать файл';
      if (notifyError) alert(message);
      setDownloadNotice(message);
      return false;
    } finally {
      setFileDownloadStage(file.id, null);
    }
  };

  const handleDownloadAll = async () => {
    if (isDownloadingAll || files.length === 0) return;
    const queue = [...files];
    setIsDownloadingAll(true);
    let completed = 0;
    let failed = 0;
    try {
      for (const file of queue) {
        const fileName = file.originalName || file.filename;
        setDownloadAllSummary({
          total: queue.length,
          completed,
          failed,
          currentFileName: fileName,
          phase: 'waiting',
        });
        const ok = await downloadSingleFile(file, {
          silent: true,
          onStageChange: (phase) => {
            setDownloadAllSummary((prev) =>
              prev
                ? { ...prev, currentFileName: fileName, phase }
                : {
                    total: queue.length,
                    completed,
                    failed,
                    currentFileName: fileName,
                    phase,
                  },
            );
          },
        });
        if (ok) completed += 1;
        else failed += 1;
        setDownloadAllSummary({
          total: queue.length,
          completed,
          failed,
          currentFileName: fileName,
          phase: 'downloading',
        });
      }
      if (failed > 0) {
        alert(`Скачивание завершено с ошибками: успешно ${completed}, ошибок ${failed}.`);
      } else {
        setDownloadNotice(`Скачивание завершено: ${completed} файлов.`);
      }
    } finally {
      setIsDownloadingAll(false);
      window.setTimeout(() => {
        setDownloadAllSummary(null);
      }, 1800);
    }
  };

  const handleDownloadFile = async (file: OrderFile) => {
    const ok = await downloadSingleFile(file);
    if (ok) {
      window.setTimeout(() => {
        setDownloadNotice((current) => (current && current.startsWith('Файл «') ? null : current));
      }, 1500);
    }
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
  const isAnyDownloadActive = isDownloadingAll || Object.keys(fileDownloadStageById).length > 0;
  const downloadSummaryLabel = downloadAllSummary
    ? `Скачивание ${Math.min(downloadAllSummary.total, downloadAllSummary.completed + downloadAllSummary.failed + 1)}/${downloadAllSummary.total}: ${downloadAllSummary.currentFileName} · ${downloadAllSummary.phase === 'waiting' ? 'ожидание готовности' : 'получение файла'}`
    : null;

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
      const requiresPreparation =
        external && Boolean(file.externalStatus) && file.externalStatus !== 'ready' && file.externalStatus !== 'failed';
      const canDownload = !external || file.externalStatus !== 'failed';
      const downloadStage = fileDownloadStageById[file.id] ?? null;
      const downloadProgress = downloadProgressByFileId[file.id] ?? null;
      const downloadPercent =
        downloadProgress && downloadProgress.totalBytes && downloadProgress.totalBytes > 0
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round((downloadProgress.loadedBytes / downloadProgress.totalBytes) * 100),
              ),
            )
          : null;
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
              title={
                !canDownload
                  ? 'Подготовка файла завершилась ошибкой'
                  : downloadStage === 'waiting'
                    ? 'Ожидаем готовность файла'
                    : downloadStage === 'downloading'
                      ? 'Скачивание уже выполняется'
                      : requiresPreparation
                        ? 'Поставить в очередь скачивания'
                        : 'Скачать'
              }
              disabled={!canDownload || isDownloadingAll || Boolean(downloadStage)}
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
              {downloadStage && (
                <span
                  className={`fm-chip ${downloadStage === 'waiting' ? 'fm-chip--download-wait' : 'fm-chip--download-active'}`}
                >
                  {downloadStage === 'waiting'
                    ? 'Подготовка…'
                    : downloadPercent != null
                      ? `Скачивание ${downloadPercent}%`
                      : 'Скачивание…'}
                </span>
              )}
              {downloadStage === 'downloading' && downloadProgress && (
                <span className="fm-chip fm-chip--muted">
                  {formatFileSize(downloadProgress.loadedBytes)}
                  {downloadProgress.totalBytes ? ` / ${formatFileSize(downloadProgress.totalBytes)}` : ''}
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
              title={
                !canDownload
                  ? 'Подготовка файла завершилась ошибкой'
                  : downloadStage === 'waiting'
                    ? 'Ожидаем готовность файла'
                    : downloadStage === 'downloading'
                      ? 'Скачивание уже выполняется'
                      : requiresPreparation
                        ? 'Поставить в очередь скачивания'
                        : 'Скачать'
              }
              disabled={!canDownload || isDownloadingAll || Boolean(downloadStage)}
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
                  Скачиваем {downloadAllSummary?.completed ?? 0}/{downloadAllSummary?.total ?? files.length}
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

        {(downloadSummaryLabel || downloadNotice) && (
          <div className="fm-download-status" role="status" aria-live="polite">
            {isAnyDownloadActive && <span className="fm-spinner fm-spinner--muted" aria-hidden />}
            <div className="fm-download-status__text">
              {downloadSummaryLabel && <strong>{downloadSummaryLabel}</strong>}
              {downloadNotice && <span>{downloadNotice}</span>}
            </div>
          </div>
        )}

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
