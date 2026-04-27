import React, { useMemo } from 'react';
import { AppIcon, MoneyAmount } from '../../../components/ui';
import { buildEarningsAnalytics } from './earningsAnalytics';
import type { AdminUserRow } from './earningsTypes';
import './EarningsAnalyticsPanel.css';

type EarningsAnalyticsPanelProps = {
  rows: AdminUserRow[];
  month: string;
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatPercent = (value: number | null) => {
  if (value === null) return 'новая база';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const formatCompactNumber = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

const buildChartPoints = (items: Array<{ month: string; total: number }>) => {
  if (items.length === 0) return '';
  const values = items.map((item) => toNumber(item.total));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = items.length === 1 ? 50 : (index / (items.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');
};

export const EarningsAnalyticsPanel: React.FC<EarningsAnalyticsPanelProps> = ({ rows, month }) => {
  const analytics = useMemo(() => buildEarningsAnalytics(rows, month), [rows, month]);
  const chartPoints = useMemo(() => buildChartPoints(analytics.historyTotals), [analytics.historyTotals]);

  return (
    <div className="earn-analytics-panel">
      <div className="earn-analytics-grid">
        <div className="earn-metric-card earn-metric-card--primary">
          <div className="earn-metric-card__label">ФОТ к выплате</div>
          <div className="earn-metric-card__value"><MoneyAmount value={analytics.net} decimals={0} /></div>
          <div className="earn-metric-card__note">Начислено с премиями и штрафами</div>
        </div>
        <div className="earn-metric-card">
          <div className="earn-metric-card__label">Начислено</div>
          <div className="earn-metric-card__value"><MoneyAmount value={analytics.gross} decimals={0} /></div>
          <div className={`earn-metric-card__note ${analytics.grossDelta >= 0 ? 'earn-note--positive' : 'earn-note--negative'}`}>
            {formatPercent(analytics.grossDeltaPercent)} к прошлому месяцу
          </div>
        </div>
        <div className="earn-metric-card">
          <div className="earn-metric-card__label">Премии / штрафы</div>
          <div className="earn-metric-card__value earn-metric-card__value--split">
            <span><MoneyAmount value={analytics.bonuses} signed decimals={0} /></span>
            <span>−<MoneyAmount value={analytics.penalties} decimals={0} /></span>
          </div>
          <div className="earn-metric-card__note">Корректировки за период</div>
        </div>
        <div className="earn-metric-card">
          <div className="earn-metric-card__label">Средняя ставка</div>
          <div className="earn-metric-card__value"><MoneyAmount value={analytics.avgHourly} decimals={2} /></div>
          <div className="earn-metric-card__note">{formatCompactNumber(analytics.hours)} ч · {analytics.shifts} смен</div>
        </div>
        <div className="earn-metric-card">
          <div className="earn-metric-card__label">Средняя ЗП</div>
          <div className="earn-metric-card__value"><MoneyAmount value={analytics.avgNet} decimals={0} /></div>
          <div className="earn-metric-card__note">{analytics.activeUsers} активных из {analytics.totalUsers}</div>
        </div>
        <div className="earn-metric-card">
          <div className="earn-metric-card__label">Прогноз месяца</div>
          <div className="earn-metric-card__value"><MoneyAmount value={analytics.forecastNet} decimals={0} /></div>
          <div className="earn-metric-card__note">Готовность {analytics.monthProgressPercent.toFixed(0)}%</div>
        </div>
      </div>

      <div className="earn-analytics-layout">
        <section className="earn-admin__card earn-analytics-card">
          <div className="earn-admin__card-header">
            <h3>Динамика фонда ЗП</h3>
            <span className="earn-admin__card-badge">{analytics.historyTotals.length} мес.</span>
          </div>
          <div className="earn-analytics-card__body">
            {analytics.historyTotals.length > 0 ? (
              <>
                <div className="earn-chart earn-chart--large">
                  <svg className="earn-chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline className="earn-chart__line" points={chartPoints} />
                    {analytics.historyTotals.map((entry, index) => {
                      const point = chartPoints.split(' ')[index];
                      if (!point) return null;
                      const [x, y] = point.split(',');
                      return <circle key={entry.month} className="earn-chart__dot" cx={x} cy={y} r="2.5" />;
                    })}
                  </svg>
                  <div className="earn-chart__labels">
                    {analytics.historyTotals.map((entry) => <span key={entry.month}>{entry.month}</span>)}
                  </div>
                </div>
                <div className="earn-history-strip">
                  {analytics.historyTotals.map((entry) => (
                    <div className="earn-history-strip__item" key={entry.month}>
                      <span>{entry.month}</span>
                      <strong><MoneyAmount value={entry.total} decimals={0} /></strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="earn-empty-state">Нет исторических данных для графика</div>
            )}
          </div>
        </section>

        <section className="earn-admin__card earn-analytics-card">
          <div className="earn-admin__card-header">
            <h3>Что требует внимания</h3>
          </div>
          <div className="earn-attention-list">
            {analytics.attention.map((item) => (
              <div className={`earn-attention-item earn-attention-item--${item.tone}`} key={item.key}>
                <span className="earn-attention-item__icon"><AppIcon name="info" size="xs" /></span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="earn-admin__card">
        <div className="earn-admin__card-header">
          <h3>Рейтинг сотрудников</h3>
        </div>
        <div className="earn-table-wrapper">
          <table className="earn-table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>К выплате</th>
                <th>Начислено</th>
                <th>Премии</th>
                <th>Штрафы</th>
                <th>Часы</th>
                <th>Ставка/час</th>
                <th>Доля ФОТ</th>
                <th>Месяц к месяцу</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topByNet.map((row) => {
                const net = toNumber(row.totalNet ?? row.totalCurrentMonth);
                const hourly = row.hours > 0 ? net / row.hours : 0;
                const share = analytics.net > 0 ? (net / analytics.net) * 100 : 0;
                const delta = toNumber(row.totalCurrentMonth) - toNumber(row.totalPreviousMonth);

                return (
                  <tr key={row.userId}>
                    <td className="earn-cell-name">{row.name}</td>
                    <td className="earn-cell-money earn-cell-money--net"><MoneyAmount value={net} /></td>
                    <td className="earn-cell-money"><MoneyAmount value={row.totalCurrentMonth} /></td>
                    <td className="earn-cell-money earn-cell-money--bonus"><MoneyAmount value={row.totalBonuses ?? 0} signed /></td>
                    <td className="earn-cell-money earn-cell-money--penalty">−<MoneyAmount value={row.totalPenalties ?? 0} /></td>
                    <td>{formatCompactNumber(row.hours)}</td>
                    <td><MoneyAmount value={hourly} /></td>
                    <td>{share.toFixed(1)}%</td>
                    <td className={delta >= 0 ? 'earn-note--positive' : 'earn-note--negative'}><MoneyAmount value={delta} signed /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="earn-analytics-layout">
        <section className="earn-admin__card earn-analytics-card">
          <div className="earn-admin__card-header">
            <h3>Самая высокая ставка/час</h3>
          </div>
          <div className="earn-compact-list">
            {analytics.topByHourly.map((row) => {
              const net = toNumber(row.totalNet ?? row.totalCurrentMonth);
              return (
                <div className="earn-compact-list__item" key={row.userId}>
                  <div>
                    <strong>{row.name}</strong>
                    <span>{formatCompactNumber(row.hours)} ч</span>
                  </div>
                  <MoneyAmount value={net / row.hours} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="earn-admin__card earn-analytics-card">
          <div className="earn-admin__card-header">
            <h3>Разрез по ролям</h3>
          </div>
          <div className="earn-table-wrapper">
            <table className="earn-table">
              <thead>
                <tr>
                  <th>Роль</th>
                  <th>Сотр.</th>
                  <th>К выплате</th>
                  <th>Средняя</th>
                  <th>Ставка/час</th>
                </tr>
              </thead>
              <tbody>
                {analytics.roleStats.map((role) => (
                  <tr key={role.role}>
                    <td className="earn-cell-name">{role.role}</td>
                    <td>{role.users}</td>
                    <td className="earn-cell-money earn-cell-money--net"><MoneyAmount value={role.net} /></td>
                    <td><MoneyAmount value={role.avgNet} /></td>
                    <td><MoneyAmount value={role.avgHourly} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
