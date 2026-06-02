import React from 'react';
import { AppIcon } from '../ui/AppIcon';
import { BynSymbol } from '../ui/BynSymbol';

export interface OrderAmountsDisplayProps {
  subtotal: number;
  discountAmount?: number;
  total: number;
  prepaymentAmount?: number;
  prepaymentStatus?: string;
  paymentMethod?: 'online' | 'offline' | 'telegram';
  taxRate?: number;
  /** С API; если не задан — total − prepayment */
  debt?: number;
}

const bynAmount = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const BynValue: React.FC<{ children: number }> = ({ children }) => (
  <>
    {bynAmount(children)} <BynSymbol />
  </>
);

/** Блок итогов заказа — только отображение сумм с API. */
export const OrderTotal: React.FC<OrderAmountsDisplayProps> = ({
  subtotal,
  discountAmount = 0,
  total,
  prepaymentAmount = 0,
  prepaymentStatus,
  paymentMethod,
  taxRate = 0,
  debt: debtFromApi,
}) => {
  const disc = discountAmount;
  const rate = Number(taxRate) || 0;
  const tax = rate > 0 ? (subtotal - disc) * rate : 0;
  const prepayment = Number(prepaymentAmount) || 0;
  const debt =
    typeof debtFromApi === 'number' && Number.isFinite(debtFromApi)
      ? debtFromApi
      : Math.max(0, Math.round((total - prepayment) * 100) / 100);
  const isPaid = prepaymentStatus === 'paid';

  return (
    <div className="order-total">
      <div className="order-total__line">
        <span>Подытог:</span>
        <span>
          <BynValue>{subtotal}</BynValue>
        </span>
      </div>
      {disc > 0 && (
        <div className="order-total__line">
          <span>Скидка:</span>
          <span>
            -<BynValue>{disc}</BynValue>
          </span>
        </div>
      )}
      {tax > 0 && (
        <div className="order-total__line">
          <span>НДС:</span>
          <span>
            <BynValue>{tax}</BynValue>
          </span>
        </div>
      )}
      <hr />
      <div className="order-total__sum">
        <span>Итого:</span>
        <span>
          <BynValue>{total}</BynValue>
        </span>
      </div>

      {prepayment > 0 && (
        <>
          <hr />
          <div className="order-total__line prepayment">
            <span className="order-total__prepayment-label">
              <AppIcon name="card" size="xs" />
              Предоплата (
              {paymentMethod === 'online' ? (
                <>
                  <AppIcon name="wallet" size="xs" /> Онлайн
                </>
              ) : (
                <>
                  <AppIcon name="building" size="xs" /> Оффлайн
                </>
              )}
              ):
            </span>
            <span className={`order-total__prepayment-value ${isPaid ? 'paid' : 'pending'}`}>
              {isPaid ? <AppIcon name="check" size="xs" /> : <AppIcon name="clock" size="xs" />}
              <BynValue>{prepayment}</BynValue>
            </span>
          </div>
          <div className="order-total__line debt">
            <span>Долг клиента:</span>
            <span className={debt > 0 ? 'debt-amount' : 'paid-amount'}>
              {debt > 0 ? (
                <BynValue>{debt}</BynValue>
              ) : (
                <>
                  <AppIcon name="check" size="xs" /> Оплачено полностью
                </>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
