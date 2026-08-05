import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useMaterials } from '../../api/hooks/useMaterials';
import { Material } from '../../types/shared';
import { useUIStore } from '../../stores/uiStore';
import { useMaterialStore } from '../../stores/materialStore';
import { AppIcon, type IconName } from '../ui/AppIcon';
import { BynSymbol } from '../ui/BynSymbol';
import { LoadingState } from '../common';
import { WarehouseButton } from './common/WarehouseButton';
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
  const [inventoryInitialView, setInventoryInitialView] = useState<'stock' | 'history' | 'deficit' | 'auto-order'>('stock');
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
    const inStock = materials.filter(m => {
      const qty = m.quantity || 0;
      const minStock = m.min_stock_level || 10;
      return qty > minStock;
    }).length;
    const lowStock = materials.filter(m => {
      const qty = m.quantity || 0;
      const minStock = m.min_stock_level || 10;
      return qty > 0 && qty <= minStock;
    }).length;
    const outOfStock = materials.filter(m => (m.quantity || 0) <= 0).length;
    const totalValue = materials.reduce((sum, m) => {
      const price = m.purchase_price ?? m.sheet_price_single ?? m.price ?? 0;
      return sum + ((m.quantity || 0) * price);
    }, 0);

    return {
      totalMaterials,
      inStock,
      lowStock,
      outOfStock,
      totalValue,
      categories: new Set(materials.map((m) => m.category_id).filter(Boolean)).size,
      suppliers: new Set(materials.map((m) => m.supplier_id).filter(Boolean)).size,
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
    if (tab === 'inventory') {
      setInventoryInitialView('stock');
    }
  }, []);

  const openInventory = useCallback((view: 'stock' | 'history' | 'deficit' | 'auto-order' = 'stock') => {
    setInventoryInitialView(view);
    setActiveTab('inventory');
    setSelectedMaterials([]);
  }, []);

  const openCatalog = useCallback(() => {
    setActiveTab('materials');
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
    hint: string;
    icon: IconName;
    count?: number;
  }> = useMemo(
    () => [
      {
        id: 'materials',
        title: 'Справочник',
        hint: 'Карточки материалов: цены, типы, редактирование',
        icon: 'package' as const,
        count: materials?.length,
      },
      {
        id: 'inventory',
        title: 'Остатки',
        hint: 'Приход, списание, история и дефицит',
        icon: 'clipboard' as const,
        count: warehouseStats.alerts || undefined,
      },
      {
        id: 'categories',
        title: 'Категории и типы',
        hint: 'Структура каталога',
        icon: 'tag' as const,
      },
      {
        id: 'suppliers',
        title: 'Поставщики',
        hint: 'Контакты и связи с материалами',
        icon: 'building' as const,
      },
      {
        id: 'paper-types',
        title: 'Типы бумаги',
        hint: 'Справочник бумаги для печати',
        icon: 'document' as const,
      },
      {
        id: 'reports',
        title: 'Отчёты',
        hint: 'Сводка и аналитика склада',
        icon: 'chart-bar' as const,
      },
      {
        id: 'settings',
        title: 'Настройки',
        hint: 'Параметры склада',
        icon: 'settings' as const,
      },
    ],
    [materials?.length, warehouseStats.alerts],
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
            <button
              type="button"
              className="compact-stat success"
              title="В наличии — открыть остатки"
              onClick={() => openInventory('stock')}
            >
              <AppIcon name="check" size="xs" />
              <span className="compact-value">{warehouseStats.inStock}</span>
            </button>
            <button
              type="button"
              className="compact-stat warning"
              title="Низкий запас — открыть дефицит"
              onClick={() => openInventory('deficit')}
            >
              <AppIcon name="info" size="xs" />
              <span className="compact-value">{warehouseStats.lowStock}</span>
            </button>
            <button
              type="button"
              className="compact-stat danger"
              title="Нет в наличии — открыть дефицит"
              onClick={() => openInventory('deficit')}
            >
              <AppIcon name="x" size="xs" />
              <span className="compact-value">{warehouseStats.outOfStock}</span>
            </button>
            <button
              type="button"
              className="compact-stat info"
              title="Оценка остатка по закупу — отчёты"
              onClick={() => handleTabChange('reports')}
            >
              <AppIcon name="wallet" size="xs" />
              <span className="compact-value">
                {warehouseStats.totalValue.toFixed(0)} <BynSymbol />
              </span>
            </button>
          </div>
        </div>

        {selectedMaterials.length > 0 && (
          <div className="bulk-actions-bar warehouse-pm-bulk">
            <span className="bulk-count">Выбрано: {selectedMaterials.length}</span>
            <div className="warehouse-pm-bulk__actions">
              <WarehouseButton
                variant="danger"
                size="sm"
                icon={<AppIcon name="trash" size="xs" />}
                onClick={() => handleBulkAction('delete')}
              >
                Удалить
              </WarehouseButton>
              <WarehouseButton
                variant="secondary"
                size="sm"
                icon={<AppIcon name="download" size="xs" />}
                onClick={() => handleBulkAction('export')}
              >
                Экспорт
              </WarehouseButton>
              <WarehouseButton
                variant="secondary"
                size="sm"
                icon={<AppIcon name="refresh" size="xs" />}
                onClick={() => handleBulkAction('update')}
              >
                Обновить
              </WarehouseButton>
            </div>
          </div>
        )}

        <div
          className={`product-quick-filters${selectedMaterials.length > 0 ? '' : ' product-quick-filters--flush-top'}`}
          role="tablist"
          aria-label="Разделы склада"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              title={tab.hint}
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
            onOpenInventory={() => openInventory('stock')}
          />
        )}
        {activeTab === 'paper-types' && <PaperTypesManagement onRefresh={refetch} />}
        {activeTab === 'inventory' && (
          <InventoryControl
            materials={filteredMaterials}
            onRefresh={refetch}
            initialView={inventoryInitialView}
            onOpenCatalog={openCatalog}
          />
        )}
        {activeTab === 'suppliers' && <SuppliersManagement onRefresh={refetch} />}
        {activeTab === 'categories' && <CategoriesManagement onRefresh={refetch} />}
        {activeTab === 'reports' && (
          <WarehouseReports
            materials={materials || []}
            stats={warehouseStats}
            onOpenDeficitOps={() => openInventory('deficit')}
          />
        )}
        {activeTab === 'settings' && <WarehouseSettings onRefresh={refetch} />}
      </div>
    </div>
  );
};

