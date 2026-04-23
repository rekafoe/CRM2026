import React from 'react';
import { Customer } from '../../../../types';

export interface CustomerDetailMetrics {
  ordersCount: number;
  averageCheck: number;
  averageIntervalDays: number | null;
}

interface CustomerDetailOverviewPanelProps {
  customer: Customer;
  displayName: string;
  customerMetrics: CustomerDetailMetrics;
}

export const CustomerDetailOverviewPanel: React.FC<CustomerDetailOverviewPanelProps> = ({
  customer,
  displayName,
  customerMetrics,
}) => {
  const typeLabel = customer.type === 'legal' ? 'Юридическое лицо' : 'Физическое лицо';

  return (
    <div>
      <div className="customer-detail-view__section-head">
        <h2 className="customer-detail-view__title">{displayName}</h2>
        <p className="customer-detail-view__subtitle">{typeLabel}</p>
      </div>

      <div className="customers-summary customer-detail-view__summary">
        <div className="customers-summary-card">
          <div className="customers-summary-title">Средний чек</div>
          <div className="customers-summary-value">
            {customerMetrics.ordersCount > 0 ? `${customerMetrics.averageCheck.toFixed(2)} BYN` : '—'}
          </div>
        </div>
        <div className="customers-summary-card">
          <div className="customers-summary-title">Периодичность заказов</div>
          <div className="customers-summary-value">
            {customerMetrics.averageIntervalDays === null
              ? '—'
              : `${customerMetrics.averageIntervalDays.toFixed(1)} дн.`}
          </div>
        </div>
        <div className="customers-summary-card">
          <div className="customers-summary-title">Всего заказов (в периоде)</div>
          <div className="customers-summary-value">{customerMetrics.ordersCount}</div>
        </div>
      </div>
    </div>
  );
};
