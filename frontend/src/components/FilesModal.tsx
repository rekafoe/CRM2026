import React, { useState } from 'react';
import { OrderFile } from '../types';
import { listOrderFiles, uploadOrderFile, deleteOrderFile, approveOrderFile } from '../api';

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
}

export const FilesModal: React.FC<FilesModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber
}) => {
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
      await uploadOrderFile(orderId, file);
      await loadFiles();
      e.currentTarget.value = '';
    } catch (error) {
      alert('Не удалось загрузить файл');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadAll = () => {
    files.forEach(f => {
      const link = document.createElement('a');
      link.href = `/api/uploads/${encodeURIComponent(f.filename)}`;
      link.download = f.originalName || f.filename;
      link.click();
    });
  };

  const handleDownloadFile = (file: OrderFile) => {
    const link = document.createElement('a');
    link.href = `/api/uploads/${encodeURIComponent(file.filename)}`;
    link.download = file.originalName || file.filename;
    link.click();
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

  const approvedCount = files.filter(f => f.approved).length;
  const totalCount = files.length;

  if (!isOpen) return null;

  return (
    <div className="files-modal-overlay" onClick={onClose}>
      <div className="files-modal" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="files-modal-header">
          <h3>📁 Файлы макетов - Заказ #{orderNumber}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
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
          {files.length > 0 && (
            <button className="btn-download-all" onClick={handleDownloadAll}>
              📥 Скачать все файлы
            </button>
          )}
          <label className="btn-upload">
            <input 
              type="file" 
              onChange={handleFileUpload}
              disabled={isUploading}
              style={{ display: 'none' }}
            />
            {isUploading ? '⏳ Загрузка...' : '📤 Загрузить файл'}
          </label>
        </div>

        {/* Список файлов */}
        <div className="files-content">
          {isLoading ? (
            <div className="loading">Загрузка файлов...</div>
          ) : files.length === 0 ? (
            <div className="no-files">
              <div className="no-files-icon">📄</div>
              <div className="no-files-text">Файлы не загружены</div>
              <div className="no-files-hint">Загрузите макеты для этого заказа</div>
            </div>
          ) : (
            <div className="files-list">
              {files.map(file => (
                <div key={file.id} className={`file-item ${file.approved ? 'approved' : 'pending'}`}>
                  <div className="file-info">
                    <div className="file-name">
                      <a 
                        href={`/api/uploads/${encodeURIComponent(file.filename)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {file.originalName || file.filename}
                      </a>
                    </div>
                    <div className="file-details">
                      <span className="file-size">
                        {file.size ? Math.round(file.size / 1024) : 0} KB
                      </span>
                      <span className="file-date">
                        {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('ru-RU') : ''}
                      </span>
                    </div>
                  </div>
                  <div className="file-actions">
                    <button 
                      className="btn-download"
                      onClick={() => handleDownloadFile(file)}
                      title="Скачать файл"
                    >
                      📥
                    </button>
                    {file.approved ? (
                      <span className="status-approved" title="Файл утвержден">✓</span>
                    ) : (
                      <button 
                        className="btn-approve"
                        onClick={() => handleApproveFile(file.id)}
                        title="Утвердить файл"
                      >
                        ✓
                      </button>
                    )}
                    <button 
                      className="btn-delete"
                      onClick={() => handleDeleteFile(file.id)}
                      title="Удалить файл"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// CSS стили
const styles = `
  .files-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .files-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    width: 100%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .files-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;
  }

  .files-modal-header h3 {
    margin: 0;
    color: #2c3e50;
    font-size: 18px;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #6c757d;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .btn-close:hover {
    background: #e9ecef;
    color: #495057;
  }

  .files-stats {
    display: flex;
    gap: 24px;
    padding: 16px 24px;
    background: #ffffff;
    border-bottom: 1px solid #e9ecef;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 12px;
    color: #6c757d;
    font-weight: 500;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 700;
    color: #2c3e50;
  }

  .stat-value.approved {
    color: #28a745;
  }

  .stat-value.pending {
    color: #ffc107;
  }

  .files-actions {
    display: flex;
    gap: 12px;
    padding: 16px 24px;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;
  }

  .btn-download-all,
  .btn-upload {
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-download-all {
    background: #1976d2;
    color: white;
  }

  .btn-download-all:hover {
    background: #1565c0;
  }

  .btn-upload {
    background: #28a745;
    color: white;
  }

  .btn-upload:hover {
    background: #218838;
  }

  .files-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #6c757d;
  }

  .no-files {
    text-align: center;
    padding: 40px;
    color: #6c757d;
  }

  .no-files-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .no-files-text {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .no-files-hint {
    font-size: 14px;
    color: #adb5bd;
  }

  .files-list {
    padding: 16px 24px;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    margin-bottom: 8px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .file-item:hover {
    background: #e9ecef;
    border-color: #dee2e6;
  }

  .file-item.approved {
    border-left: 4px solid #28a745;
    background: #f8fff9;
  }

  .file-item.pending {
    border-left: 4px solid #ffc107;
    background: #fffdf5;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    margin-bottom: 4px;
  }

  .file-name a {
    color: #1976d2;
    text-decoration: none;
    font-weight: 500;
    font-size: 14px;
  }

  .file-name a:hover {
    text-decoration: underline;
  }

  .file-details {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #6c757d;
  }

  .file-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-download,
  .btn-approve,
  .btn-delete {
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-download {
    background: #28a745;
    color: white;
  }

  .btn-download:hover {
    background: #218838;
  }

  .btn-approve {
    background: #ffc107;
    color: #212529;
  }

  .btn-approve:hover {
    background: #e0a800;
  }

  .btn-delete {
    background: #dc3545;
    color: white;
  }

  .btn-delete:hover {
    background: #c82333;
  }

  .status-approved {
    color: #28a745;
    font-weight: 600;
    font-size: 14px;
  }

  /* Адаптивность */
  @media (max-width: 768px) {
    .files-modal {
      margin: 10px;
      max-height: 90vh;
    }

    .files-stats {
      flex-direction: column;
      gap: 12px;
    }

    .files-actions {
      flex-direction: column;
    }

    .file-item {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .file-actions {
      justify-content: center;
    }
  }
`;

// Добавляем стили в head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}
