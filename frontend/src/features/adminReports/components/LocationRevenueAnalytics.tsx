import React from 'react';
import { MoneyAmount } from '../../../components/ui';
import type { LocationRevenueData } from '../types';

interface LocationRevenueAnalyticsProps {
  data: LocationRevenueData;
}

export const LocationRevenueAnalytics: React.FC<LocationRevenueAnalyticsProps> = ({ data }) => {
  const sorted = [...data.locations].sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="reports-metrics" style={{ marginBottom: '20px' }}>
      <h4 className="reports-metrics-title">📍 Выручка по точкам</h4>
      <div className="reports-metrics-grid">
        <div className="reports-metric">
          <div className="reports-metric-value">
            <MoneyAmount value={data.company_total} decimals={0} />
          </div>
          <div className="reports-metric-label">Итого по компании</div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value">
            <MoneyAmount value={data.unassigned} decimals={0} />
          </div>
          <div className="reports-metric-label">Без точки исполнения</div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value">{data.locations.length}</div>
          <div className="reports-metric-label">Активных точек</div>
        </div>
      </div>

      <div className="reports-drilldown-table-wrap" style={{ marginTop: 16 }}>
        <table className="reports-drilldown-table">
          <thead>
            <tr>
              <th>Точка</th>
              <th>Заказов</th>
              <th>Выручка</th>
              <th>Доля</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const share = data.company_total > 0 ? (row.revenue / data.company_total) * 100 : 0;
              return (
                <tr key={row.department_id}>
                  <td>{row.name}</td>
                  <td>{row.orders ?? '—'}</td>
                  <td><MoneyAmount value={row.revenue} decimals={0} /></td>
                  <td>{share.toFixed(1)}%</td>
                </tr>
              );
            })}
            {data.unassigned > 0 && (
              <tr>
                <td>Без точки</td>
                <td>—</td>
                <td><MoneyAmount value={data.unassigned} decimals={0} /></td>
                <td>
                  {data.company_total > 0
                    ? `${((data.unassigned / data.company_total) * 100).toFixed(1)}%`
                    : '—'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.by_month && data.by_month.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h5 className="reports-metrics-title" style={{ fontSize: 14 }}>По месяцам</h5>
          <div className="reports-stat-yearly-months">
            {data.by_month.map((m) => (
              <span key={m.month} className="reports-stat-yearly-month">
                <span className="reports-stat-yearly-month__label">{m.month}</span>
                <span className="reports-stat-yearly-month__val">
                  {Number(m.revenue || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
