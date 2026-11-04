import React from 'react';
import {
  orderStatusStampCode,
  orderStatusStampLabel,
  type OrderStatusRef,
} from './orderStatusCode';
import './OrderStamp.css';

interface OrderStampProps {
  status?: OrderStatusRef | null;
  statuses?: OrderStatusRef[] | null;
  onlineCancelled?: boolean;
  className?: string;
}

export const OrderStamp: React.FC<OrderStampProps> = ({
  status,
  statuses,
  onlineCancelled = false,
  className,
}) => {
  const code = orderStatusStampCode(status, statuses, onlineCancelled);
  const label = orderStatusStampLabel(status, code, onlineCancelled);
  const variant = code ?? 'unknown';

  return (
    <span className={['pc-stamp', `pc-stamp--${variant}`, className].filter(Boolean).join(' ')}>
      <span className="pc-stamp__mark" aria-hidden="true" />
      <span className="pc-stamp__label">{label}</span>
    </span>
  );
};
