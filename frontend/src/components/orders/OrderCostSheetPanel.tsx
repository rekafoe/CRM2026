import React, { useEffect, useRef, useState } from 'react';
import { getOrderCostSheet, type OrderCostSheet } from '../../api';
import { AppIcon } from '../ui/AppIcon';
import { MoneyAmount } from '../ui/MoneyAmount';
import './OrderCostSheetPanel.css';

type Props = {
  orderId: number;
};

function qtyLabel(value: number | null): string {
  if (value == null) return '';
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

function RoleCell({
  amount,
  percent,
  assigned,
}: {
  amount: number;
  percent: number;
  assigned: boolean;
}) {
  if (!assigned) {
    return <span className="order-cost-sheet__unassigned" title="Роль не назначена, в зарплату не пишется">—</span>;
  }
  return (
    <span className="order-cost-sheet__role">
      <MoneyAmount value={amount} />
      <span className="order-cost-sheet__pct">{percent}%</span>
    </span>
  );
}

export const OrderCostSheetPanel: React.FC<Props> = ({ orderId }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<OrderCostSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOpen(false);
    setSheet(null);
    setError('');
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getOrderCostSheet(orderId)
      .then((response) => {
        if (!cancelled) setSheet(response.data);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось посчитать расходы');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  return (
    <div className="order-cost-sheet" ref={rootRef}>
      <button
        type="button"
        className={`order-detail-action-btn order-detail-action-btn--neutral${open ? ' order-cost-sheet__toggle--open' : ''}`}
        title="Закупка, печать и проценты по строкам"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <AppIcon name="money" size="xs" />
        Расходы ▼
      </button>
      {open ? (
        <div className="order-cost-sheet__popover" role="dialog" aria-label="Расходы заказа">
          <h3>Расходы и проценты</h3>
          <p className="order-cost-sheet__note">
            Из отпускной цены строки вычитается закупка материала, себестоимость печати и плата за макет.
            Процент берётся с остатка. Неназначенная роль в зарплату не пишется.
          </p>
          {loading ? <p className="order-cost-sheet__note">Считаем…</p> : null}
          {error ? <p className="order-cost-sheet__error">{error}</p> : null}
          {sheet && !loading ? (
            <>
              <table className="order-cost-sheet__table">
                <thead>
                  <tr>
                    <th>Расход</th>
                    <th>Кол-во</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.expenses.length === 0 ? (
                    <tr>
                      <td colSpan={3}>Расходов нет: закупка и себестоимость печати не заданы.</td>
                    </tr>
                  ) : sheet.expenses.map((row, index) => (
                    <tr key={`${row.kind}-${index}`}>
                      <td>{row.title}</td>
                      <td>{qtyLabel(row.quantity)}</td>
                      <td><MoneyAmount value={row.amount} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Всего расходов</td>
                    <td><MoneyAmount value={sheet.expensesTotal} /></td>
                  </tr>
                </tfoot>
              </table>

              <table className="order-cost-sheet__table order-cost-sheet__table--lines">
                <thead>
                  <tr>
                    <th>Строка</th>
                    <th>Отпуск</th>
                    <th>База</th>
                    <th>Конт {sheet.rates.contact}%</th>
                    <th>Ответ {sheet.rates.responsible}%</th>
                    <th>Испол</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6}>В заказе нет позиций.</td>
                    </tr>
                  ) : sheet.lines.map((line) => (
                    <tr key={line.itemId}>
                      <td>
                        <span className="order-cost-sheet__title">{line.title}</span>
                        <span className="order-cost-sheet__qty">× {qtyLabel(line.quantity)}</span>
                      </td>
                      <td><MoneyAmount value={line.revenue} /></td>
                      <td><MoneyAmount value={line.base} /></td>
                      <td>
                        <RoleCell amount={line.contactAmount} percent={line.contactPercent} assigned={line.contactAssigned} />
                      </td>
                      <td>
                        <RoleCell amount={line.responsibleAmount} percent={line.responsiblePercent} assigned={line.responsibleAssigned} />
                      </td>
                      <td>
                        <RoleCell amount={line.executorAmount} percent={line.executorPercent} assigned={line.executorAssigned} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {sheet.lines.length > 0 ? (
                  <tfoot>
                    <tr>
                      <td>Итого</td>
                      <td><MoneyAmount value={sheet.totals.revenue} /></td>
                      <td><MoneyAmount value={sheet.totals.base} /></td>
                      <td><MoneyAmount value={sheet.totals.contact} /></td>
                      <td><MoneyAmount value={sheet.totals.responsible} /></td>
                      <td><MoneyAmount value={sheet.totals.executor} /></td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
