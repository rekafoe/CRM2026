import React from 'react';
import { MoneyAmount } from '../../../components/ui';
import type { PnLData } from '../types';

interface PnLAnalyticsProps {
  data: PnLData;
  includePayroll: boolean;
  includeCogs: boolean;
}

export const PnLAnalytics: React.FC<PnLAnalyticsProps> = ({ data, includePayroll, includeCogs }) => {
  const sorted = [...data.locations].sort((a, b) => b.result - a.result);

  return (
    <div className="reports-metrics" style={{ marginBottom: '20px' }}>
      <h4 className="reports-metrics-title">📊 P&L по точкам</h4>
      <div className="reports-metrics-grid">
        <div className="reports-metric">
          <div className="reports-metric-value">
            <MoneyAmount value={data.totals.revenue} decimals={0} />
          </div>
          <div className="reports-metric-label">Выручка</div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value">
            <MoneyAmount value={data.totals.expenses} decimals={0} />
          </div>
          <div className="reports-metric-label">Расходы</div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value" style={{ color: data.totals.result >= 0 ? 'var(--accent-primary)' : '#dc3545' }}>
            <MoneyAmount value={data.totals.result} decimals={0} />
          </div>
          <div className="reports-metric-label">Результат</div>
        </div>
        {data.unassigned_revenue > 0 && (
          <div className="reports-metric">
            <div className="reports-metric-value">
              <MoneyAmount value={data.unassigned_revenue} decimals={0} />
            </div>
            <div className="reports-metric-label">Выручка без точки</div>
          </div>
        )}
      </div>

      <div className="reports-drilldown-table-wrap" style={{ marginTop: 16 }}>
        <table className="reports-drilldown-table">
          <thead>
            <tr>
              <th>Точка</th>
              <th>Выручка</th>
              <th>Расходы</th>
              {includePayroll && <th>ФОТ</th>}
              {includeCogs && <th>Себестоимость</th>}
              <th>Результат</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.department_id}>
                <td>{row.name}</td>
                <td><MoneyAmount value={row.revenue} decimals={0} /></td>
                <td><MoneyAmount value={row.expenses} decimals={0} /></td>
                {includePayroll && <td><MoneyAmount value={row.payroll ?? 0} decimals={0} /></td>}
                {includeCogs && <td><MoneyAmount value={row.cogs ?? 0} decimals={0} /></td>}
                <td style={{ color: row.result >= 0 ? undefined : '#dc3545' }}>
                  <MoneyAmount value={row.result} decimals={0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
