import React, { useMemo } from 'react';
import { Material } from '../../../types/shared';
import { MaterialCard } from './MaterialCard';
import { MaterialRowCard } from './MaterialRowCard';

interface MaterialsListProps {
  materials: Material[];
  selectedMaterials: number[];
  onMaterialSelect: (id: number) => void;
  onSelectAll: () => void;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
  onReserve: (material: Material) => void;
  viewMode: 'grid' | 'cards';
  sortField: 'name' | 'category' | 'quantity' | 'price' | 'updated_at';
  sortOrder: 'asc' | 'desc';
  searchQuery: string;
  filters?: {
    category: string;
    supplier: string;
    minQuantity: number;
    maxQuantity: number;
    minPrice: number;
    maxPrice: number;
    stockStatus: string;
  };
}

export const MaterialsList: React.FC<MaterialsListProps> = ({
  materials,
  selectedMaterials,
  onMaterialSelect,
  onSelectAll,
  onEdit,
  onDelete,
  onReserve,
  viewMode,
  sortField,
  sortOrder,
  searchQuery,
  filters,
}) => {
  // Фильтрация и сортировка материалов
  const filteredAndSortedMaterials = useMemo(() => {
    // Дедупликация по id - оставляем только первое вхождение каждого id
    const uniqueMaterials = materials.reduce((acc, material) => {
      if (!acc.find(m => m.id === material.id)) {
        acc.push(material);
      }
      return acc;
    }, [] as Material[]);

    // Фильтруем только обычные материалы, исключая типы бумаги
    let filtered = uniqueMaterials.filter(material => 
      !material.paper_type_id || material.category_name !== 'Типы бумаги'
    );

    // Поиск
    if (searchQuery) {
      filtered = filtered.filter(material =>
        material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        material.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (material as any).category_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Применяем фильтры
    if (filters) {
      // Фильтр по категории
      if (filters.category) {
        filtered = filtered.filter(material =>
          (material as any).category_name === filters.category
        );
      }

      // Фильтр по поставщику
      if (filters.supplier) {
        filtered = filtered.filter(material =>
          (material as any).supplier_name === filters.supplier
        );
      }

      // Фильтр по количеству
      if (filters.minQuantity > 0) {
        filtered = filtered.filter(material =>
          material.quantity >= filters.minQuantity
        );
      }
      if (filters.maxQuantity < 1000) {
        filtered = filtered.filter(material =>
          material.quantity <= filters.maxQuantity
        );
      }

      // Фильтр по цене
      if (filters.minPrice > 0) {
        filtered = filtered.filter(material => {
          const price = material.sheet_price_single || material.price || 0;
          return price >= filters.minPrice;
        });
      }
      if (filters.maxPrice < 1000) {
        filtered = filtered.filter(material => {
          const price = material.sheet_price_single || material.price || 0;
          return price <= filters.maxPrice;
        });
      }

      // Фильтр по статусу запаса
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

    // Сортировка
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
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [materials, searchQuery, sortField, sortOrder, filters]);

  const isAllSelected = filteredAndSortedMaterials.length > 0 && 
    selectedMaterials.length === filteredAndSortedMaterials.length;

  // Компонент заголовков для строчного режима
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
        <span className="header-text">КОЛИЧЕСТВО</span>
      </div>
      <div className="row-column status-column">
        <span className="header-text">СТАТУС</span>
      </div>
      <div className="row-column price-column">
        <span className="header-text">ЦЕНА</span>
      </div>
      <div className="row-column actions-column">
        <span className="header-text">ДЕЙСТВИЯ</span>
      </div>
    </div>
  );


  // Строчный режим (cards)
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

  // Сеточный режим (grid)
  return (
    <div className="materials-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" style={{ alignItems: 'stretch' }}>
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
