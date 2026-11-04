import React from 'react';
import {
  ORDER_TRACK_CODES,
  formatOrderStatusDate,
  orderStatusCodeName,
  resolveOrderStatusCode,
  type OrderStatusCode,
  type OrderStatusRef,
} from './orderStatusCode';
import './StatusTrack.css';

interface StatusTrackProps {
  currentStatusId: number;
  statuses: OrderStatusRef[];
  onStatusChange?: (statusId: number) => void;
  createdAt?: string | null;
  readyAt?: string | null;
}

interface TrackStep {
  code: OrderStatusCode;
  id?: number;
  name: string;
  date: string | null;
}

function buildSteps(
  statuses: OrderStatusRef[],
  createdAt?: string | null,
  readyAt?: string | null,
): TrackStep[] {
  const created = formatOrderStatusDate(createdAt);
  const ready = formatOrderStatusDate(readyAt);
  return ORDER_TRACK_CODES.map((code) => {
    const row = statuses.find((status) => resolveOrderStatusCode(status) === code);
    let date: string | null = null;
    if (code === 'placed') date = created;
    if (code === 'done') date = ready;
    return {
      code,
      id: row?.id != null ? Number(row.id) : undefined,
      name: row?.name?.trim() || orderStatusCodeName(code),
      date,
    };
  });
}

export const StatusTrack: React.FC<StatusTrackProps> = ({
  currentStatusId,
  statuses,
  onStatusChange,
  createdAt,
  readyAt,
}) => {
  const steps = buildSteps(statuses, createdAt, readyAt);
  const currentRow = statuses.find((status) => Number(status.id) === Number(currentStatusId));
  const currentCode = resolveOrderStatusCode(
    currentRow ?? { id: currentStatusId },
    statuses,
  );
  const currentIndex = currentCode ? steps.findIndex((step) => step.code === currentCode) : -1;

  return (
    <div className="pc-track" role="list" aria-label="Статус заказа">
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = currentIndex >= 0 && index < currentIndex;
        const clickable = Boolean(onStatusChange) && step.id != null;
        const className = [
          'pc-track__step',
          isCurrent ? 'is-current' : '',
          isDone ? 'is-done' : '',
        ].filter(Boolean).join(' ');

        return (
          <button
            key={step.code}
            type="button"
            role="listitem"
            className={className}
            disabled={!clickable}
            aria-current={isCurrent ? 'step' : undefined}
            onClick={() => {
              if (clickable && step.id != null) onStatusChange?.(step.id);
            }}
          >
            <span className="pc-track__mark" aria-hidden="true" />
            <span className="pc-track__name">{step.name}</span>
            {step.date ? <span className="pc-track__date">{step.date}</span> : null}
          </button>
        );
      })}
    </div>
  );
};
