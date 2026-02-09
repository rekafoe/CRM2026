import React from 'react';

export interface OrderStatusItem {
  id: number;
  name: string;
  color?: string;
  sort_order: number;
}

interface OrderStatusTimelineProps {
  statuses: OrderStatusItem[];
  currentStatusId: number;
  createdAt?: string | null;
  readyAt?: string | null;
  hasItems?: boolean;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const OrderStatusTimeline: React.FC<OrderStatusTimelineProps> = ({
  statuses,
  currentStatusId,
  createdAt,
  readyAt,
  hasItems = true,
}) => {
  const sorted = [...statuses].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id));
  const currentIndex = sorted.findIndex((s) => Number(s.id) === Number(currentStatusId));
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;
  const progressPercent = sorted.length > 1 ? (activeIndex / (sorted.length - 1)) * 100 : 0;

  return (
    <div className="order-status-timeline">
      <div className="order-status-timeline__bar-wrap">
        <div
          className="order-status-timeline__bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="order-status-timeline__steps">
        {sorted.map((status, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          return (
            <div
              key={status.id}
              className={`order-status-timeline__step ${isActive ? 'order-status-timeline__step--active' : ''} ${isPast ? 'order-status-timeline__step--past' : ''}`}
            >
              <div
                className="order-status-timeline__circle"
                style={isActive && status.color ? { backgroundColor: status.color } : undefined}
              >
                {index + 1}
              </div>
              <div className="order-status-timeline__label">{status.name}</div>
            </div>
          );
        })}
      </div>
      <div className="order-status-timeline__dates">
        <span className="order-status-timeline__date">Создан: {formatDate(createdAt)}</span>
        {readyAt && (
          <span className="order-status-timeline__date">Готов: {formatDateTime(readyAt)}</span>
        )}
      </div>
      {!hasItems && (
        <div className="order-status-timeline__empty">Пока нет позиций</div>
      )}
    </div>
  );
};
