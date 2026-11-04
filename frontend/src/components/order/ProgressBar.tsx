import React from 'react';
import { StatusTrack } from './StatusTrack';
import type { OrderStatusRef } from './orderStatusCode';

export type OrderStatus = string;

interface StatusStep extends OrderStatusRef {
  id: number;
  name: string;
  sort_order: number;
}

interface ProgressBarProps {
  current: number;
  statuses: StatusStep[];
  onStatusChange?: (statusId: number) => void;
  width?: string;
  height?: string;
  createdAt?: string | null;
  readyAt?: string | null;
}

/** Прежняя шкала. Рисует StatusTrack: цвет из справочника больше не используется. */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  statuses,
  onStatusChange,
  createdAt,
  readyAt,
}) => (
  <StatusTrack
    currentStatusId={current}
    statuses={statuses}
    onStatusChange={onStatusChange}
    createdAt={createdAt}
    readyAt={readyAt}
  />
);
