import React, { useEffect, useState } from 'react';
import { getSalesManagerOutput, type SalesManagerOutput } from '../../../api';
import { MoneyAmount } from '../../../components/ui';

export const SalesOutputPanel: React.FC<{
  month: string;
  departmentId: number | '';
}> = ({ month, departmentId }) => {
  const [rows, setRows] = useState<SalesManagerOutput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSalesManagerOutput({
      month,
      department_id: departmentId === '' ? undefined : departmentId,
    })
      .then((response) => {
        if (!cancelled) setRows(response.data?.managers ?? []);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить выработку');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, departmentId]);

  return (
    <div className="earn-admin__card">
      <div className="earn-admin__card-header">
        <h3>Отдел продаж</h3>
        <span className="earn-admin__card-badge">{rows.length}</span>
      </div>
      <p className="earn-sales-note">
        За каждые 10 000 руб. оформленных заказов закреплённых юрлиц менеджер получает 500 руб.
        Считается само за выбранный месяц и уже входит в «к выплате». Процент за выполнение заказа не отменяется.
        Просчёт в оборот не входит.
      </p>
      {error && <p className="earn-sales-note">{error}</p>}
      <div className="earn-table-wrapper">
        <table className="earn-table">
          <thead>
            <tr>
              <th>Продажник</th>
              <th>Юрлица</th>
              <th>Оборот</th>
              <th>Премия</th>
              <th>До следующих 500</th>
              <th>Заказы</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>Считаем выработку…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6}>Нет сотрудников с закреплёнными юрлицами</td>
              </tr>
            )}
            {rows.map((row) => (
              <React.Fragment key={row.userId}>
                <tr>
                  <td className="earn-cell-name">{row.name}</td>
                  <td>{row.clients}</td>
                  <td className="earn-cell-money"><MoneyAmount value={row.turnover} /></td>
                  <td className="earn-cell-money earn-cell-money--bonus"><MoneyAmount value={row.bonus} /></td>
                  <td className="earn-cell-money"><MoneyAmount value={row.untilNext} /></td>
                  <td>
                    <button type="button" className="earn-month-link" onClick={() => setOpenUserId(openUserId === row.userId ? null : row.userId)}>
                      {row.orders.length}
                    </button>
                  </td>
                </tr>
                {openUserId === row.userId && (
                  <tr>
                    <td colSpan={6}>
                      {row.orders.length === 0 ? (
                        <span className="earn-cell-hint">Оформленных заказов за месяц нет</span>
                      ) : (
                        <table className="earn-table">
                          <thead>
                            <tr>
                              <th>Дата</th>
                              <th>Заказ</th>
                              <th>Юрлицо</th>
                              <th>Сумма</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.orders.map((order) => (
                              <tr key={order.orderId}>
                                <td>{order.orderDate}</td>
                                <td>{order.number}</td>
                                <td>{order.customerName}</td>
                                <td className="earn-cell-money"><MoneyAmount value={order.total} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
