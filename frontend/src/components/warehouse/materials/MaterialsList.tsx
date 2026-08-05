import React, { useMemo } from 'react';
import { Material } from '../../../types/shared';
import { EmptyState } from '../../common/EmptyState';
import { MaterialCard } from './MaterialCard';
import { MaterialRowCard } from './MaterialRowCard';

export interface MaterialsListFilters {
  categoryId: string;
  materialTypeId: string;
  materialKind: string;
  supplier: string;
  minQuantity: number;
  maxQuantity: number | null;
  minPrice: number;
  maxPrice: number | null;
  stockStatus: string;
}

interface MaterialsListProps {
  materials: Material[];
  selectedMaterials: number[];
  onMaterialSelect: (id: number) => void;
  onSelectAll: () => void;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
  onReserve: (material: Material) => void;
  onAdd?: () => void;
  onResetFilters?: () => void;
  viewMode: 'grid' | 'cards';
  sortField: 'name' | 'category' | 'quantity' | 'price' | 'updated_at';
  sortOrder: 'asc' | 'desc';
  searchQuery: string;
  filters?: MaterialsListFilters;
}

export const MaterialsList: React.FC<MaterialsListProps> = ({
  materials,
  selectedMaterials,
  onMaterialSelect,
  onSelectAll,
  onEdit,
  onDelete,
  onReserve,
  onAdd,
  onResetFilters,
  viewMode,
  sortField,
  sortOrder,
  searchQuery,
  filters,
}) => {
  const filteredAndSortedMaterials = useMemo(() => {
    const uniqueMaterials = materials.reduce((acc, material) => {
      if (!acc.find(m => m.id === material.id)) {
        acc.push(material);
      }
      return acc;
    }, [] as Material[]);

    let filtered = uniqueMaterials.filter(material =>
      !material.paper_type_id || (material as any).category_name !== 'Типы бумаги'
    );

    if (searchQuery) {
      filtered = filtered.filter(material =>
        material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        material.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (material as any).category_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filters) {
      if (filters.categoryId) {
        filtered = filtered.filter(material =>
          String(material.category_id || '') === String(filters.categoryId)
        );
      }

      if (filters.materialTypeId) {
        filtered = filtered.filter(material =>
          String((material as any).material_type_id || '') === String(filters.materialTypeId)
        );
      }

      if (filters.materialKind) {
        filtered = filtered.filter(material =>
          String((material as any).material_kind || '') === String(filters.materialKind)
        );
      }

      if (filters.supplier) {
        filtered = filtered.filter(material =>
          (material as any).supplier_name === filters.supplier
        );
      }

      if (filters.minQuantity > 0) {
        filtered = filtered.filter(material =>
          material.quantity >= filters.minQuantity
        );
      }
      if (filters.maxQuantity != null && Number.isFinite(filters.maxQuantity)) {
        filtered = filtered.filter(material =>
          material.quantity <= Number(filters.maxQuantity)
        );
      }

      if (filters.minPrice > 0) {
        filtered = filtered.filter(material => {
          const price = material.purchase_price;
          if (price == null || !Number.isFinite(Number(price))) return false;
          return Number(price) >= filters.minPrice;
        });
      }
      if (filters.maxPrice != null && Number.isFinite(filters.maxPrice)) {
        filtered = filtered.filter(material => {
          const price = material.purchase_price;
          if (price == null || !Number.isFinite(Number(price))) return false;
          return Number(price) <= Number(filters.maxPrice);
        });
      }

      if (filters.stockStatus) {
        filtered = filtered.filter(material => {
          const quantity = material.quantity || 0;
          const minStock = material.min_stock_level || 10;

          switch (filters.stockStatus) {
            case 'in_stock':
              return quantity > minStock;
            case 'low_stock':
              return quantity > 0 && quantity <= minStock;
            case 'out_of_stock':
              return quantity <= 0;
            default:
              return true;
          }
        });
      }
    }

    return filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'category') {
        aValue = (a as any).category_name || '';
        bValue = (b as any).category_name || '';
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  }, [materials, searchQuery, sortField, sortOrder, filters]);

  const isAllSelected = filteredAndSortedMaterials.length > 0 &&
    selectedMaterials.length === filteredAndSortedMaterials.length;

  const hasSourceMaterials = materials.some(material =>
    !material.paper_type_id || (material as any).category_name !== 'Типы бумаги'
  );

  const emptyState = (() => {
    if (filteredAndSortedMaterials.length > 0) return null;

    if (!hasSourceMaterials) {
      return (
        <EmptyState
          title="Нет материалов"
          description="Добавьте первый материал на склад"
          action={onAdd ? { label: 'Добавить материал', onClick: onAdd } : undefined}
        />
      );
    }

    return (
      <EmptyState
        title="Ничего не найдено"
        description="Сбросьте фильтры или измените поисковый запрос"
        action={onResetFilters ? { label: 'Сбросить фильтры', onClick: onResetFilters } : undefined}
      />
    );
  })();

  const RowHeader = () => (
    <div className="materials-row-header">
      <div className="row-column checkbox-column">
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={onSelectAll}
          className="select-all-checkbox"
        />
      </div>
      <div className="row-column name-column">
        <span className="header-text">НАЗВАНИЕ</span>
      </div>
      <div className="row-column category-column">
        <span className="header-text">КАТЕГОРИЯ</span>
      </div>
      <div className="row-column quantity-column">
        <span className="header-text">ОСТАТОК</span>
      </div>
      <div className="row-column status-column">
        <span className="header-text">СТАТУС</span>
      </div>
      <div className="row-column price-column">
        <span className="header-text">ЗАКУП</span>
      </div>
      <div className="row-column actions-column">
        <span className="header-text">ДЕЙСТВИЯ</span>
      </div>
    </div>
  );

  if (emptyState) {
    return <div className="materials-list">{emptyState}</div>;
  }

  if (viewMode === 'cards') {
    return (
      <div className="materials-list flex flex-col gap-3">
        <RowHeader />
        {filteredAndSortedMaterials.map(material => (
          <MaterialRowCard
            key={material.id}
            material={material}
            isSelected={selectedMaterials.includes(material.id)}
            onSelect={onMaterialSelect}
            onEdit={onEdit}
            onDelete={onDelete}
            onReserve={onReserve}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="materials-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 materials-list-grid">
      {filteredAndSortedMaterials.map(material => (
        <MaterialCard
          key={material.id}
          material={material}
          isSelected={selectedMaterials.includes(material.id)}
          onSelect={onMaterialSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onReserve={onReserve}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
};
