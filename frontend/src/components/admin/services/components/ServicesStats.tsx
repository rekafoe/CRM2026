import React from 'react';
import { PricingService } from '../../../../types/pricing';

interface ServicesStatsProps {
  services: PricingService[];
}

/**
 * Компонент статистики услуг
 */
export const ServicesStats: React.FC<ServicesStatsProps> = ({ services }) => {
  const stats = {
    total: services.length,
    active: services.filter((s) => s.isActive).length,
    inactive: services.filter((s) => !s.isActive).length,
    totalValue: services.reduce((sum, s) => sum + s.rate, 0),
    types: [...new Set(services.map((s) => s.type))].length,
  };

  return (
    <div className="services-stats">
      <div className="stat-card">
        <div className="stat-card__header">
          <span className="stat-card__label">Всего услуг</span>
          <span className="stat-card__icon">📋</span>
        </div>
        <div className="stat-card__value">{stats.total}</div>
        <div className="stat-card__trend">+{stats.types} типов</div>
      </div>

      <div className="stat-card">
        <div className="stat-card__header">
          <span className="stat-card__label">Активных</span>
          <span className="stat-card__icon">✅</span>
        </div>
        <div className="stat-card__value">{stats.active}</div>
        <div className="stat-card__trend">
          {stats.total > 0
            ? ((stats.active / stats.total) * 100).toFixed(0)
            : 0}% от всех
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-card__header">
          <span className="stat-card__label">Неактивных</span>
          <span className="stat-card__icon">⏸️</span>
        </div>
        <div className="stat-card__value">{stats.inactive}</div>
        <div className="stat-card__trend stat-card__trend--negative">
          {stats.inactive > 0 ? 'Требуют внимания' : 'Отлично!'}
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-card__header">
          <span className="stat-card__label">Средняя цена</span>
          <span className="stat-card__icon">💵</span>
        </div>
        <div className="stat-card__value">
          {(stats.totalValue / stats.total || 0).toFixed(2)}
        </div>
        <div className="stat-card__trend">BYN</div>
      </div>
    </div>
  );
};
