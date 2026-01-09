import React from 'react';
import { Button } from '../../../common';
import { PricingService } from '../../../../types/pricing';
import { getServiceIcon, getServiceTypeLabel } from '../utils/serviceFormatters';

interface ServicesFiltersProps {
  services: PricingService[];
  searchValue: string;
  typeFilter: string;
  sortBy: 'name' | 'price' | 'type';
  sortOrder: 'asc' | 'desc';
  onSearchChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onSortChange: (field: 'name' | 'price' | 'type', order: 'asc' | 'desc') => void;
  onCreateService: () => void;
}

/**
 * Компонент фильтров и поиска для услуг
 */
export const ServicesFilters: React.FC<ServicesFiltersProps> = ({
  services,
  searchValue,
  typeFilter,
  sortBy,
  sortOrder,
  onSearchChange,
  onTypeFilterChange,
  onSortChange,
  onCreateService,
}) => {
  const availableTypes = [...new Set(services.map((s) => s.type))];

  return (
    <div className="services-controls">
      <div className="services-controls__row">
        <div className="services-controls__filters">
          {/* Поиск */}
          <div className="services-controls__search">
            <span className="services-controls__search-icon">🔍</span>
            <input
              className="services-controls__search-input"
              placeholder="Поиск по названию или типу..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Фильтр по типу */}
          <select
            className="services-controls__filter-select"
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
          >
            <option value="all">Все типы ({services.length})</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {getServiceIcon(type)} {getServiceTypeLabel(type)} (
                {services.filter((s) => s.type === type).length})
              </option>
            ))}
          </select>

          {/* Сортировка */}
          <select
            className="services-controls__filter-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              onSortChange(
                field as 'name' | 'price' | 'type',
                order as 'asc' | 'desc'
              );
            }}
          >
            <option value="name-asc">По названию (А-Я)</option>
            <option value="name-desc">По названию (Я-А)</option>
            <option value="price-asc">По цене (возр.)</option>
            <option value="price-desc">По цене (убыв.)</option>
            <option value="type-asc">По типу (А-Я)</option>
          </select>
        </div>

        <Button variant="primary" onClick={onCreateService}>
          + Добавить услугу
        </Button>
      </div>

      {/* Быстрые фильтры */}
      <div className="services-quick-filters">
        <button
          className={`quick-filter-chip ${
            typeFilter === 'all' ? 'quick-filter-chip--active' : ''
          }`}
          onClick={() => onTypeFilterChange('all')}
        >
          <span>📋</span>
          <span>Все ({services.length})</span>
        </button>
        {availableTypes.map((type) => (
          <button
            key={type}
            className={`quick-filter-chip ${
              typeFilter === type ? 'quick-filter-chip--active' : ''
            }`}
            onClick={() => onTypeFilterChange(type)}
          >
            <span>{getServiceIcon(type)}</span>
            <span>
              {getServiceTypeLabel(type)} (
              {services.filter((s) => s.type === type).length})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
