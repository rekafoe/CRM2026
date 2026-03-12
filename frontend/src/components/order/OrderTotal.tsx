import React from 'react';
import { parseNumberFlexible } from '../../utils/numberInput';
import { AppIcon } from '../ui/AppIcon';

export interface OrderItem {
  id: number;
  type: string;
  price: number | string;
  quantity?: number | string;
  serviceCost?: number | string;
  params?: { storedTotalCost?: number };
}

interface OrderTotalProps {
  items: OrderItem[];
  discount?: number | string;
  taxRate?: number | string;
  prepaymentAmount?: number;
  prepaymentStatus?: string;
  paymentMethod?: 'online' | 'offline' | 'telegram';
}

// Форматер для BYN (до сотых)
const bynFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'BYN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const OrderTotal: React.FC<OrderTotalProps> = ({
  items,
  discount = 0,
  taxRate = 0,
  prepaymentAmount = 0,
  prepaymentStatus,
  paymentMethod,
}) => {
  // Приоритет storedTotalCost (итог от калькулятора) — источник истины; иначе price × qty
  const subtotal = React.useMemo(() => {
    return items.reduce((sum, item) => {
      const stored = item.params?.storedTotalCost;
      const itemTotal = typeof stored === 'number' && Number.isFinite(stored)
        ? stored
        : parseNumberFlexible(item.price) * parseNumberFlexible(item.quantity ?? 1);
      const service = parseNumberFlexible(item.serviceCost);
      return sum + itemTotal + service;
    }, 0);
  }, [items]);

  // ⚠️ ВНИМАНИЕ: discount и taxRate применяются на фронте!
  // В текущей реализации всегда передается 0, но если понадобится применять скидки/налоги,
  // они должны рассчитываться на БЭКЕНДЕ и сохраняться в БД (order.discount, order.tax)
  const disc = parseNumberFlexible(discount);
  const rate = parseNumberFlexible(taxRate);

  const tax = React.useMemo(() => (subtotal - disc) * rate, [
    subtotal,
    disc,
    rate,
  ]);

  const total = subtotal - disc + tax;
  const prepayment = parseNumberFlexible(prepaymentAmount);
  const debt = total - prepayment;
  const isPaid = prepaymentStatus === 'paid';

  return (
    <div className="order-total">
      <div className="order-total__line">
        <span>Подытог:</span>
        <span>{bynFormatter.format(subtotal)}</span>
      </div>
      {disc > 0 && (
        <div className="order-total__line">
          <span>Скидка:</span>
          <span>-{bynFormatter.format(disc)}</span>
        </div>
      )}
      {tax > 0 && (
        <div className="order-total__line">
          <span>НДС:</span>
          <span>{bynFormatter.format(tax)}</span>
        </div>
      )}
      <hr />
      <div className="order-total__sum">
        <span>Итого:</span>
        <span>{bynFormatter.format(total)}</span>
      </div>
      
      {/* Предоплата */}
      {prepayment > 0 && (
        <>
          <hr />
          <div className="order-total__line prepayment">
            <span className="order-total__prepayment-label">
              <AppIcon name="card" size="xs" />
              Предоплата (
              {paymentMethod === 'online' ? (
                <><AppIcon name="wallet" size="xs" /> Онлайн</>
              ) : (
                <><AppIcon name="building" size="xs" /> Оффлайн</>
              )}
              ):
            </span>
            <span className={`order-total__prepayment-value ${isPaid ? 'paid' : 'pending'}`}>
              {isPaid ? <AppIcon name="check" size="xs" /> : <AppIcon name="clock" size="xs" />}
              {bynFormatter.format(prepayment)}
            </span>
          </div>
          <div className="order-total__line debt">
            <span>Долг клиента:</span>
            <span className={debt > 0 ? 'debt-amount' : 'paid-amount'}>
              {debt > 0 ? bynFormatter.format(debt) : <><AppIcon name="check" size="xs" /> Оплачено полностью</>}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
