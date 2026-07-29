import React from 'react';
import { AppIcon } from '../ui/AppIcon';
import type { InboxNotification } from '../../api';
import './InboxNotifications.css';

interface InboxNotificationsProps {
  unreadCount: number;
  open: boolean;
  items: InboxNotification[];
  onToggle: () => void;
  onClose: () => void;
  onMarkAllRead: () => void;
  onOpenNotification: (notification: InboxNotification) => void;
}

function formatTime(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const InboxNotifications: React.FC<InboxNotificationsProps> = ({
  unreadCount,
  open,
  items,
  onToggle,
  onClose,
  onMarkAllRead,
  onOpenNotification,
}) => {
  return (
    <div className="inbox-notifications">
      <button
        type="button"
        className="app-icon-btn app-icon-btn--with-label inbox-notifications__trigger"
        onClick={onToggle}
        title="Уведомления"
        aria-label="Уведомления"
        aria-expanded={open}
      >
        <span className="app-icon-btn__icon" aria-hidden="true">
          <AppIcon name={unreadCount > 0 ? 'bell-ring' : 'bell'} size="sm" />
        </span>
        <span className="app-icon-btn__label">Уведомления</span>
        {unreadCount > 0 && (
          <span className="inbox-notifications__badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="inbox-notifications__backdrop"
            aria-label="Закрыть уведомления"
            onClick={onClose}
          />
          <div className="inbox-notifications__panel" role="dialog" aria-label="Список уведомлений">
            <div className="inbox-notifications__header">
              <strong>Уведомления</strong>
              {unreadCount > 0 && (
                <button type="button" className="inbox-notifications__mark-all" onClick={onMarkAllRead}>
                  Прочитать все
                </button>
              )}
            </div>
            <div className="inbox-notifications__list">
              {items.length === 0 ? (
                <div className="inbox-notifications__empty">Пока нет уведомлений</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`inbox-notifications__item ${n.isRead ? '' : 'inbox-notifications__item--unread'}`}
                    onClick={() => onOpenNotification(n)}
                  >
                    <div className="inbox-notifications__item-title">{n.title}</div>
                    <div className="inbox-notifications__item-message">{n.message}</div>
                    <div className="inbox-notifications__item-time">{formatTime(n.createdAt)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
