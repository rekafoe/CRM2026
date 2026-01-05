// Компонент аналитики продуктов

import React from 'react';
import { ProductAnalyticsData } from '../types';

interface ProductAnalyticsProps {
  data: ProductAnalyticsData;
}

export const ProductAnalytics: React.FC<ProductAnalyticsProps> = ({ data }) => {
  return (
    <>
      {/* Топ продуктов */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          🏆 Популярность продуктов (Топ-10 за {data.period.days} дней)
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.productPopularity.map((product, index) => (
            <div
              key={product.product_type}
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
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
                      {product.product_type}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {product.order_count} заказов • {product.total_quantity} шт.
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {product.total_revenue.toLocaleString('ru-RU')} BYN
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    ~{product.avg_price.toFixed(2)} BYN/шт
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Категории продуктов */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          📂 Распределение по категориям продуктов
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {data.categoryStats.map((category) => {
            const totalRevenue = data.categoryStats.reduce((sum, cat) => sum + cat.total_revenue, 0);
            const percentage = totalRevenue > 0 ? (category.total_revenue / totalRevenue * 100) : 0;

            return (
              <div key={category.category} style={{
                padding: '16px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                  {percentage.toFixed(1)}%
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {category.category}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {category.order_count} заказов<br/>
                  {category.total_revenue.toLocaleString('ru-RU')} BYN
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
