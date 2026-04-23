import React from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { WarehouseFormField } from '../common/WarehouseForm';

interface MaterialsFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  filters: {
    category: string;
    supplier: string;
    minQuantity: number;
    maxQuantity: number;
    minPrice: number;
    maxPrice: number;
    stockStatus: string;
  };
  onFiltersChange: (filters: any) => void;
  categories: string[];
  suppliers: string[];
}

export const MaterialsFilters: React.FC<MaterialsFiltersProps> = ({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  categories,
  suppliers,
}) => {
  if (!isOpen) return null;

  // Отладочная информация
  console.log('🔍 MaterialsFilters - categories:', categories);
  console.log('🔍 MaterialsFilters - suppliers:', suppliers);

  const handleFilterChange = (field: string, value: any) => {
    onFiltersChange({
      ...filters,
      [field]: value,
    });
  };

  const resetFilters = () => {
    onFiltersChange({
      category: '',
      supplier: '',
      minQuantity: 0,
      maxQuantity: 1000,
      minPrice: 0,
      maxPrice: 1000,
      stockStatus: '',
    });
  };

  return (
    <div className="materials-filters bg-secondary border border-primary rounded-lg p-4 mb-4">
      <div className="filters-header flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-primary">Фильтры</h3>
        <div className="flex gap-2">
          <button
            onClick={resetFilters}
            className="px-3 py-1 text-sm bg-tertiary text-text-primary rounded hover:bg-border-color"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1 rounded px-3 py-1 text-sm bg-tertiary text-text-primary hover:bg-border-color"
            aria-label="Закрыть фильтры"
          >
            <AppIcon name="x" size="sm" />
          </button>
        </div>
      </div>

      <div className="filters-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Категория */}
        <WarehouseFormField
          label="Категория"
          id="category-filter"
          as="select"
          value={filters.category}
          onChange={(value) => handleFilterChange('category', value)}
          options={[
            { value: '', label: 'Все категории' },
            ...categories.map(cat => ({ value: cat, label: cat }))
          ]}
        />

        {/* Поставщик */}
        <WarehouseFormField
          label="Поставщик"
          id="supplier-filter"
          as="select"
          value={filters.supplier}
          onChange={(value) => handleFilterChange('supplier', value)}
          options={[
            { value: '', label: 'Все поставщики' },
            ...suppliers.map(sup => ({ value: sup, label: sup }))
          ]}
        />

        {/* Статус запаса */}
        <WarehouseFormField
          label="Статус запаса"
          id="stock-status-filter"
          as="select"
          value={filters.stockStatus}
          onChange={(value) => handleFilterChange('stockStatus', value)}
          options={[
            { value: '', label: 'Все статусы' },
            { value: 'in_stock', label: 'В наличии' },
            { value: 'low_stock', label: 'Низкий запас' },
            { value: 'out_of_stock', label: 'Нет в наличии' }
          ]}
        />

        {/* Минимальное количество */}
        <WarehouseFormField
          label="Мин. количество"
          id="min-quantity-filter"
          type="number"
          value={filters.minQuantity}
          onChange={(value) => handleFilterChange('minQuantity', value)}
          min={0}
        />

        {/* Максимальное количество */}
        <WarehouseFormField
          label="Макс. количество"
          id="max-quantity-filter"
          type="number"
          value={filters.maxQuantity}
          onChange={(value) => handleFilterChange('maxQuantity', value)}
          min={0}
        />

        {/* Минимальная цена */}
        <WarehouseFormField
          label="Мин. цена (BYN)"
          id="min-price-filter"
          type="number"
          value={filters.minPrice}
          onChange={(value) => handleFilterChange('minPrice', value)}
          min={0}
          step={0.01}
        />

        {/* Максимальная цена */}
        <WarehouseFormField
          label="Макс. цена (BYN)"
          id="max-price-filter"
          type="number"
          value={filters.maxPrice}
          onChange={(value) => handleFilterChange('maxPrice', value)}
          min={0}
          step={0.01}
        />
      </div>
    </div>
  );
};
