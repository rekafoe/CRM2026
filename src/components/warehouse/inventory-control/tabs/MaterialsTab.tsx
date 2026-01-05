import React from 'react';
import { Material } from '../../../../types/shared';
import { MaterialsFilters } from '../components/MaterialsFilters';
import { MaterialsTable } from '../components/MaterialsTable';

interface MaterialsTabProps {
  materials: Material[];
  search: string;
  categoryFilter: string;
  statusFilter: string;
  categories: string[];
  onSearchChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onMaterialAction: (material: Material, action: 'in' | 'out' | 'adjustment' | 'history') => void;
  onViewTransactions: (materialId: number) => void;
}

export const MaterialsTab: React.FC<MaterialsTabProps> = React.memo(({
  materials,
  search,
  categoryFilter,
  statusFilter,
  categories,
  onSearchChange,
  onCategoryFilterChange,
  onStatusFilterChange,
  onMaterialAction,
  onViewTransactions,
}) => {
  return (
    <div className="materials-view">
      <MaterialsFilters
        search={search}
        categoryFilter={categoryFilter}
        statusFilter={statusFilter}
        categories={categories}
        onSearchChange={onSearchChange}
        onCategoryFilterChange={onCategoryFilterChange}
        onStatusFilterChange={onStatusFilterChange}
      />
      <MaterialsTable
        materials={materials}
        onMaterialAction={onMaterialAction}
        onViewTransactions={onViewTransactions}
      />
    </div>
  );
});

