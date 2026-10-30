import React, { useCallback, useEffect, useState } from 'react';
import {
  createCustomerLegalPayment,
  deleteCustomerLegalPayment,
  downloadCustomerLegalPaymentFile,
  getCustomerLegalLedger,
} from '../../../api';
import type { CustomerLegalLedger } from '../../../types';
import { Button } from '../../common';
import { MoneyAmount } from '../../ui';
import { downloadAxiosBlob } from '../../../utils/downloadBlob';
import '../../customers/LegalCustomerLedgerCard.css';
import './CustomerLegalDocumentsSection.css';

function todayInput(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPaidAt(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export const CustomerLegalPaymentsSection: React.FC<{ customerId: number }> = ({ customerId }) => {
  const [ledger, setLedger] = useState<CustomerLegalLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayInput);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCustomerLegalLedger(customerId);
      setLedger(response.data);
    } catch (reason: unknown) {
      setLedger(null);
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить поступления');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const balanceClass = !ledger || ledger.balance > 0.004
    ? 'legal-ledger-card__debt'
    : 'legal-ledger-card__ok';

  const submit = async () => {
    if (!amount.trim()) {
      setError('Укажите сумму зачисления');
      return;
    }
    if (!paidAt) {
      setError('Укажите дату зачисления');
      return;
    }
    if (files.length === 0) {
      setError('Приложите подтверждающий документ');
      return;
    }
    const form = new FormData();
    form.append('amount', amount.trim());
    form.append('paid_at', paidAt);
    if (notes.trim()) form.append('notes', notes.trim());
    files.forEach((file) => form.append('files', file));
    setSaving(true);
    setError(null);
    try {
      const response = await createCustomerLegalPayment(customerId, form);
      setLedger(response.data);
      setAmount('');
      setNotes('');
      setFiles([]);
      setFileKey((value) => value + 1);
      setPaidAt(todayInput());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось зачислить оплату');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (paymentId: number) => {
    if (!window.confirm('Удалить это поступление из кредита?')) return;
    setSaving(true);
    setError(null);
    try {
      const response = await deleteCustomerLegalPayment(customerId, paymentId);
      setLedger(response.data);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить поступление');
    } finally {
      setSaving(false);
    }
  };

  const download = async (paymentId: number, fileId: number, name: string) => {
    try {
      const response = await downloadCustomerLegalPaymentFile(customerId, paymentId, fileId);
      downloadAxiosBlob(response, name, 'application/octet-stream');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось скачать файл');
    }
  };

  const walletValue = ledger ? (ledger.balance > 0.004 ? -ledger.balance : Math.abs(ledger.balance)) : 0;
  const walletCaption = !ledger
    ? ''
    : ledger.balance > 0.004
      ? 'клиент должен'
      : ledger.balance < -0.004
        ? 'переплата'
        : 'долга нет';

  return (
    <section className="customers-legal-docs customers-legal-payments">
      <div className="customers-legal-docs__head">
        <h5>Оплаты — кредит</h5>
        <p className="customers-legal-docs__hint">
          Зачислите перевод юрлица и приложите платёжку или скан. Сумма уменьшает долг и попадает в акт сверки.
        </p>
      </div>
      {ledger && (
        <p className="customers-legal-payments__balance">
          Баланс:{' '}
          <MoneyAmount value={walletValue} signed={ledger.balance < -0.004} className={balanceClass} />
          <span className="legal-ledger-card__caption">{walletCaption}</span>
        </p>
      )}
      {error && <div className="customers-legal-docs__error">{error}</div>}
      {loading ? (
        <p className="customers-legal-docs__muted">Загрузка поступлений…</p>
      ) : (
        <div className="customers-legal-docs__table-wrap">
          <table className="customers-legal-docs__table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сумма</th>
                <th>Документы</th>
                <th>Кто зачислил</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(ledger?.payments.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="customers-legal-docs__muted">Поступлений ещё нет</td>
                </tr>
              )}
              {ledger?.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatPaidAt(payment.paid_at)}</td>
                  <td><MoneyAmount value={payment.amount} className="legal-ledger-card__ok" /></td>
                  <td>
                    {payment.notes && <div className="customers-legal-docs__notes">{payment.notes}</div>}
                    {payment.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="customers-legal-payments__file"
                        onClick={() => download(payment.id, file.id, file.original_name)}
                      >
                        {file.original_name}
                      </button>
                    ))}
                  </td>
                  <td>{payment.created_by_name || '—'}</td>
                  <td>
                    <Button variant="secondary" size="sm" disabled={saving} onClick={() => remove(payment.id)}>
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="customers-legal-docs__form customers-legal-docs__form--new">
        <label>
          <span>Сумма</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
          />
        </label>
        <label>
          <span>Дата зачисления</span>
          <input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
        </label>
        <label className="customers-legal-docs__full">
          <span>Комментарий <span className="customers-legal-docs__optional">необязательно</span></span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Номер платёжки"
          />
        </label>
        <label className="customers-legal-docs__full">
          <span>Подтверждающие документы</span>
          <input
            key={fileKey}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        <div className="customers-legal-docs__form-actions">
          <Button variant="primary" size="sm" disabled={saving} onClick={submit}>
            {saving ? 'Сохраняем…' : 'Зачислить'}
          </Button>
        </div>
      </div>
    </section>
  );
};
