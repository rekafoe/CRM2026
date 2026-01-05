import React from 'react';

export interface OrderItem {
  id: number;
  type: string;
  price: number | string;
  quantity?: number | string;
  serviceCost?: number | string;
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
  // ✅ ПРАВИЛЬНО: Суммируем УЖЕ рассчитанные цены из БД
  // item.price рассчитан бэкендом и сохранен при создании позиции
  // Здесь мы просто СУММИРУЕМ (аналог SQL SUM(price * quantity))
  const subtotal = React.useMemo(() => {
    return items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.quantity ?? 1) || 0;
      const service = Number(item.serviceCost ?? 0) || 0;
      return sum + price * qty + service;
    }, 0);
  }, [items]);

  // ⚠️ ВНИМАНИЕ: discount и taxRate применяются на фронте!
  // В текущей реализации всегда передается 0, но если понадобится применять скидки/налоги,
  // они должны рассчитываться на БЭКЕНДЕ и сохраняться в БД (order.discount, order.tax)
  const disc = Number(discount) || 0;
  const rate = Number(taxRate) || 0;

  const tax = React.useMemo(() => (subtotal - disc) * rate, [
    subtotal,
    disc,
    rate,
  ]);

  const total = subtotal - disc + tax;
  const prepayment = Number(prepaymentAmount) || 0;
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
            <span>
              💳 Предоплата ({paymentMethod === 'online' ? '🌐 Онлайн' : '🏪 Оффлайн'}):
            </span>
            <span className={isPaid ? 'paid' : 'pending'}>
              {isPaid ? '✅ ' : '⏳ '}{bynFormatter.format(prepayment)}
            </span>
          </div>
          <div className="order-total__line debt">
            <span>Долг клиента:</span>
            <span className={debt > 0 ? 'debt-amount' : 'paid-amount'}>
              {debt > 0 ? `${bynFormatter.format(debt)}` : 'Оплачено полностью ✅'}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
