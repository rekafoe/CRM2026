import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useMaterials, useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../../api/hooks/useMaterials';
import { Material, Category, Supplier, MaterialAlert, InventoryTransaction } from '../../types/shared';
import { useUIStore } from '../../stores/uiStore';
import { useMaterialStore } from '../../stores/materialStore';

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

export const WarehouseDashboard: React.FC<WarehouseDashboardProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<WarehouseTab>('materials');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
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

  // Вкладки складского сервиса
  const tabs = [
    {
      id: 'materials' as WarehouseTab,
      title: 'Материалы',
      icon: '📦',
      description: 'Управление материалами и остатками',
      color: '#4CAF50'
    },
    {
      id: 'paper-types' as WarehouseTab,
      title: 'Типы бумаги',
      icon: '📄',
      description: 'Управление типами бумаги и ценами',
      color: '#E91E63'
    },
    {
      id: 'inventory' as WarehouseTab,
      title: 'Инвентарь',
      icon: '📋',
      description: 'Учет и контроль инвентаря',
      color: '#2196F3'
    },
    {
      id: 'suppliers' as WarehouseTab,
      title: 'Поставщики',
      icon: '🏭',
      description: 'Управление поставщиками',
      color: '#FF9800'
    },
    {
      id: 'categories' as WarehouseTab,
      title: 'Категории',
      icon: '🏷️',
      description: 'Категории материалов',
      color: '#9C27B0'
    },
    {
      id: 'reports' as WarehouseTab,
      title: 'Отчеты',
      icon: '📊',
      description: 'Аналитика и отчетность',
      color: '#607D8B'
    },
    {
      id: 'settings' as WarehouseTab,
      title: 'Настройки',
      icon: '⚙️',
      description: 'Конфигурация склада',
      color: '#795548'
    }
  ];

  if (isLoading) {
    return (
      <div className="warehouse-dashboard-loading">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h3>Загрузка складского сервиса...</h3>
          <p>Получаем данные о материалах и настройках</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="warehouse-dashboard-error">
        <div className="error-content">
          <h3>❌ Ошибка загрузки</h3>
          <p>{error.message}</p>
          <button onClick={() => refetch()} className="retry-btn">
            🔄 Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="warehouse-dashboard">
      {onClose && (
        <button 
          className="close-btn"
          onClick={onClose}
          title="Закрыть складской сервис"
        >
          ✕
        </button>
      )}
      <div className="warehouse-content-wrapper">
        {/* Заголовок с компактной статистикой */}
        <div className="warehouse-header">
          <div className="header-content">
            <h1>🏪 Складской сервис</h1>
            <p>Комплексное управление складом и материалами</p>
          </div>
          
          {/* Компактные индикаторы статистики */}
          <div className="compact-stats">
            <div className="compact-stat success" title="Материалы в наличии">
              <span className="compact-icon">✅</span>
              <span className="compact-value">{warehouseStats.inStock}</span>
            </div>
            <div className="compact-stat warning" title="Низкий запас">
              <span className="compact-icon">⚠️</span>
              <span className="compact-value">{warehouseStats.lowStock}</span>
            </div>
            <div className="compact-stat danger" title="Нет в наличии">
              <span className="compact-icon">❌</span>
              <span className="compact-value">{warehouseStats.outOfStock}</span>
            </div>
            <div className="compact-stat info" title="Общая стоимость">
              <span className="compact-icon">💰</span>
              <span className="compact-value">{warehouseStats.totalValue.toFixed(0)} BYN</span>
            </div>
          </div>
          
          <div className="header-actions">
            <button 
              className="action-btn secondary"
              onClick={() => setShowFilters(!showFilters)}
            >
              🔧 Фильтры
            </button>
          </div>
        </div>

      {/* Панель управления */}
      <div className="warehouse-controls">

        <div className="bulk-actions-section">
          {selectedMaterials.length > 0 && (
            <div className="bulk-actions">
              <span className="selected-count">
                Выбрано: {selectedMaterials.length}
              </span>
              <button 
                className="bulk-btn delete"
                onClick={() => handleBulkAction('delete')}
              >
                🗑️ Удалить
              </button>
              <button 
                className="bulk-btn export"
                onClick={() => handleBulkAction('export')}
              >
                📊 Экспорт
              </button>
              <button 
                className="bulk-btn update"
                onClick={() => handleBulkAction('update')}
              >
                ✏️ Обновить
              </button>
            </div>
          )}
        </div>
      </div>

        {/* Вкладки */}
        <div className="warehouse-tabs">
          <div className="tabs-header">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
                style={{ '--tab-color': tab.color } as React.CSSProperties}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-title">{tab.title}</span>
                {tab.count > 0 && (
                  <span className="tab-count">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="tabs-content">
            {activeTab === 'materials' && (
              <MaterialsManagement
                materials={filteredMaterials}
                selectedMaterials={selectedMaterials}
                onMaterialSelect={handleMaterialSelect}
                onSelectAll={handleSelectAll}
                onRefresh={refetch}
              />
            )}
            {activeTab === 'paper-types' && (
              <PaperTypesManagement
                onRefresh={refetch}
              />
            )}
            {activeTab === 'inventory' && (
              <InventoryControl
                materials={filteredMaterials}
                onRefresh={refetch}
              />
            )}
            {activeTab === 'suppliers' && (
              <SuppliersManagement
                onRefresh={refetch}
              />
            )}
            {activeTab === 'categories' && (
              <CategoriesManagement
                onRefresh={refetch}
              />
            )}
            {activeTab === 'reports' && (
              <WarehouseReports
                materials={materials || []}
                stats={warehouseStats}
              />
            )}
            {activeTab === 'settings' && (
              <WarehouseSettings
                onRefresh={refetch}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
