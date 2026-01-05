// Компонент финансовой аналитики

import React from 'react';
import { FinancialAnalyticsData } from '../types';

interface FinancialAnalyticsProps {
  data: FinancialAnalyticsData;
}

export const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({ data }) => {
  return (
    <div className="reports-metrics" style={{ marginBottom: '20px' }}>
      <h4 className="reports-metrics-title">
        💰 Финансовая аналитика
      </h4>
      <div className="reports-metrics-grid">
        <div className="reports-metric">
          <div className="reports-metric-value">
            {data.paymentAnalysis.online_orders + data.paymentAnalysis.offline_orders + data.paymentAnalysis.telegram_orders}
          </div>
          <div className="reports-metric-label">
            Всего платежей
          </div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value">
            {data.paymentAnalysis.avg_payment_amount?.toFixed(2) || '0.00'}
          </div>
          <div className="reports-metric-label">
            Средний платеж (BYN)
          </div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value" style={{ color: 'var(--accent-primary)' }}>
            {data.prepaymentAnalysis.paid_prepayments}
          </div>
          <div className="reports-metric-label">
            Оплаченные предоплаты
          </div>
        </div>
        <div className="reports-metric">
          <div className="reports-metric-value" style={{ color: '#6c757d' }}>
            {data.prepaymentAnalysis.pending_prepayments}
          </div>
          <div className="reports-metric-label">
            Ожидают оплаты
          </div>
        </div>
      </div>

      {/* Способы оплаты */}
      <div style={{ marginTop: '16px' }}>
        <h5 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '14px' }}>
          💳 Способы оплаты
        </h5>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center', flex: '1', minWidth: '120px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
              {data.paymentAnalysis.online_orders}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Онлайн
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
              {data.paymentAnalysis.online_revenue?.toLocaleString('ru-RU')} BYN
            </div>
          </div>
          <div style={{ textAlign: 'center', flex: '1', minWidth: '120px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-light)' }}>
              {data.paymentAnalysis.offline_orders}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Оффлайн
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
              {data.paymentAnalysis.offline_revenue?.toLocaleString('ru-RU')} BYN
            </div>
          </div>
          <div style={{ textAlign: 'center', flex: '1', minWidth: '120px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6c757d' }}>
              {data.paymentAnalysis.telegram_orders}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Telegram
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
              {data.paymentAnalysis.telegram_revenue?.toLocaleString('ru-RU')} BYN
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
