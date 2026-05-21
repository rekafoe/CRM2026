import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  createPublicEditorPreviewDraftFromOrderItem,
  getOrderItemEditorProductionManifest,
  type OrderFileAccessLog,
  type PreflightReport,
} from '../api';
import { AppIcon } from './ui/AppIcon';
import { OrderFileAccessLogsModal } from './OrderFileAccessLogsModal';
import { PreflightReportModal } from './PreflightReportModal';
import { getEditorItemSummary } from './order/editorItemSummary';
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
  const desc = item.params?.description || item.type || '';
  return desc ? `Позиция ${index + 1}: ${desc}` : `Позиция ${index + 1}`;
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
  items = []
}) => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  /** К какой позиции привязать следующий загружаемый файл (null = общие) */
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<number | null>(null);
  /** Префлайт */
  const [preflightFile, setPreflightFile] = useState<{ id: number; name: string } | null>(null);
  const [preflightReport, setPreflightReport] = useState<PreflightReport | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  /** Кэш результатов префлайта по fileId — для отображения статуса в списке */
  const [preflightCache, setPreflightCache] = useState<Record<number, PreflightReport>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessLogFile, setAccessLogFile] = useState<{ id: number; name: string } | null>(null);
  const [accessLogs, setAccessLogs] = useState<OrderFileAccessLog[]>([]);
  const [accessLogsLoading, setAccessLogsLoading] = useState(false);
  const [accessLogsError, setAccessLogsError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [editorActionLoading, setEditorActionLoading] = useState(false);
  const [editorActionError, setEditorActionError] = useState<string | null>(null);

  // Загружаем файлы при открытии модального окна
  React.useEffect(() => {
    if (isOpen) {
      loadFiles();
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

  const handleRestoreEditorDraft = async (item: Item) => {
    if (!item.params?.designState || item.params.designTemplateId == null) return;
    setEditorActionLoading(true);
    setEditorActionError(null);
    try {
      const res = await createPublicEditorPreviewDraftFromOrderItem({ orderId, orderItemId: item.id });
      const token = res.data?.token;
      if (!token) throw new Error('Сервер не вернул draft token');
      const mode = item.params.editorDraftMode === 'multipage' ? 'multipage' : 'single';
      onClose();
      navigate(`/adminpanel/public-design-editor-preview/${item.params.designTemplateId}?mode=${mode}&draft=${encodeURIComponent(token)}`);
    } catch (error) {
      setEditorActionError(error instanceof Error ? error.message : 'Не удалось открыть макет на правку');
    } finally {
      setEditorActionLoading(false);
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
      // Авто-префлайт для поддерживаемых типов (PDF, JPG, PNG, TIFF)
      const mime = (newFile?.mime ?? file.type ?? '').toLowerCase();
      if (newFile?.id && PREFLIGHT_MIME_TYPES.includes(mime)) {
        try {
          const res = await getPreflightReport(orderId, newFile.id);
          setPreflightCache((prev) => ({ ...prev, [newFile.id]: res.data }));
        } catch {
          // Результат не кэшируем при ошибке — пользователь может запустить проверку вручную
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить файл';
      alert(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadAll = () => {
    files.forEach((f, i) => {
      setTimeout(() => {
        void handleDownloadFile(f);
      }, i * 200);
    });
  };

  const handleDownloadFile = async (file: OrderFile) => {
    if (isExternalFile(file)) {
      if (file.externalStatus && file.externalStatus !== 'ready') {
        alert(`Файл ещё не готов: ${getExternalStatusLabel(file.externalStatus)}`);
        return;
      }
      downloadOrderFile(orderId, file.id, file.originalName || file.filename).catch((error) => {
        const msg = error instanceof Error ? error.message : 'Не удалось скачать внешний файл';
        alert(msg);
      });
      return;
    }
    downloadOrderFile(orderId, file.id, file.originalName || file.filename).catch(() => alert('Не удалось скачать файл'));
  };

  const handleApproveFile = async (fileId: number) => {
    try {
      await approveOrderFile(orderId, fileId);
      await loadFiles();
    } catch (error) {
      alert('Не удалось утвердить файл');
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот файл?')) return;
    
    try {
      await deleteOrderFile(orderId, fileId);
      await loadFiles();
    } catch (error) {
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

  /** Статус префлайта для отображения в списке */
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

  const approvedCount = files.filter(f => f.approved).length;
  const totalCount = files.length;
  const selectedOrderItem = selectedOrderItemId != null
    ? items.find((item) => item.id === selectedOrderItemId)
    : null;
  const selectedPhotoBatch = selectedOrderItem?.params?.photoBatch;
  const selectedPhotoBatchSummary = selectedPhotoBatch
    ? `${selectedPhotoBatch.totalFiles ?? 0} файлов · ${selectedPhotoBatch.totalQuantity ?? 0} отпечатков`
    : null;
  const selectedEditorSummary = selectedOrderItem ? getEditorItemSummary(selectedOrderItem) : null;

  /** Группировка файлов по позиции заказа для отображения */
  const filesByItem = useMemo(() => {
    const map = new Map<number | null, OrderFile[]>();
    for (const f of files) {
      const k = f.orderItemId ?? null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    return map;
  }, [files]);

  const renderFileList = (list: OrderFile[]) => (
    list.map(file => {
      const cached = canPreflight(file) ? preflightCache[file.id] : null;
      const status = cached ? getPreflightStatus(cached) : null;
      const external = isExternalFile(file);
      const canDownload = !external || !file.externalStatus || file.externalStatus === 'ready';
      return (
      <div key={file.id} className={`file-item ${file.approved ? 'approved' : 'pending'} ${external ? `file-item--external file-item--external-${file.externalStatus || 'unknown'}` : ''}`}>
        <div className="file-info">
          <div className="file-name">
            <button type="button" className="file-name-link" onClick={() => handleDownloadFile(file)} title="Скачать">
              {file.originalName || file.filename}
            </button>
            {external && (
              <span className="file-storage-badge" title="Внешнее хранилище">
                {file.externalProvider || file.storage}
              </span>
            )}
            {file.artifactType && <span className="file-artifact-badge">{file.artifactType}</span>}
            {canPreflight(file) && (
              <span
                className={`file-preflight-status file-preflight-status--${status ?? 'none'}`}
                title={
                  status === 'ok'
                    ? 'Префлайт: ок'
                    : status === 'warning'
                      ? 'Префлайт: есть предупреждения'
                      : status === 'error'
                        ? 'Префлайт: есть ошибки'
                        : 'Нажмите щит для проверки'
                }
              >
                {status === 'ok' && <AppIcon name="check" size="xs" />}
                {status === 'warning' && <span className="preflight-warning-icon" aria-label="предупреждение">!</span>}
                {status === 'error' && <AppIcon name="ban" size="xs" />}
                {status === null && <AppIcon name="shield" size="xs" />}
              </span>
            )}
          </div>
          <div className="file-details">
            <span className="file-size">{formatFileSize(file.size)}</span>
            <span className="file-date">{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('ru-RU') : ''}</span>
            {file.partNumber != null && <span>часть {file.partNumber}</span>}
            {external && file.externalStatus && <span>{getExternalStatusLabel(file.externalStatus)}</span>}
          </div>
        </div>
        <div className="file-actions">
          {canPreflight(file) && (
            <button className="btn-preflight" onClick={() => handlePreflight(file)} title={cached ? 'Открыть отчёт префлайта' : 'Проверить макет (префлайт)'}>
              <AppIcon name="shield" size="xs" />
            </button>
          )}
          <button className="btn-download" onClick={() => handleDownloadFile(file)} title={canDownload ? 'Скачать файл' : 'Файл ещё не готов'} disabled={!canDownload}>
            <AppIcon name="download" size="xs" />
          </button>
          {isAdmin && (
            <button className="btn-access-log" onClick={() => handleAccessLogs(file)} title="Журнал скачиваний">
              <AppIcon name="shield" size="xs" />
            </button>
          )}
          {file.approved ? (
            <span className="status-approved" title="Файл утвержден"><AppIcon name="check" size="sm" /></span>
          ) : (
            <button className="btn-approve" onClick={() => handleApproveFile(file.id)} title="Утвердить файл">
              <AppIcon name="check" size="xs" />
            </button>
          )}
          <button className="btn-delete" onClick={() => handleDeleteFile(file.id)} title="Удалить файл">
            <AppIcon name="x" size="xs" />
          </button>
        </div>
      </div>
      );
    })
  );

  if (!isOpen) return null;

  return (
    <div className="files-modal-overlay" onClick={onClose}>
      <div className="files-modal" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="files-modal-header">
          <h3>
            <AppIcon name="folder" size="sm" className="fm-title-icon" />
            Файлы макетов — Заказ #{orderNumber}
          </h3>
          <button type="button" className="fm-btn-close" onClick={onClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </div>

        {/* Статистика */}
        <div className="files-stats">
          <div className="stat-item">
            <span className="stat-label">Всего файлов:</span>
            <span className="stat-value">{totalCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Утверждено:</span>
            <span className="stat-value approved">{approvedCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Ожидает:</span>
            <span className="stat-value pending">{totalCount - approvedCount}</span>
          </div>
        </div>

        {/* Действия */}
        <div className="files-actions">
          {items.length > 0 && (
            <select
              className="files-position-select"
              value={selectedOrderItemId ?? ''}
              onChange={(e) => setSelectedOrderItemId(e.target.value === '' ? null : Number(e.target.value))}
              title="К какой позиции заказа привязать загружаемый файл"
            >
              <option value="">Общие (без привязки)</option>
              {items.map((it, i) => (
                <option key={it.id} value={it.id}>{getItemLabel(it, i)}</option>
              ))}
            </select>
          )}
          {files.length > 0 && (
          <button className="btn-download-all" onClick={handleDownloadAll}>
            <AppIcon name="download" size="xs" /> Скачать все файлы
          </button>
          )}
          <label className={`btn-upload ${isUploading ? 'is-uploading' : ''}`}>
            <input 
              type="file" 
              onChange={handleFileUpload}
              disabled={isUploading}
              style={{ display: 'none' }}
            />
            {isUploading ? (
              <><AppIcon name="refresh" size="xs" /> Загрузка...</>
            ) : (
              <>Загрузить файл</>
            )}
          </label>
          <button
            type="button"
            className="btn-create-design btn-photo-batch"
            disabled={!selectedOrderItem}
            onClick={() => {
              if (!selectedOrderItem) return;
              onClose();
              const q = new URLSearchParams({
                orderId: String(orderId),
                orderItemId: String(selectedOrderItem.id),
              });
              if (selectedOrderItem.params?.productId != null) {
                q.set('productId', String(selectedOrderItem.params.productId));
              }
              const typeId = (selectedOrderItem.params as { typeId?: number | string }).typeId;
              if (typeId != null) q.set('typeId', String(typeId));
              navigate(`/photo-batch-editor?${q.toString()}`);
            }}
            title={selectedOrderItem ? 'Открыть пакетную фотопечать для позиции' : 'Сначала выберите позицию заказа'}
          >
            <AppIcon name="camera" size="xs" /> Пакетная фотопечать
          </button>
          {selectedPhotoBatchSummary && (
            <span className="files-photo-batch-summary">{selectedPhotoBatchSummary}</span>
          )}
        </div>
        {selectedOrderItem && selectedEditorSummary && (
          <div className={`files-editor-summary files-editor-summary--${selectedEditorSummary.kind}`}>
            <div className="files-editor-summary__main">
              <strong>{selectedEditorSummary.label}</strong>
              <span>{selectedEditorSummary.detail}</span>
            </div>
            <div className="files-editor-summary__meta">
              {(selectedOrderItem.params.designState || selectedOrderItem.params.photoBatch) && (
                <button
                  type="button"
                  className="files-editor-summary__preview"
                  onClick={() => setPreviewItem(selectedOrderItem)}
                >
                  Открыть preview
                </button>
              )}
              {selectedOrderItem.params.designState && selectedOrderItem.params.designTemplateId != null && (
                <button
                  type="button"
                  className="files-editor-summary__preview"
                  onClick={() => void handleRestoreEditorDraft(selectedOrderItem)}
                  disabled={editorActionLoading}
                >
                  Редактировать копию
                </button>
              )}
              {(selectedOrderItem.params.designState || selectedOrderItem.params.photoBatch) && (
                <button
                  type="button"
                  className="files-editor-summary__preview"
                  onClick={() => void handleDownloadProductionManifest(selectedOrderItem)}
                  disabled={editorActionLoading}
                >
                  Production manifest
                </button>
              )}
              {selectedOrderItem.params.editorDraftToken && (
                <span title={selectedOrderItem.params.editorDraftToken}>
                  Draft: {selectedOrderItem.params.editorDraftToken.slice(0, 12)}…
                </span>
              )}
              {selectedOrderItem.params.designTemplateId != null && (
                <span>Template ID: {selectedOrderItem.params.designTemplateId}</span>
              )}
              {selectedOrderItem.params.editorDraftMode && (
                <span>Mode: {selectedOrderItem.params.editorDraftMode}</span>
              )}
            </div>
          </div>
        )}
        {editorActionError && (
          <div className="files-editor-action-error">
            {editorActionError}
          </div>
        )}

        {/* Список файлов */}
        <div className="files-content">
          {isLoading ? (
            <div className="loading">Загрузка файлов...</div>
          ) : files.length === 0 ? (
            <div className="no-files">
              <div className="no-files-icon">
                <AppIcon name="document" size="xl" />
              </div>
              <div className="no-files-text">Файлы не загружены</div>
              <div className="no-files-hint">Загрузите макеты для этого заказа</div>
            </div>
          ) : (
            <div className="files-list">
              {filesByItem.has(null) && (
                <div className="files-group">
                  <div className="files-group-title">Общие (без привязки к позиции)</div>
                  {renderFileList(filesByItem.get(null)!)}
                </div>
              )}
              {items.map((it, i) => filesByItem.has(it.id) && (
                <div key={it.id} className="files-group">
                  <div className="files-group-title">{getItemLabel(it, i)}</div>
                  {renderFileList(filesByItem.get(it.id)!)}
                </div>
              ))}
              {Array.from(filesByItem.entries()).filter(([k]) => k !== null && !items.some(i => i.id === k)).map(([itemId, list]) => (
                <div key={`item-${itemId}`} className="files-group">
                  <div className="files-group-title">Позиция (ID {itemId})</div>
                  {renderFileList(list)}
                </div>
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
