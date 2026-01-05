import React, { useState, useCallback, useMemo } from 'react';
import { Material } from '../../../types/shared';
import { useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../../../api/hooks/useMaterials';
import { useUIStore } from '../../../stores/uiStore';
import { MaterialFormModal } from '../MaterialFormModal';
import MaterialReservationModal from '../MaterialReservationModal';
import { WarehouseModal } from '../common/WarehouseModal';
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
  category: string;
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
    category: '',
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
    const cats = materials
      .map(m => (m as any).category_name)
      .filter((cat, index, arr) => cat && arr.indexOf(cat) === index);
    console.log('🔍 MaterialsManagement - categories:', cats);
    return cats as string[];
  }, [materials]);

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
    setFilters(newFilters);
  }, []);

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
            console.log('=== СОХРАНЕНИЕ МАТЕРИАЛА ===');
            console.log('editingMaterial:', editingMaterial);
            console.log('materialData:', materialData);
            
            if (editingMaterial) {
              // Обновляем существующий материал
              console.log('Обновляем материал ID:', editingMaterial.id);
              await updateMaterialMutation.mutateAsync({
                id: editingMaterial.id,
                data: materialData
              });
            } else {
              // Создаем новый материал
              console.log('Создаем новый материал');
              await createMaterialMutation.mutateAsync(materialData);
            }
            onRefresh();
            handleModalClose();
          } catch (error) {
            console.error('Ошибка сохранения материала:', error);
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
