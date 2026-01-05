// Компонент аналитики менеджеров

import React from 'react';
import { ManagerAnalyticsData } from '../types';

interface ManagerAnalyticsProps {
  data: ManagerAnalyticsData;
}

export const ManagerAnalytics: React.FC<ManagerAnalyticsProps> = ({ data }) => {
  return (
    <>
      {/* Эффективность менеджеров */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          👥 Эффективность менеджеров
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.managerEfficiency.slice(0, 5).map((manager, index) => (
            <div key={manager.user_id} style={{
              padding: '16px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: index < 3 ? 'var(--accent-primary)' : 'var(--accent-light)',
                    color: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '16px'
                  }}>
                    {index + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--text-primary)' }}>
                      {manager.user_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Активен {manager.active_days} дней
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {manager.total_revenue?.toLocaleString('ru-RU')} BYN
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {manager.total_orders} заказов
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {manager.completed_orders}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Выполнено
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: manager.cancelled_orders > 0 ? '#dc3545' : 'var(--accent-primary)' }}>
                    {manager.cancelled_orders}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Отменено
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {manager.avg_order_value?.toFixed(0)} BYN
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Средний чек
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {manager.avg_processing_hours?.toFixed(1)} ч
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Время обработки
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Конверсия менеджеров */}
      <div className="reports-metrics" style={{ marginBottom: '20px' }}>
        <h4 className="reports-metrics-title">
          🎯 Конверсия менеджеров
        </h4>
        <div className="reports-metrics-grid">
          {data.managerConversion.slice(0, 4).map((manager) => (
            <div key={manager.user_id} className="reports-metric">
              <div className="reports-metric-value" style={{
                color: manager.conversion_rate >= 80 ? 'var(--accent-primary)' :
                       manager.conversion_rate >= 60 ? '#ffc107' : '#dc3545'
              }}>
                {manager.conversion_rate?.toFixed(1)}%
              </div>
              <div className="reports-metric-label">
                {manager.user_name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
