import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppIcon, BynSymbol, MoneyAmount } from './ui';
import { parseNumberFlexible } from '../utils/numberInput';
import './PrepaymentModal.css';

interface PrepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  currentAmount?: number;
  currentPaymentMethod?: 'online' | 'offline' | 'telegram';
  currentEmail?: string;
  totalOrderAmount?: number;
  /** pool: оплата при выдаче из пула — дата кассы = сегодня, без «назначить на меня» */
  context?: 'pool' | 'default';
  onPrepaymentCreated: (amount: number, email: string, paymentMethod: 'online' | 'offline' | 'telegram', assignToMe?: boolean) => void;
}

const QUICK_PERCENTS = [25, 50, 75, 100] as const;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAmountInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value === 0) return '';
  const rounded = roundMoney(value);
  return String(rounded);
}

function formatPercentInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  const rounded = roundMoney(value);
  return String(rounded);
}

function parsePercentInput(raw: string): number {
  if (raw.trim() === '') return 0;
  const normalized = raw.replace(',', '.').replace(/%/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountFromPercent(percent: number, total: number): number {
  if (total <= 0 || percent <= 0) return 0;
  const clamped = Math.min(100, Math.max(0, percent));
  return roundMoney((total * clamped) / 100);
}

function percentFromAmount(amount: number, total: number): number {
  if (total <= 0 || amount <= 0) return 0;
  return roundMoney(Math.min(100, (amount / total) * 100));
}

export const PrepaymentModal: React.FC<PrepaymentModalProps> = ({
  isOpen,
  onClose,
  orderId: _orderId,
  orderNumber,
  currentAmount = 0,
  currentPaymentMethod = 'offline',
  currentEmail = '',
  totalOrderAmount = 0,
  context = 'default',
  onPrepaymentCreated,
}) => {
  const total = useMemo(
    () => roundMoney(parseNumberFlexible(totalOrderAmount, 0)),
    [totalOrderAmount],
  );

  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('');
  const [email, setEmail] = useState(currentEmail);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'offline' | 'telegram'>(
    currentPaymentMethod || 'offline',
  );
  const [assignToMe, setAssignToMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const syncFromCurrentAmount = useCallback(
    (amt: number) => {
      const rounded = roundMoney(amt);
      setAmount(formatAmountInput(rounded));
      if (total > 0 && rounded > 0) {
        setPercent(formatPercentInput(percentFromAmount(rounded, total)));
      } else {
        setPercent('');
      }
    },
    [total],
  );

  useEffect(() => {
    if (!isOpen) return;
    syncFromCurrentAmount(parseNumberFlexible(currentAmount, 0));
    setEmail(currentEmail);
    setPaymentMethod(currentPaymentMethod || 'offline');
    setAssignToMe(false);
  }, [isOpen, currentAmount, currentEmail, currentPaymentMethod, syncFromCurrentAmount]);

  const amountNum = useMemo(() => {
    const fromAmount = parseNumberFlexible(amount, 0);
    if (fromAmount > 0) return roundMoney(fromAmount);
    if (total > 0) {
      const p = parsePercentInput(percent);
      if (p > 0) return amountFromPercent(p, total);
    }
    return 0;
  }, [amount, percent, total]);

  const percentNum = useMemo(() => {
    if (total <= 0) return 0;
    const p = parsePercentInput(percent);
    if (percent.trim() !== '' && p > 0) return roundMoney(Math.min(100, p));
    if (amountNum > 0) return percentFromAmount(amountNum, total);
    return 0;
  }, [percent, amountNum, total]);

  const debtAfter = useMemo(
    () => (total > 0 ? Math.max(0, roundMoney(total - amountNum)) : 0),
    [total, amountNum],
  );

  const handleAmountChange = (raw: string) => {
    setAmount(raw);
    const parsed = parseNumberFlexible(raw, 0);
    if (total > 0 && raw.trim() !== '' && parsed > 0) {
      setPercent(formatPercentInput(percentFromAmount(parsed, total)));
    } else if (raw.trim() === '') {
      setPercent('');
    }
  };

  const handlePercentChange = (raw: string) => {
    setPercent(raw);
    const p = parsePercentInput(raw);
    if (total > 0 && raw.trim() !== '' && p > 0) {
      setAmount(formatAmountInput(amountFromPercent(p, total)));
    } else if (raw.trim() === '') {
      setAmount('');
    }
  };

  const applyQuickPercent = (p: number) => {
    if (total <= 0) return;
    setPercent(formatPercentInput(p));
    setAmount(formatAmountInput(amountFromPercent(p, total)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentMethod === 'online' && !email) {
      alert('Для онлайн предоплаты необходимо указать email клиента');
      return;
    }

    const finalAmount = amountNum;

    if (total > 0 && finalAmount > total) {
      alert(
        `Предоплата не может быть больше общей суммы заказа (${total.toLocaleString('ru-RU')} бел. руб.)`,
      );
      return;
    }

    setIsLoading(true);
    try {
      await Promise.resolve(onPrepaymentCreated(finalAmount, email, paymentMethod, assignToMe));
      onClose();
    } catch {
      alert('Ошибка при создании предоплаты');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const canUsePercent = total > 0;

  return (
    <div className="pp-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pp-header">
          <h3 className="pp-title">
            <AppIcon name="card" size="sm" className="pp-title-icon" />
            {currentAmount > 0 ? 'Изменить предоплату' : 'Предоплата'} для заказа {orderNumber}
          </h3>
          <button type="button" className="pp-close" onClick={onClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {context === 'pool' && (
            <p className="pp-hint-pool-cash-date" role="note">
              Оплата будет учтена в кассе за сегодня ({new Date().toLocaleDateString('ru-RU')}), без смены даты
              выполнения заказа.
            </p>
          )}

          {canUsePercent && (
            <div className="pp-order-total" role="status">
              <span className="pp-order-total__label">Сумма заказа</span>
              <span className="pp-order-total__value">
                <MoneyAmount value={total} />
              </span>
            </div>
          )}

          <div className="pp-field">
            <label className="pp-label" htmlFor="pp-percent">
              Предоплата, %
            </label>
            <input
              id="pp-percent"
              type="text"
              inputMode="decimal"
              value={percent}
              onChange={(e) => handlePercentChange(e.target.value)}
              placeholder={canUsePercent ? 'например 50' : '—'}
              className="pp-input"
              disabled={!canUsePercent}
              aria-describedby="pp-calc-summary"
            />
            {canUsePercent && (
              <div className="pp-quick-percents" role="group" aria-label="Быстрый выбор доли">
                {QUICK_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pp-quick-percent${percentNum === p ? ' pp-quick-percent--active' : ''}`}
                    onClick={() => applyQuickPercent(p)}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pp-field">
            <label className="pp-label" htmlFor="pp-amount">
              Сумма предоплаты (<BynSymbol />)
            </label>
            <input
              id="pp-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="pp-input"
            />
          </div>

          <div id="pp-calc-summary" className="pp-calc-summary" aria-live="polite">
            {canUsePercent && amountNum > 0 ? (
              <>
                <span>
                  К оплате: <strong><MoneyAmount value={amountNum} /></strong>
                  {percentNum > 0 && (
                    <>
                      {' '}
                      (<span className="pp-calc-summary__pct">{percentNum}%</span> от заказа)
                    </>
                  )}
                </span>
                <span className="pp-calc-summary__debt">
                  Остаток после оплаты: <MoneyAmount value={debtAfter} />
                </span>
              </>
            ) : canUsePercent ? (
              <span className="pp-calc-summary__muted">Укажите процент или сумму</span>
            ) : (
              <span className="pp-calc-summary__muted">Сумма заказа неизвестна — введите сумму вручную</span>
            )}
          </div>

          {paymentMethod === 'online' && (
            <div className="pp-field">
              <label className="pp-label" htmlFor="pp-email">
                Email клиента:
              </label>
              <input
                id="pp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="pp-input"
                required
              />
            </div>
          )}

          <div className="pp-field">
            <label className="pp-label">Способ оплаты:</label>
            <div className="pp-radio-group">
              <label className={`pp-radio-option ${paymentMethod === 'online' ? 'pp-radio-selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="online"
                  checked={paymentMethod === 'online'}
                  onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'offline')}
                />
                <AppIcon name="card" size="xs" />
                Онлайн (через ссылку)
              </label>
              <label className={`pp-radio-option ${paymentMethod === 'offline' ? 'pp-radio-selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="offline"
                  checked={paymentMethod === 'offline'}
                  onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'offline')}
                />
                <AppIcon name="building" size="xs" />
                Оффлайн (в кассе)
              </label>
            </div>

            {paymentMethod === 'offline' && (
              <div className="pp-hint-offline">
                Для оффлайн предоплаты email не требуется — оплата получена в кассе
              </div>
            )}
          </div>

          {context !== 'pool' && (
            <div className="pp-field">
              <label className="pp-checkbox-wrap">
                <input
                  type="checkbox"
                  checked={assignToMe}
                  onChange={(e) => setAssignToMe(e.target.checked)}
                />
                <span>Назначить заказ себе</span>
              </label>
            </div>
          )}

          <div className="pp-actions">
            <button type="button" className="pp-btn pp-btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" disabled={isLoading} className="pp-btn pp-btn-primary">
              {isLoading
                ? 'Сохранение...'
                : currentAmount > 0
                  ? amountNum === 0
                    ? 'Убрать предоплату'
                    : 'Сохранить изменения'
                  : amountNum === 0
                    ? 'Убрать предоплату'
                    : 'Создать предоплату'}
            </button>
          </div>
        </form>

        <div className="pp-info">
          <AppIcon name="info" size="sm" className="pp-info-icon" />
          <div>
            <strong>Информация:</strong>
            <br />
            {amountNum === 0 ? (
              <>
                Установка предоплаты в 0 <BynSymbol /> уберёт предоплату с заказа.
              </>
            ) : paymentMethod === 'online' ? (
              'Онлайн: После создания предоплаты клиенту будет отправлена ссылка для оплаты на указанный email.'
            ) : (
              'Оффлайн: Предоплата будет отмечена как полученная в кассе. Email не требуется.'
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
