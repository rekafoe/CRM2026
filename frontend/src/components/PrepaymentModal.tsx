import React, { useState } from 'react';
import { AppIcon } from './ui/AppIcon';
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
  onPrepaymentCreated: (amount: number, email: string, paymentMethod: 'online' | 'offline' | 'telegram', assignToMe?: boolean) => void;
}

export const PrepaymentModal: React.FC<PrepaymentModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  currentAmount = 0,
  currentPaymentMethod = 'offline',
  currentEmail = '',
  totalOrderAmount = 0,
  onPrepaymentCreated
}) => {
  if (!isOpen) return null;

  const formatAmount = (value: number | null | undefined): string => {
    if (value == null || Number.isNaN(value)) return '';
    return String(value);
  };
  const [amount, setAmount] = useState<string>(formatAmount(currentAmount));
  const [email, setEmail] = useState<string>(currentEmail);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'offline' | 'telegram'>(currentPaymentMethod || 'offline');
  const [assignToMe, setAssignToMe] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);

  const normalizeAmount = (value: string): number => {
    if (value.trim() === '') return 0;
    const normalized = value.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const amountNum = normalizeAmount(amount);

  React.useEffect(() => {
    setAmount(formatAmount(currentAmount));
    setEmail(currentEmail);
    setPaymentMethod(currentPaymentMethod || 'offline');
  }, [currentAmount, currentEmail, currentPaymentMethod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentMethod === 'online' && !email) {
      alert('Для онлайн предоплаты необходимо указать email клиента');
      return;
    }

    if (totalOrderAmount > 0 && amountNum > totalOrderAmount) {
      alert(`Предоплата не может быть больше общей суммы заказа (${totalOrderAmount.toLocaleString()} BYN)`);
      return;
    }

    setIsLoading(true);
    try {
      await Promise.resolve(onPrepaymentCreated(amountNum, email, paymentMethod, assignToMe));
      onClose();
    } catch (error) {
      alert('Ошибка при создании предоплаты');
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="pp-field">
            <label className="pp-label">Сумма предоплаты (BYN):</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="pp-input"
            />
          </div>

          {paymentMethod === 'online' && (
            <div className="pp-field">
              <label className="pp-label">Email клиента:</label>
              <input
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

          <div className="pp-actions">
            <button type="button" className="pp-btn pp-btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="pp-btn pp-btn-primary"
            >
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
            {amountNum === 0
              ? 'Установка предоплаты в 0 BYN уберёт предоплату с заказа.'
              : paymentMethod === 'online'
                ? 'Онлайн: После создания предоплаты клиенту будет отправлена ссылка для оплаты на указанный email.'
                : 'Оффлайн: Предоплата будет отмечена как полученная в кассе. Email не требуется.'}
          </div>
        </div>
      </div>
    </div>
  );
};
