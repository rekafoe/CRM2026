import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

type PopoverBox = { top: number; left: number; maxHeight: number };

function placeCostSheet(anchor: HTMLElement, panel: HTMLElement | null): PopoverBox {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(720, window.innerWidth * 0.92);
  const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const available = Math.max(160, openAbove ? spaceAbove - 4 : spaceBelow - 4);
  const maxHeight = Math.min(560, available);
  const height = panel ? Math.min(panel.offsetHeight, maxHeight) : maxHeight;
  const top = openAbove
    ? Math.max(margin, rect.top - 4 - height)
    : Math.min(rect.bottom + 4, window.innerHeight - margin - height);
  return { top, left, maxHeight };
}

export const OrderCostSheetPanel: React.FC<Props> = ({ orderId }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<PopoverBox | null>(null);
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
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const place = () => {
      const button = buttonRef.current;
      if (!button) return;
      setBox(placeCostSheet(button, popoverRef.current));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, loading, sheet, error]);

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
        ref={buttonRef}
        type="button"
        className={`order-detail-action-btn order-detail-action-btn--neutral pc-btn--quiet${open ? ' order-cost-sheet__toggle--open' : ''}`}
        title="Закупка, печать и проценты по строкам"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <AppIcon name="money" size="xs" />
        Расходы ▼
      </button>
      {open ? createPortal(
        <div
          ref={popoverRef}
          className="order-cost-sheet__popover order-cost-sheet__popover--portal"
          role="dialog"
          aria-label="Расходы заказа"
          style={box ? { top: box.top, left: box.left, maxHeight: box.maxHeight } : { visibility: 'hidden' }}
        >
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
        </div>,
        document.body,
      ) : null}
    </div>
  );
};
