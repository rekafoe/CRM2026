import React, { useState } from 'react';
import { OrderFile } from '../types';
import { listOrderFiles, uploadOrderFile, deleteOrderFile, approveOrderFile } from '../api';

interface CompactFilesSectionProps {
  orderId: number;
  files: OrderFile[];
  onFilesUpdate: (files: OrderFile[]) => void;
}

export const CompactFilesSection: React.FC<CompactFilesSectionProps> = ({
  orderId,
  files,
  onFilesUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadOrderFile(orderId, file);
      const response = await listOrderFiles(orderId);
      onFilesUpdate(response.data);
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
      const response = await listOrderFiles(orderId);
      onFilesUpdate(response.data);
    } catch (error) {
      alert('Не удалось утвердить файл');
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    try {
      await deleteOrderFile(orderId, fileId);
      const response = await listOrderFiles(orderId);
      onFilesUpdate(response.data);
    } catch (error) {
      alert('Не удалось удалить файл');
    }
  };

  const approvedCount = files.filter(f => f.approved).length;
  const totalCount = files.length;

  return (
    <div className="compact-files-section">
      {/* Компактная заголовочная строка */}
      <div className="files-header">
        <div className="files-info">
          <span className="files-title">📁 Файлы макетов</span>
          <span className="files-count">
            {totalCount > 0 ? `${approvedCount}/${totalCount} утверждено` : 'Нет файлов'}
          </span>
        </div>
        <div className="files-actions">
          {files.length > 0 && (
            <button 
              className="btn-download-all"
              onClick={handleDownloadAll}
              title="Скачать все файлы"
            >
              📥 Все
            </button>
          )}
          <label className="btn-upload">
            <input 
              type="file" 
              onChange={handleFileUpload}
              disabled={isUploading}
              style={{ display: 'none' }}
            />
            {isUploading ? '⏳' : '📤'}
          </label>
          <button 
            className="btn-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Скрыть детали' : 'Показать детали'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Развернутый список файлов */}
      {isExpanded && (
        <div className="files-details">
          {files.length === 0 ? (
            <div className="no-files">Файлы не загружены</div>
          ) : (
            <div className="files-list">
              {files.map(file => (
                <div key={file.id} className="file-item">
                  <div className="file-info">
                    <a 
                      href={`/api/uploads/${encodeURIComponent(file.filename)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="file-name"
                    >
                      {file.originalName || file.filename}
                    </a>
                    <span className="file-size">
                      {file.size ? Math.round(file.size / 1024) : 0} KB
                    </span>
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
                      <span className="status-approved">✔</span>
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
      )}
    </div>
  );
};

// CSS стили
const styles = `
  .compact-files-section {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    margin: 8px 0;
    overflow: hidden;
  }

  .files-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #ffffff;
    border-bottom: 1px solid #e9ecef;
  }

  .files-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .files-title {
    font-weight: 600;
    color: #2c3e50;
    font-size: 14px;
  }

  .files-count {
    font-size: 12px;
    color: #6c757d;
  }

  .files-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .btn-download-all,
  .btn-upload,
  .btn-toggle {
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-download-all {
    background: #1976d2;
    color: white;
  }

  .btn-download-all:hover {
    background: #1565c0;
  }

  .btn-upload {
    background: #4caf50;
    color: white;
    cursor: pointer;
  }

  .btn-upload:hover {
    background: #45a049;
  }

  .btn-toggle {
    background: #6c757d;
    color: white;
    min-width: 32px;
  }

  .btn-toggle:hover {
    background: #5a6268;
  }

  .files-details {
    padding: 12px 16px;
    background: #ffffff;
  }

  .no-files {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 20px;
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .file-name {
    color: #1976d2;
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-name:hover {
    text-decoration: underline;
  }

  .file-size {
    font-size: 11px;
    color: #6c757d;
  }

  .file-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .btn-download,
  .btn-approve,
  .btn-delete {
    padding: 4px 6px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-download {
    background: #4caf50;
    color: white;
  }

  .btn-download:hover {
    background: #45a049;
  }

  .btn-approve {
    background: #ff9800;
    color: white;
  }

  .btn-approve:hover {
    background: #f57c00;
  }

  .btn-delete {
    background: #f44336;
    color: white;
  }

  .btn-delete:hover {
    background: #d32f2f;
  }

  .status-approved {
    color: #2e7d32;
    font-weight: 600;
    font-size: 12px;
  }

  /* Адаптивность */
  @media (max-width: 768px) {
    .files-header {
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }

    .files-actions {
      justify-content: center;
    }

    .file-item {
      flex-direction: column;
      gap: 8px;
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
