import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useMaterials } from '../../api/hooks/useMaterials';
import { Material } from '../../types/shared';
import { useUIStore } from '../../stores/uiStore';
import { useMaterialStore } from '../../stores/materialStore';
import { AppIcon, type IconName } from '../ui/AppIcon';
import { LoadingState } from '../common';
import '../../components/admin/ProductManagement.css';
import '../../styles/warehouse-embedded.css';

// Импорт стилей для материалов - должен быть после основных стилей
import './materials/MaterialsManagement.css';
import './materials/MaterialsManagementOverride.css';

// Компоненты складского сервиса
import { MaterialsManagement } from './MaterialsManagement';
import { InventoryControl } from './InventoryControl';
import { SuppliersManagement } from './SuppliersManagement';
import { CategoriesManagement } from './CategoriesManagement';
import { WarehouseReports } from './WarehouseReports';
import { WarehouseSettings } from './WarehouseSettings';
import { PaperTypesManagement } from './PaperTypesManagement';
type WarehouseTab = 'materials' | 'paper-types' | 'inventory' | 'suppliers' | 'categories' | 'reports' | 'settings';

interface WarehouseDashboardProps {
  onClose?: () => void;
}

export const WarehouseDashboard: React.FC<WarehouseDashboardProps> = () => {
  const [activeTab, setActiveTab] = useState<WarehouseTab>('materials');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([]);
  
  const { data: materials, isLoading, error, refetch } = useMaterials({});
  const { showToast } = useUIStore();
  const { materials: storeMaterials, setMaterials } = useMaterialStore();

  // Синхронизация с store
  useEffect(() => {
    if (materials) {
      setMaterials(materials);
    }
  }, [materials, setMaterials]);

  // Статистика склада
  const warehouseStats = useMemo(() => {
    if (!materials) return {
      totalMaterials: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
      totalValue: 0,
      categories: 0,
      suppliers: 0,
      alerts: 0
    };

    const totalMaterials = materials.length;
    const inStock = materials.filter(m => (m.quantity || 0) > 10).length;
    const lowStock = materials.filter(m => (m.quantity || 0) > 0 && (m.quantity || 0) <= 10).length;
    const outOfStock = materials.filter(m => (m.quantity || 0) <= 0).length;
    const totalValue = materials.reduce((sum, m) => {
      const price = m.sheet_price_single || m.price || 0;
      return sum + ((m.quantity || 0) * price);
    }, 0);

    return {
      totalMaterials,
      inStock,
      lowStock,
      outOfStock,
      totalValue,
      categories: 4, // Mock data
      suppliers: 3, // Mock data
      alerts: lowStock + outOfStock
    };
  }, [materials]);

  // Фильтрация материалов
  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    
    // Дедупликация по id - оставляем только первое вхождение каждого id
    const uniqueMaterials = materials.reduce((acc, material) => {
      if (!acc.find(m => m.id === material.id)) {
        acc.push(material);
      }
      return acc;
    }, [] as Material[]);
    
    let filtered = uniqueMaterials;
    
    if (searchQuery) {
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  }, [materials, searchQuery]);

  // Обработчики
  const handleTabChange = useCallback((tab: WarehouseTab) => {
    setActiveTab(tab);
    setSelectedMaterials([]);
  }, []);

  const handleMaterialSelect = useCallback((materialId: number) => {
    setSelectedMaterials(prev => 
      prev.includes(materialId) 
        ? prev.filter(id => id !== materialId)
        : [...prev, materialId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedMaterials.length === filteredMaterials.length) {
      setSelectedMaterials([]);
    } else {
      setSelectedMaterials(filteredMaterials.map(m => m.id));
    }
  }, [selectedMaterials.length, filteredMaterials]);

  const handleBulkAction = useCallback(async (action: 'delete' | 'export' | 'update') => {
    if (selectedMaterials.length === 0) {
      showToast('Выберите материалы для выполнения действия', 'warning');
      return;
    }

    switch (action) {
      case 'delete':
        // Логика удаления
        showToast(`Удалено ${selectedMaterials.length} материалов`, 'success');
        setSelectedMaterials([]);
        break;
      case 'export':
        showToast('Экспорт в разработке', 'info');
        break;
      case 'update':
        showToast('Массовое обновление в разработке', 'info');
        break;
    }
  }, [selectedMaterials, showToast]);

  const tabs: Array<{
    id: WarehouseTab;
    title: string;
    icon: IconName;
    count?: number;
  }> = useMemo(
    () => [
      { id: 'materials', title: 'Материалы', icon: 'package' as const, count: materials?.length },
      { id: 'paper-types', title: 'Типы бумаги', icon: 'document' as const },
      { id: 'inventory', title: 'Инвентарь', icon: 'clipboard' as const },
      { id: 'suppliers', title: 'Поставщики', icon: 'building' as const },
      { id: 'categories', title: 'Категории', icon: 'tag' as const },
      { id: 'reports', title: 'Отчёты', icon: 'chart-bar' as const },
      { id: 'settings', title: 'Настройки', icon: 'settings' as const },
    ],
    [materials?.length],
  );

  if (isLoading) {
    return (
      <div className="warehouse-dashboard warehouse-dashboard--embedded">
        <div className="warehouse-pm-loading pm-loading">
          <LoadingState message="Загружаем данные склада…" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="warehouse-dashboard warehouse-dashboard--embedded">
        <div className="warehouse-pm-error">
          <p>
            <strong>Не удалось загрузить данные.</strong> {error.message}
          </p>
          <button type="button" className="lg-btn" onClick={() => refetch()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="warehouse-dashboard warehouse-dashboard--embedded">
      <div className="product-controls">
        <div className="product-controls__main-row">
          <div className="compact-stats" aria-label="Краткая сводка по складу">
            <div className="compact-stat success" title="В наличии (запас больше 10)">
              <AppIcon name="check" size="xs" />
              <span className="compact-value">{warehouseStats.inStock}</span>
            </div>
            <div className="compact-stat warning" title="Низкий запас (1…10)">
              <AppIcon name="info" size="xs" />
              <span className="compact-value">{warehouseStats.lowStock}</span>
            </div>
            <div className="compact-stat danger" title="Нет в наличии">
              <AppIcon name="x" size="xs" />
              <span className="compact-value">{warehouseStats.outOfStock}</span>
            </div>
            <div className="compact-stat info" title="Оценка остатка по цене">
              <AppIcon name="wallet" size="xs" />
              <span className="compact-value">{warehouseStats.totalValue.toFixed(0)} BYN</span>
            </div>
          </div>
        </div>

        {selectedMaterials.length > 0 && (
          <div className="bulk-actions-bar warehouse-pm-bulk">
            <span className="bulk-count">Выбрано: {selectedMaterials.length}</span>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="lg-btn" onClick={() => handleBulkAction('delete')}>
                Удалить
              </button>
              <button type="button" className="lg-btn" onClick={() => handleBulkAction('export')}>
                Экспорт
              </button>
              <button type="button" className="lg-btn" onClick={() => handleBulkAction('update')}>
                Обновить
              </button>
            </div>
          </div>
        )}

        <div
          className="product-quick-filters"
          style={{ borderTop: selectedMaterials.length > 0 ? undefined : 'none', paddingTop: 12 }}
          role="tablist"
          aria-label="Разделы склада"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`product-filter-chip ${activeTab === tab.id ? 'product-filter-chip--active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <AppIcon name={tab.icon} size="xs" />
              <span>{tab.title}</span>
              {tab.count != null && tab.count > 0 && (
                <span className="product-filter-chip__count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="management-content tabs-content-embedded">
        {activeTab === 'materials' && (
          <MaterialsManagement
            materials={filteredMaterials}
            selectedMaterials={selectedMaterials}
            onMaterialSelect={handleMaterialSelect}
            onSelectAll={handleSelectAll}
            onRefresh={refetch}
          />
        )}
        {activeTab === 'paper-types' && <PaperTypesManagement onRefresh={refetch} />}
        {activeTab === 'inventory' && (
          <InventoryControl materials={filteredMaterials} onRefresh={refetch} />
        )}
        {activeTab === 'suppliers' && <SuppliersManagement onRefresh={refetch} />}
        {activeTab === 'categories' && <CategoriesManagement onRefresh={refetch} />}
        {activeTab === 'reports' && (
          <WarehouseReports materials={materials || []} stats={warehouseStats} />
        )}
        {activeTab === 'settings' && <WarehouseSettings onRefresh={refetch} />}
      </div>
    </div>
  );
};

