import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderFile, Item } from '../types';
import { listOrderFiles, uploadOrderFile, deleteOrderFile, approveOrderFile, downloadOrderFile, getPreflightReport, type PreflightReport } from '../api';
import { AppIcon } from './ui/AppIcon';
import { PreflightReportModal } from './PreflightReportModal';
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

  // Загружаем файлы при открытии модального окна
  React.useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, orderId]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadOrderFile(orderId, file, selectedOrderItemId ?? undefined);
      await loadFiles();
      e.currentTarget.value = '';
    } catch (error) {
      alert('Не удалось загрузить файл');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadAll = () => {
    files.forEach((f, i) => {
      setTimeout(() => {
        downloadOrderFile(orderId, f.id, f.originalName || f.filename).catch(() => alert('Не удалось скачать файл'));
      }, i * 200);
    });
  };

  const handleDownloadFile = (file: OrderFile) => {
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
    } catch (err) {
      setPreflightError(err instanceof Error ? err.message : 'Ошибка проверки');
    } finally {
      setPreflightLoading(false);
    }
  };

  const closePreflight = () => {
    setPreflightFile(null);
    setPreflightReport(null);
    setPreflightError(null);
  };

  const canPreflight = (file: OrderFile) => {
    const m = (file.mime || '').toLowerCase();
    return PREFLIGHT_MIME_TYPES.includes(m);
  };

  const approvedCount = files.filter(f => f.approved).length;
  const totalCount = files.length;

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
    list.map(file => (
      <div key={file.id} className={`file-item ${file.approved ? 'approved' : 'pending'}`}>
        <div className="file-info">
          <div className="file-name">
            <button type="button" className="file-name-link" onClick={() => handleDownloadFile(file)} title="Скачать">
              {file.originalName || file.filename}
            </button>
          </div>
          <div className="file-details">
            <span className="file-size">{file.size ? Math.round(file.size / 1024) : 0} KB</span>
            <span className="file-date">{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('ru-RU') : ''}</span>
          </div>
        </div>
        <div className="file-actions">
          {canPreflight(file) && (
            <button className="btn-preflight" onClick={() => handlePreflight(file)} title="Проверить макет (префлайт)">
              <AppIcon name="shield" size="xs" />
            </button>
          )}
          <button className="btn-download" onClick={() => handleDownloadFile(file)} title="Скачать файл">
            <AppIcon name="download" size="xs" />
          </button>
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
    ))
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
            className="btn-create-design"
            onClick={() => {
              onClose();
              const q = new URLSearchParams({ orderId: String(orderId) });
              if (selectedOrderItemId != null) q.set('orderItemId', String(selectedOrderItemId));
              navigate(`/adminpanel/design-templates?${q.toString()}`);
            }}
            title="Создать макет в редакторе"
          >
            <AppIcon name="image" size="xs" /> Создать макет
          </button>
        </div>

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
    </div>
  );
};
