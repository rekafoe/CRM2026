import React from 'react';
import type { OrderFileAccessLog } from '../api';
import { AppIcon } from './ui/AppIcon';

interface OrderFileAccessLogsModalProps {
  isOpen: boolean;
  fileName: string;
  logs: OrderFileAccessLog[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

function formatAction(action: string): string {
  if (action === 'download') return 'Скачивание файла';
  if (action === 'external_link') return 'Выдача внешней ссылки';
  return action;
}

export const OrderFileAccessLogsModal: React.FC<OrderFileAccessLogsModalProps> = ({
  isOpen,
  fileName,
  logs,
  isLoading,
  error,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="access-logs-overlay" onClick={onClose}>
      <div className="access-logs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="access-logs-header">
          <h4>
            <AppIcon name="shield" size="sm" />
            Журнал скачиваний
          </h4>
          <button type="button" className="fm-btn-close" onClick={onClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </div>

        <div className="access-logs-file">{fileName}</div>

        {isLoading ? (
          <div className="access-logs-state">Загрузка журнала...</div>
        ) : error ? (
          <div className="access-logs-state access-logs-state--error">{error}</div>
        ) : logs.length === 0 ? (
          <div className="access-logs-state">Скачиваний пока нет.</div>
        ) : (
          <div className="access-logs-list">
            {logs.map((log) => (
              <div key={log.id} className="access-log-row">
                <div className="access-log-main">
                  <strong>{formatAction(log.action)}</strong>
                  <span>{log.userName || log.userEmail || (log.userId ? `Пользователь #${log.userId}` : 'Пользователь не определён')}</span>
                </div>
                <div className="access-log-meta">
                  <span>{log.createdAt ? new Date(log.createdAt).toLocaleString('ru-RU') : ''}</span>
                  {log.storage && <span>{log.storage}</span>}
                  {log.ip && <span>{log.ip}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
