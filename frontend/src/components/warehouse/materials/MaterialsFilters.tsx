import React from 'react';
import { AppIcon, BynSymbol } from '../../ui';
import { WarehouseFormField } from '../common/WarehouseForm';
import type { MaterialsListFilters } from './MaterialsList';

interface MaterialsFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  filters: MaterialsListFilters;
  onFiltersChange: (filters: MaterialsListFilters) => void;
  categories: Array<{ id: number; name: string }>;
  materialTypes: Array<{ id: number; name: string }>;
  suppliers: string[];
}

export const DEFAULT_MATERIALS_FILTERS: MaterialsListFilters = {
  categoryId: '',
  materialTypeId: '',
  materialKind: '',
  supplier: '',
  minQuantity: 0,
  maxQuantity: null,
  minPrice: 0,
  maxPrice: null,
  stockStatus: '',
};

export const MaterialsFilters: React.FC<MaterialsFiltersProps> = ({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  categories,
  materialTypes,
  suppliers,
}) => {
  if (!isOpen) return null;

  const handleFilterChange = <K extends keyof MaterialsListFilters>(
    field: K,
    value: MaterialsListFilters[K],
  ) => {
    onFiltersChange({
      ...filters,
      [field]: value,
    });
  };

  const resetFilters = () => {
    onFiltersChange({ ...DEFAULT_MATERIALS_FILTERS });
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
        <WarehouseFormField
          label="Категория"
          id="category-filter"
          as="select"
          value={filters.categoryId}
          onChange={(value) => handleFilterChange('categoryId', String(value ?? ''))}
          options={[
            { value: '', label: 'Все категории' },
            ...categories.map(cat => ({ value: String(cat.id), label: cat.name }))
          ]}
        />

        <WarehouseFormField
          label="Тип материала"
          id="material-type-filter"
          as="select"
          value={filters.materialTypeId}
          onChange={(value) => handleFilterChange('materialTypeId', String(value ?? ''))}
          options={[
            { value: '', label: 'Все типы' },
            ...materialTypes.map(type => ({ value: String(type.id), label: type.name }))
          ]}
        />

        <WarehouseFormField
          label="Класс"
          id="material-kind-filter"
          as="select"
          value={filters.materialKind}
          onChange={(value) => handleFilterChange('materialKind', String(value ?? ''))}
          options={[
            { value: '', label: 'Все классы' },
            { value: 'sheet', label: 'Листовой' },
            { value: 'roll', label: 'Рулонный' },
            { value: 'consumable', label: 'Расходка' },
            { value: 'area', label: 'Площадной' },
          ]}
        />

        <WarehouseFormField
          label="Поставщик"
          id="supplier-filter"
          as="select"
          value={filters.supplier}
          onChange={(value) => handleFilterChange('supplier', String(value ?? ''))}
          options={[
            { value: '', label: 'Все поставщики' },
            ...suppliers.map(sup => ({ value: sup, label: sup }))
          ]}
        />

        <WarehouseFormField
          label="Статус запаса"
          id="stock-status-filter"
          as="select"
          value={filters.stockStatus}
          onChange={(value) => handleFilterChange('stockStatus', String(value ?? ''))}
          options={[
            { value: '', label: 'Все статусы' },
            { value: 'in_stock', label: 'В наличии' },
            { value: 'low_stock', label: 'Низкий запас' },
            { value: 'out_of_stock', label: 'Нет в наличии' }
          ]}
        />

        <WarehouseFormField
          label="Мин. количество"
          id="min-quantity-filter"
          type="number"
          value={filters.minQuantity}
          onChange={(value) => handleFilterChange('minQuantity', value == null ? 0 : Number(value))}
          min={0}
        />

        <WarehouseFormField
          label="Макс. количество"
          id="max-quantity-filter"
          type="number"
          value={filters.maxQuantity}
          onChange={(value) => handleFilterChange('maxQuantity', value == null ? null : Number(value))}
          min={0}
          placeholder="Без лимита"
          helpText="Пусто — без верхнего лимита"
        />

        <WarehouseFormField
          label={<>Мин. закупочная цена (<BynSymbol />)</>}
          id="min-price-filter"
          type="number"
          value={filters.minPrice}
          onChange={(value) => handleFilterChange('minPrice', value == null ? 0 : Number(value))}
          min={0}
          step={0.01}
        />

        <WarehouseFormField
          label={<>Макс. закупочная цена (<BynSymbol />)</>}
          id="max-price-filter"
          type="number"
          value={filters.maxPrice}
          onChange={(value) => handleFilterChange('maxPrice', value == null ? null : Number(value))}
          min={0}
          step={0.01}
          placeholder="Без лимита"
          helpText="Пусто — без верхнего лимита"
        />
      </div>
    </div>
  );
};
