import React, { useEffect, useState } from 'react';
import { getCustomerLegalLedger } from '../../api';
import type { CustomerLegalLedger } from '../../types';
import { MoneyAmount } from '../ui';
import './LegalCustomerLedgerCard.css';

const KIND_LABELS: Record<string, string> = {
  act: 'Акт',
  invoice: 'Счёт',
  contract: 'Договор',
  tn: 'Товарная накладная',
  receipt: 'Товарный чек',
  reconciliation: 'Акт сверки',
  other: 'Документ',
};

function formatIssuedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString('ru-RU');
}

function documentLabel(document: NonNullable<CustomerLegalLedger['last_document']>): string {
  const kind = document.document_kind ? KIND_LABELS[document.document_kind] || document.title : document.title;
  const number = document.number ? ` ${document.number}` : '';
  const order = document.order_number
    ? ` · заказ ${document.order_number}`
    : document.order_id
      ? ` · заказ #${document.order_id}`
      : '';
  return `${kind}${number}${order} · ${formatIssuedAt(document.issued_at)}`;
}

function orderText(order: NonNullable<CustomerLegalLedger['order']>, entitySettled: boolean): React.ReactNode {
  if (order.included) {
    if (entitySettled && order.debit > 0.004) {
      return <>оплачен</>;
    }
    const collected = Number(order.collected) || 0;
    const due = Math.round((order.debit - collected) * 100) / 100;
    if (due <= 0.004 && collected > 0.004) {
      return (
        <>
          оплачен · <MoneyAmount value={collected} className="legal-ledger-card__ok" />
        </>
      );
    }
    if (collected > 0.004 && due > 0.004) {
      return (
        <>
          к оплате <MoneyAmount value={due} className="legal-ledger-card__debt" />
          <span className="legal-ledger-card__caption">
            по заказу зачтено <MoneyAmount value={collected} />
          </span>
        </>
      );
    }
    return (
      <>
        в дебете <MoneyAmount value={order.debit} className="legal-ledger-card__debt" />
      </>
    );
  }
  if (order.skip === 'zero') return 'сумма 0 — в дебет после расчёта';
  if (order.skip === 'waiting') {
    return (
      <>
        просчёт <MoneyAmount value={order.debit} /> — в дебет после оформления
      </>
    );
  }
  if (order.skip === 'cancelled') return 'отменён, в дебет не входит';
  if (order.skip === 'internal') return 'внутренний, в дебет не входит';
  return 'не относится к этому юрлицу';
}

export const LegalCustomerLedgerCard: React.FC<{
  customerId: number;
  orderId?: number;
  refreshKey?: string | number;
}> = ({ customerId, orderId, refreshKey }) => {
  const [ledger, setLedger] = useState<CustomerLegalLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      setError(null);
      getCustomerLegalLedger(customerId, orderId)
        .then((response) => {
          if (!cancelled) setLedger(response.data);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setLedger(null);
          setError(reason instanceof Error ? reason.message : 'Не удалось посчитать баланс');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [customerId, orderId, refreshKey]);

  if (loading && !ledger) {
    return <div className="legal-ledger-card legal-ledger-card--muted">Считаем баланс…</div>;
  }
  if (error || !ledger) {
    return <div className="legal-ledger-card legal-ledger-card--muted">{error || 'Нет данных по балансу'}</div>;
  }

  const walletClass = ledger.balance > 0.004 ? 'legal-ledger-card__debt' : 'legal-ledger-card__ok';
  const walletValue = ledger.balance > 0.004 ? -ledger.balance : Math.abs(ledger.balance);
  const walletCaption = ledger.balance > 0.004
    ? 'клиент должен'
    : ledger.balance < -0.004
      ? 'переплата'
      : 'долга нет';

  return (
    <div className="legal-ledger-card">
      <table>
        <tbody>
          <tr>
            <th>Менеджер</th>
            <td>{ledger.manager_name?.trim() || 'не закреплён'}</td>
          </tr>
          <tr>
            <th>Баланс</th>
            <td>
              <MoneyAmount value={walletValue} signed={ledger.balance < -0.004} className={walletClass} />
              <span className="legal-ledger-card__caption">{walletCaption}</span>
            </td>
          </tr>
          <tr>
            <th>Зачтено</th>
            <td>
              <MoneyAmount value={ledger.credit_total} className="legal-ledger-card__ok" />
              <span className="legal-ledger-card__caption">
                из дебета <MoneyAmount value={ledger.debit_total} />
              </span>
            </td>
          </tr>
          {ledger.order && (
            <tr>
              <th>Этот заказ</th>
              <td>{orderText(ledger.order, ledger.balance <= 0.004)}</td>
            </tr>
          )}
          <tr>
            <th>Последний документ</th>
            <td>{ledger.last_document ? documentLabel(ledger.last_document) : 'ещё не выставляли'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
