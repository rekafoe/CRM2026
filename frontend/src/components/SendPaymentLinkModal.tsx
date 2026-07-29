import React, { useEffect, useState } from 'react';
import { Modal, Button } from './common';
import { sendOrderPaymentLink, SendPaymentLinkChannel } from '../api';
import { Order } from '../types';
import { isPaidPrepaymentStatus, parseNumberFlexible } from '../utils/numberInput';
import '../styles/send-payment-link-modal.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  debtAmount: number;
  onUpdated: (order: Order) => void;
  onToast: (type: 'success' | 'error', title: string, message?: string) => void;
};

export const SendPaymentLinkModal: React.FC<Props> = ({
  isOpen,
  onClose,
  order,
  debtAmount,
  onUpdated,
  onToast,
}) => {
  const paid = isPaidPrepaymentStatus(order.prepaymentStatus);
  const paidAmount = paid ? parseNumberFlexible(order.prepaymentAmount ?? 0) : 0;
  const total =
    typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : 0;
  const suggested = Math.max(debtAmount, Math.max(0, total - paidAmount));

  const [amount, setAmount] = useState(String(suggested > 0 ? suggested.toFixed(2) : ''));
  const [channel, setChannel] = useState<SendPaymentLinkChannel>('both');
  const [sending, setSending] = useState(false);
  const [recreate, setRecreate] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAmount(String(suggested > 0 ? suggested.toFixed(2) : ''));
    setChannel('both');
    setRecreate(false);
  }, [isOpen, order.id, suggested]);

  const paymentUrl = order.paymentUrl?.trim() || '';

  const handleCopy = async () => {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      onToast('success', 'Ссылка скопирована');
    } catch {
      onToast('error', 'Не удалось скопировать');
    }
  };

  const handleSend = async () => {
    const value = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      onToast('error', 'Укажите сумму больше нуля');
      return;
    }
    setSending(true);
    try {
      const { data } = await sendOrderPaymentLink(order.id, {
        amount: value,
        channel,
        recreate: recreate || !paymentUrl,
      });
      onUpdated(data);
      const parts: string[] = [];
      if (channel === 'sms' || channel === 'both') {
        parts.push(data.sentSms ? 'SMS отправлено' : `SMS: ${data.smsError || 'не отправлено'}`);
      }
      if (channel === 'email' || channel === 'both') {
        parts.push(data.sentEmail ? 'Email в очереди' : `Email: ${data.emailError || 'не отправлено'}`);
      }
      if (channel === 'none') {
        parts.push('Ссылка создана');
      }
      const hasFail =
        ((channel === 'sms' || channel === 'both') && !data.sentSms) ||
        ((channel === 'email' || channel === 'both') && !data.sentEmail);
      if (channel === 'none' || !hasFail) {
        onToast('success', 'Готово', parts.join('. '));
        onClose();
      } else if (data.sentSms || data.sentEmail || data.paymentUrl) {
        onToast('error', 'Частично', parts.join('. '));
      } else {
        onToast('error', 'Не удалось отправить', parts.join('. '));
      }
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string }; status?: number };
        message?: string;
        code?: string;
      };
      const msg =
        ax.response?.data?.message ||
        (ax.code === 'ECONNABORTED'
          ? 'Сервер не успел ответить (таймаут). Проверьте BePaid / Railway и повторите.'
          : ax.message) ||
        (err instanceof Error ? err.message : 'Ошибка отправки');
      onToast('error', 'Ошибка оплаты', msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ссылка на оплату" size="sm">
      <div className="send-payment-link-modal">
        <p className="send-payment-link-modal__hint">
          Заказ {order.number}. Сумма по умолчанию — долг клиента.
        </p>

        <label className="send-payment-link-modal__field">
          <span>Сумма, BYN</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <fieldset className="send-payment-link-modal__channels">
          <legend>Отправить клиенту</legend>
          {(
            [
              ['sms', 'SMS'],
              ['email', 'Email'],
              ['both', 'SMS и Email'],
              ['none', 'Только создать ссылку'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="send-payment-link-modal__radio">
              <input
                type="radio"
                name="payment-link-channel"
                checked={channel === value}
                onChange={() => setChannel(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {paymentUrl && (
          <div className="send-payment-link-modal__url">
            <span className="send-payment-link-modal__url-label">Текущая ссылка</span>
            <code title={paymentUrl}>{paymentUrl}</code>
            <div className="send-payment-link-modal__url-actions">
              <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopy()}>
                Скопировать
              </Button>
              <label className="send-payment-link-modal__recreate">
                <input
                  type="checkbox"
                  checked={recreate}
                  onChange={(e) => setRecreate(e.target.checked)}
                />
                Пересоздать
              </label>
            </div>
          </div>
        )}

        <div className="send-payment-link-modal__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending}>
            {sending ? 'Отправка…' : 'Отправить'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
