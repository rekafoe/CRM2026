import React, { useState, useCallback, useMemo } from 'react';
import { Material } from '../../../types/shared';
import { useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../../../api/hooks/useMaterials';
import { useUIStore } from '../../../stores/uiStore';
import { MaterialFormModal } from '../MaterialFormModal';
import MaterialReservationModal from '../MaterialReservationModal';
import { MaterialsToolbar } from './MaterialsToolbar';
import { MaterialsList } from './MaterialsList';
import { MaterialsFilters } from './MaterialsFilters';

interface MaterialsManagementProps {
  materials: Material[];
  selectedMaterials: number[];
  onMaterialSelect: (id: number) => void;
  onSelectAll: () => void;
  onRefresh: () => void;
}

type ViewMode = 'grid' | 'cards';
type SortField = 'name' | 'category' | 'quantity' | 'price' | 'updated_at';
type SortOrder = 'asc' | 'desc';

interface Filters {
  categoryId: string;
  materialTypeId: string;
  materialKind: string;
  supplier: string;
  minQuantity: number;
  maxQuantity: number;
  minPrice: number;
  maxPrice: number;
  stockStatus: string;
}

export const MaterialsManagementRefactored: React.FC<MaterialsManagementProps> = ({
  materials,
  selectedMaterials,
  onMaterialSelect,
  onSelectAll,
  onRefresh,
}) => {
  // Состояние компонента
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedMaterialForReservation, setSelectedMaterialForReservation] = useState<Material | null>(null);

  // Фильтры
  const [filters, setFilters] = useState<Filters>({
    categoryId: '',
    materialTypeId: '',
    materialKind: '',
    supplier: '',
    minQuantity: 0,
    maxQuantity: 1000,
    minPrice: 0,
    maxPrice: 1000,
    stockStatus: '',
  });

  // Мутации
  const createMaterialMutation = useCreateMaterial();
  const updateMaterialMutation = useUpdateMaterial();
  const deleteMaterialMutation = useDeleteMaterial();
  const { showToast } = useUIStore();

  // Отладочная информация для материалов
  console.log('🔍 MaterialsManagement - materials:', materials);
  console.log('🔍 MaterialsManagement - materials sample:', materials.slice(0, 2));

  // Получение уникальных категорий и поставщиков
  const categories = useMemo(() => {
    const categoryMap = new Map<number, { id: number; name: string }>();
    materials.forEach((material) => {
      if (material.category_id && (material as any).category_name) {
        categoryMap.set(Number(material.category_id), {
          id: Number(material.category_id),
          name: String((material as any).category_name),
        });
      }
    });
    const cats = Array.from(categoryMap.values());
    console.log('🔍 MaterialsManagement - categories:', cats);
    return cats;
  }, [materials]);

  const materialTypes = useMemo(() => {
    const typeMap = new Map<number, { id: number; name: string; category_id?: number }>();
    materials.forEach((material) => {
      const typeId = (material as any).material_type_id;
      const typeName = (material as any).material_type_name;
      if (!typeId || !typeName) return;
      typeMap.set(Number(typeId), {
        id: Number(typeId),
        name: String(typeName),
        category_id: material.category_id == null ? undefined : Number(material.category_id),
      });
    });
    return Array.from(typeMap.values());
  }, [materials]);

  const filteredMaterialTypes = useMemo(() => {
    if (!filters.categoryId) return materialTypes;
    return materialTypes.filter((type) => String(type.category_id || '') === filters.categoryId);
  }, [filters.categoryId, materialTypes]);

  const suppliers = useMemo(() => {
    const supps = materials
      .map(m => (m as any).supplier_name)
      .filter((sup, index, arr) => sup && arr.indexOf(sup) === index);
    console.log('🔍 MaterialsManagement - suppliers:', supps);
    return supps as string[];
  }, [materials]);

  // Обработчики
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const handleAddMaterial = useCallback(() => {
    setShowAddModal(true);
  }, []);

  const handleEditMaterial = useCallback((material: Material) => {
    setEditingMaterial(material);
    setShowAddModal(true);
  }, []);

  const handleDeleteMaterial = useCallback(async (material: Material) => {
    if (window.confirm(`Удалить материал "${material.name}"?`)) {
      try {
        await deleteMaterialMutation.mutateAsync(material.id);
        showToast('Материал удален', 'success');
        onRefresh();
      } catch (error) {
        showToast('Ошибка при удалении материала', 'error');
      }
    }
  }, [deleteMaterialMutation, showToast, onRefresh]);

  const handleReserveMaterial = useCallback((material: Material) => {
    setSelectedMaterialForReservation(material);
    setShowReservationModal(true);
  }, []);

  const handleBulkAction = useCallback(async (action: 'delete' | 'export' | 'update') => {
    if (selectedMaterials.length === 0) {
      showToast('Выберите материалы для выполнения действия', 'warning');
      return;
    }

    switch (action) {
      case 'delete':
        showToast(`Удалено ${selectedMaterials.length} материалов`, 'success');
        break;
      case 'export':
        showToast(`Экспортировано ${selectedMaterials.length} материалов`, 'success');
        break;
      case 'update':
        showToast(`Обновлено ${selectedMaterials.length} материалов`, 'success');
        break;
    }
  }, [selectedMaterials.length, showToast]);

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    if (
      newFilters.categoryId &&
      newFilters.materialTypeId &&
      !materialTypes.some(
        (type) =>
          String(type.id) === String(newFilters.materialTypeId) &&
          String(type.category_id || '') === String(newFilters.categoryId),
      )
    ) {
      setFilters({ ...newFilters, materialTypeId: '' });
      return;
    }
    setFilters(newFilters);
  }, [materialTypes]);

  const handleModalClose = useCallback(() => {
    setShowAddModal(false);
    setEditingMaterial(null);
  }, []);

  const handleReservationModalClose = useCallback(() => {
    setShowReservationModal(false);
    setSelectedMaterialForReservation(null);
  }, []);

  return (
    <div className="materials-management materials-management-container">
      {/* Панель инструментов */}
      <MaterialsToolbar
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onAddMaterial={handleAddMaterial}
        onRefresh={onRefresh}
        onToggleFilters={() => setShowFilters(!showFilters)}
        showFilters={showFilters}
        selectedCount={selectedMaterials.length}
        onBulkAction={handleBulkAction}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Фильтры */}
      <MaterialsFilters
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        categories={categories}
        materialTypes={filteredMaterialTypes}
        suppliers={suppliers}
      />

      {/* Область контента */}
      <div className="materials-content">
        {/* Список материалов */}
        <MaterialsList
          materials={materials}
          selectedMaterials={selectedMaterials}
          onMaterialSelect={onMaterialSelect}
          onSelectAll={onSelectAll}
          onEdit={handleEditMaterial}
          onDelete={handleDeleteMaterial}
          onReserve={handleReserveMaterial}
          viewMode={viewMode}
          sortField={sortField}
          sortOrder={sortOrder}
          searchQuery={searchQuery}
          filters={filters}
        />
      </div>

      {/* Модальные окна */}
      <MaterialFormModal
        isOpen={showAddModal}
        onClose={handleModalClose}
        material={editingMaterial || undefined}
        onSave={async (materialData) => {
          try {
            if (editingMaterial) {
              await updateMaterialMutation.mutateAsync({
                id: editingMaterial.id,
                data: materialData
              });
            } else {
              await createMaterialMutation.mutateAsync(materialData);
            }
            onRefresh();
            handleModalClose();
            showToast(editingMaterial ? 'Материал обновлён' : 'Материал создан', 'success');
          } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || 'Ошибка сохранения материала';
            showToast(message, 'error');
          }
        }}
      />

      <MaterialReservationModal
        isOpen={showReservationModal}
        onClose={handleReservationModalClose}
        material={selectedMaterialForReservation || undefined}
        onReserve={onRefresh}
      />
    </div>
  );
};
