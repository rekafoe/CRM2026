import React, { useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { OrderMailLogPanel } from './OrderMailLogPanel';
import { OrderSmsPanel } from './OrderSmsPanel';
import './OrderDispatchMenu.css';

type Props = {
  orderId: number;
  customerPhone?: string | null;
};

export const OrderDispatchMenu: React.FC<Props> = ({ orderId, customerPhone }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="order-dispatch">
      <button
        type="button"
        className="app-icon-btn app-icon-btn--with-label"
        onClick={() => setOpen((value) => !value)}
        title="Почта и SMS по заказу"
        aria-label="Почта и SMS по заказу"
        aria-expanded={open}
      >
        <span className="app-icon-btn__icon" aria-hidden="true">
          <AppIcon name="history" size="sm" />
        </span>
        <span className="app-icon-btn__label">Отправления</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="order-dispatch__backdrop"
            aria-label="Закрыть отправления"
            onClick={() => setOpen(false)}
          />
          <div className="order-dispatch__panel" role="dialog" aria-label="Почта и SMS по заказу">
            <div className="order-dispatch__header">
              <strong>Отправления</strong>
            </div>
            <div className="order-dispatch__body">
              <OrderMailLogPanel key={`mail-${orderId}`} orderId={orderId} />
              <OrderSmsPanel key={`sms-${orderId}`} orderId={orderId} customerPhone={customerPhone} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
