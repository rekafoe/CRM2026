// Компонент временной аналитики

import React from 'react';
import { TimeAnalyticsData } from '../types';

interface TimeAnalyticsProps {
  data: TimeAnalyticsData;
}

export const TimeAnalytics: React.FC<TimeAnalyticsProps> = ({ data }) => {
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
                  backgroundColor: parseInt(hour.hour) >= 9 && parseInt(hour.hour) <= 18 ?
                                   'var(--accent-primary)' : 'var(--accent-light)',
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
          Количество заказов по часам (синий - рабочие часы 9:00-18:00)
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
              {Object.entries(data.timeOfDayTrends)
                .reduce((a, b) => (a as [string, number])[1] > (b as [string, number])[1] ? a : b)[0] === 'morning' ? 'Утро' :
               Object.entries(data.timeOfDayTrends)
                .reduce((a, b) => (a as [string, number])[1] > (b as [string, number])[1] ? a : b)[0] === 'afternoon' ? 'День' :
               Object.entries(data.timeOfDayTrends)
                .reduce((a, b) => (a as [string, number])[1] > (b as [string, number])[1] ? a : b)[0] === 'evening' ? 'Вечер' : 'Ночь'}
            </div>
            <div className="reports-metric-label">
              Самое активное время суток
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
          {[
            { key: 'morning', label: '🌅 Утро (6:00-12:00)', color: 'var(--accent-light)' },
            { key: 'afternoon', label: '☀️ День (12:00-18:00)', color: 'var(--accent-primary)' },
            { key: 'evening', label: '🌆 Вечер (18:00-24:00)', color: '#6c757d' },
            { key: 'night', label: '🌙 Ночь (0:00-6:00)', color: '#343a40' }
          ].map(period => (
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
