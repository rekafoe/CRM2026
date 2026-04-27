// Компонент временной аналитики

import React from 'react';
import { TimeAnalyticsData } from '../types';
import type { TimeOfDayTrends } from '../types';
import { MoneyAmount } from '../../../components/ui';

interface TimeAnalyticsProps {
  data: TimeAnalyticsData;
}

export const TimeAnalytics: React.FC<TimeAnalyticsProps> = ({ data }) => {
  const periods = [
    { key: 'morning', label: '🌅 Утро (9:00–12:00)', color: 'var(--accent-light)' },
    { key: 'afternoon', label: '☀️ День (12:00–15:00)', color: 'var(--accent-primary)' },
    { key: 'evening', label: '🌆 Вечер (15:00–18:00)', color: '#6c757d' },
    { key: 'night', label: '🌙 Конец дня (18:00–20:00)', color: '#343a40' }
  ] as const satisfies ReadonlyArray<{ key: keyof TimeOfDayTrends; label: string; color: string }>;

  return (
    <>
      {/* Почасовое распределение */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          🕐 Распределение заказов по часам
        </h4>
        <div style={{ height: '200px', display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '2px' }}>
          {data.hourlyAnalysis.map((hour) => {
            const maxOrders = Math.max(...data.hourlyAnalysis.map((h) => h.orders_count));
            const height = maxOrders > 0 ? (hour.orders_count / maxOrders) * 150 : 0;

            return (
              <div key={hour.hour} style={{ textAlign: 'center', flex: '1', minWidth: '20px' }}>
                <div style={{
                  height: `${height}px`,
                  backgroundColor: 'var(--accent-primary)',
                  borderRadius: '2px 2px 0 0',
                  minHeight: '4px',
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'end',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '9px',
                  fontWeight: 'bold'
                }}>
                  {hour.orders_count > 0 ? hour.orders_count : ''}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                  {hour.hour}:00
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Рабочие часы 9:00–20:00, градация по часам
        </div>
      </div>

      {/* Статистика по каждому часу */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          📊 Статистика по часам
        </h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Час</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Заказов</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Выручка</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {data.hourlyAnalysis.map((h) => (
                <tr key={h.hour} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{h.hour}:00</td>
                  <td style={{ textAlign: 'right', padding: '8px 12px' }}>{h.orders_count}</td>
                  <td style={{ textAlign: 'right', padding: '8px 12px' }}>
                    {h.total_revenue != null && Number(h.total_revenue) > 0
                      ? <MoneyAmount value={h.total_revenue} decimals={0} />
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 12px' }}>
                    {h.avg_order_value != null && Number(h.avg_order_value) > 0
                      ? <MoneyAmount value={h.avg_order_value} decimals={0} />
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Пиковые периоды */}
      <div className="reports-metrics" style={{ marginBottom: '20px' }}>
        <h4 className="reports-metrics-title">
          ⚡ Пиковые периоды
        </h4>
        <div className="reports-metrics-grid">
          <div className="reports-metric">
            <div className="reports-metric-value">
              {data.peakPeriods.peakHour.hour}:00
            </div>
            <div className="reports-metric-label">
              Самый загруженный час
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-value">
              {data.peakPeriods.peakWeekday.weekday}
            </div>
            <div className="reports-metric-label">
              Самый загруженный день
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-value">
              {data.peakPeriods.busiestTimeSlot.orders_count}
            </div>
            <div className="reports-metric-label">
              Максимум заказов в час
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-value">
              {              (() => {
                const entries = Object.entries(data.timeOfDayTrends);
                const max = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
                return max[0] === 'morning' ? 'Утро (9–12)' : max[0] === 'afternoon' ? 'День (12–15)' : max[0] === 'evening' ? 'Вечер (15–18)' : 'Конец дня (18–20)';
              })()}
            </div>
            <div className="reports-metric-label">
              Самое активное окно (в рабочих часах)
            </div>
          </div>
        </div>
      </div>

      {/* Анализ времени суток */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          🌅 Активность по времени суток
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {periods.map((period) => (
            <div key={period.key} style={{
              padding: '16px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: period.color }}>
                {data.timeOfDayTrends[period.key]}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {period.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
