// Компонент аналитики статусов заказов

import React from 'react';
import { OrderStatusAnalyticsData } from '../types';
import { BynSymbol, MoneyAmount } from '../../../components/ui';

interface OrderStatusAnalyticsProps {
  data: OrderStatusAnalyticsData;
}

export const OrderStatusAnalytics: React.FC<OrderStatusAnalyticsProps> = ({ data }) => {
  return (
    <div className="reports-chart" style={{ marginBottom: '20px' }}>
      <h4 className="reports-chart-title">
        📋 Воронка статусов заказов
      </h4>

      {/* Визуальная воронка */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
        {data.statusFunnel.map((status) => {
          const maxCount = Math.max(...data.statusFunnel.map((s) => s.count));
          const width = maxCount > 0 ? (status.count / maxCount * 100) : 0;

          return (
            <div key={status.status} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                minWidth: '100px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontWeight: 'bold'
              }}>
                {status.status_name}
              </div>
              <div style={{
                flex: 1,
                height: '32px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '4px',
                position: 'relative',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{
                  height: '100%',
                  width: `${width}%`,
                  backgroundColor: status.status === 5 ? '#dc3545' :
                                   status.status === 4 ? 'var(--accent-primary)' :
                                   'var(--accent-light)',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--bg-primary)',
                  fontWeight: 'bold',
                  fontSize: '12px'
                }}>
                  {status.count}
                </div>
              </div>
              <div style={{ minWidth: '80px', textAlign: 'right', fontSize: '12px', color: 'var(--text-primary)' }}>
                <MoneyAmount value={status.total_amount || 0} decimals={0} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Метрики времени выполнения */}
      <div className="reports-metrics-grid">
        <div className="reports-metric">
          <div className="reports-metric-value">
            {data.avgProcessingTime?.avg_hours_to_complete?.toFixed(1) || '0'}
          </div>
          <div className="reports-metric-label">
            Среднее время выполнения (часы)
          </div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value">
            {data.avgProcessingTime?.completed_orders || 0}
          </div>
          <div className="reports-metric-label">
            Завершенных заказов
          </div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value" style={{ color: '#dc3545' }}>
            {data.cancellationReasons?.cancelled_count || 0}
          </div>
          <div className="reports-metric-label">
            Отмененных заказов
          </div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value" style={{ color: '#dc3545' }}>
            <MoneyAmount value={data.cancellationReasons?.cancelled_amount || 0} decimals={0} />
          </div>
          <div className="reports-metric-label">
            Потери от отмен (<BynSymbol />)
          </div>
        </div>
      </div>
    </div>
  );
};
