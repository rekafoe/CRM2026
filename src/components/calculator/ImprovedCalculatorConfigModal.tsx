import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { productConfigs as defaultProductConfigs, addProduct, ProductConfig, updateProductConfig, deleteProductConfig } from '../../config/calculatorConfig';
import { EditProductModal } from '../EditProductModal';
import { getPaperTypesFromWarehouse } from '../../services/calculatorMaterialService';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import { DataStates } from '../LoadingSpinner';
import '../../styles/calculator-config.css';
import '../../styles/improved-calculator-config.css';

interface ImprovedCalculatorConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdate: () => void;
}

type ConfigTab = 'products' | 'create' | 'presets';

export const ImprovedCalculatorConfigModal: React.FC<ImprovedCalculatorConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdate
}) => {
  const logger = useLogger('CalculatorConfigModal');
  const toast = useToastNotifications();
  
  const [activeTab, setActiveTab] = useState<ConfigTab>('products');
  const [newProduct, setNewProduct] = useState<Partial<ProductConfig>>({
    name: '',
    formats: [],
    paperDensities: [],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  });
  const [savedPresets, setSavedPresets] = useState<any[]>([]);
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null);
  const [editingProductConfig, setEditingProductConfig] = useState<ProductConfig | null>(null);
  const [productConfigs, setProductConfigs] = useState<Record<string, ProductConfig>>(defaultProductConfigs);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'products' | 'prices' | 'presets'>('all');
  const [warehousePaperTypes, setWarehousePaperTypes] = useState<any[]>([]);
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);
  const [loadingStates, setLoadingStates] = useState({
    products: false,
    presets: false,
    settings: false,
    paperTypes: false,
    saving: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Состояния для новых функций
  // Настройки калькулятора больше не сохраняются локально

  // Загрузка данных
  useEffect(() => {
    if (isOpen) {
      loadProductConfigs();
      loadPresets();
      loadPaperTypes();
    }
  }, [isOpen]);

  const loadProductConfigs = async () => {
    setLoadingStates(prev => ({ ...prev, products: true }));
    try {
      // Имитируем небольшую задержку для лучшего UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const saved = localStorage.getItem('calculator-product-configs');
      if (saved) {
        const parsedConfigs = JSON.parse(saved);
        setProductConfigs(parsedConfigs);
        logger.info('Конфигурация продуктов загружена', { count: Object.keys(parsedConfigs).length });
      } else {
        setProductConfigs(defaultProductConfigs);
        logger.info('Использована конфигурация по умолчанию');
      }
    } catch (error) {
      logger.error('Ошибка загрузки конфигурации продуктов', error);
      toast.error('Ошибка загрузки конфигурации продуктов');
      setProductConfigs(defaultProductConfigs);
    } finally {
      setLoadingStates(prev => ({ ...prev, products: false }));
    }
  };

  const loadPresets = () => {
    try {
      const saved = localStorage.getItem('printing-calculator-presets');
      if (saved) {
        setSavedPresets(JSON.parse(saved));
        logger.info('Пресеты загружены', { count: JSON.parse(saved).length });
      }
    } catch (error) {
      logger.error('Ошибка загрузки пресетов', error);
      toast.error('Ошибка загрузки пресетов');
    }
  };

  // Удалена загрузка настроек из localStorage

  const loadPaperTypes = async () => {
    setLoadingStates(prev => ({ ...prev, paperTypes: true }));
    setLoadingPaperTypes(true);
    try {
      const paperTypes = await getPaperTypesFromWarehouse();
      setWarehousePaperTypes(paperTypes);
      logger.info('Типы бумаги загружены из складского сервиса', { count: paperTypes.length });
    } catch (error) {
      logger.error('Ошибка загрузки типов бумаги', error);
      toast.error('Ошибка загрузки типов бумаги из складского сервиса');
    } finally {
      setLoadingPaperTypes(false);
      setLoadingStates(prev => ({ ...prev, paperTypes: false }));
    }
  };

  const validateProduct = (product: Partial<ProductConfig>): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    
    if (!product.name || product.name.trim().length === 0) {
      newErrors.name = 'Название продукта обязательно';
    } else if (product.name.length < 2) {
      newErrors.name = 'Название должно содержать минимум 2 символа';
    }
    
    if (!product.formats || product.formats.length === 0) {
      newErrors.formats = 'Выберите хотя бы один формат';
    }
    
    if (!product.paperDensities || product.paperDensities.length === 0) {
      newErrors.paperDensities = 'Выберите хотя бы одну плотность бумаги';
    }
    
    if (!product.sides || product.sides.length === 0) {
      newErrors.sides = 'Выберите количество сторон печати';
    }
    
    return newErrors;
  };

  // Удалено сохранение настроек в localStorage

  const deletePreset = (index: number) => {
    if (window.confirm('Вы уверены, что хотите удалить этот пресет?')) {
      const newPresets = savedPresets.filter((_, i) => i !== index);
      setSavedPresets(newPresets);
      localStorage.setItem('printing-calculator-presets', JSON.stringify(newPresets));
      logger.info('Пресет удален', { index });
      toast.success('Пресет удален');
    }
  };

  const duplicatePreset = (index: number) => {
    const presetToDuplicate = savedPresets[index];
    const originalName = presetToDuplicate.name || `${productConfigs[presetToDuplicate.productType]?.name || 'Продукт'} ${presetToDuplicate.format}`;
    
    const presetName = prompt(`Введите название для копии пресета "${originalName}":`, `${originalName} (копия)`);
    if (!presetName) return;

    const duplicatedPreset = { ...presetToDuplicate, name: presetName };
    const newPresets = [...savedPresets, duplicatedPreset];
    setSavedPresets(newPresets);
    localStorage.setItem('printing-calculator-presets', JSON.stringify(newPresets));
    
    logger.info('Пресет скопирован', { originalName, newName: presetName });
    toast.success('Пресет успешно скопирован!');
  };

  const startEditingProduct = (productKey: string) => {
    const product = productConfigs[productKey];
    setEditingProductKey(productKey);
    setEditingProductConfig(product);
    logger.debug('Начато редактирование продукта', { productKey });
  };

  const closeEditModal = () => {
    setEditingProductKey(null);
    setEditingProductConfig(null);
  };

  const handleProductUpdated = () => {
    loadProductConfigs();
    onConfigUpdate();
    closeEditModal();
    logger.info('Продукт обновлен');
    toast.success('Продукт обновлен');
  };

  const deleteProduct = (productKey: string) => {
    if (window.confirm(`Вы уверены, что хотите удалить продукт "${productConfigs[productKey].name}"?`)) {
      deleteProductConfig(productKey);
      loadProductConfigs();
      onConfigUpdate();
      logger.info('Продукт удален', { productKey });
      toast.success('Продукт успешно удален!');
    }
  };

  const handleAddProduct = () => {
    const validationErrors = validateProduct(newProduct);
    
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast.error('Пожалуйста, исправьте ошибки в форме');
      return;
    }
    
    // Проверяем, не существует ли уже продукт с таким именем
    const productKey = newProduct.name!.toLowerCase().replace(/\s+/g, '_');
    if (productConfigs[productKey]) {
      setErrors({ name: 'Продукт с таким названием уже существует' });
      toast.error('Продукт с таким названием уже существует');
      return;
    }
    
    setLoadingStates(prev => ({ ...prev, saving: true }));
    
    try {
      addProduct(productKey, newProduct as ProductConfig);
      setNewProduct({
        name: '',
        formats: [],
        paperDensities: [],
        laminations: ['none', 'matte', 'glossy'],
        sides: [1, 2]
      });
      setErrors({});
      loadProductConfigs();
      onConfigUpdate();
      logger.info('Новый продукт добавлен', { productKey, name: newProduct.name });
      toast.success('Новый продукт добавлен!');
    } catch (error) {
      logger.error('Ошибка добавления продукта', error);
      toast.error('Ошибка при добавлении продукта');
    } finally {
      setLoadingStates(prev => ({ ...prev, saving: false }));
    }
  };

  // Управление ценами перенесено в склад/бэкенд

  const handleFormatChange = useCallback((format: string, checked: boolean) => {
    if (checked) {
      setNewProduct(prev => ({
        ...prev,
        formats: [...(prev.formats || []), format]
      }));
    } else {
      setNewProduct(prev => ({
        ...prev,
        formats: prev.formats?.filter(f => f !== format) || []
      }));
    }
  }, []);

  const handleDensityChange = useCallback((density: number, checked: boolean) => {
    if (checked) {
      setNewProduct(prev => ({
        ...prev,
        paperDensities: [...(prev.paperDensities || []), density]
      }));
    } else {
      setNewProduct(prev => ({
        ...prev,
        paperDensities: prev.paperDensities?.filter(d => d !== density) || []
      }));
    }
  }, []);

  const handleSideChange = useCallback((side: number, checked: boolean) => {
    if (checked) {
      setNewProduct(prev => ({
        ...prev,
        sides: [...(prev.sides || []), side]
      }));
    } else {
      setNewProduct(prev => ({
        ...prev,
        sides: prev.sides?.filter(s => s !== side) || []
      }));
    }
  }, []);

  // Функции для экспорта/импорта
  const exportSettings = () => {
    try {
      const exportData = {
        productConfigs,
        presets: savedPresets,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `calculator-settings-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      logger.info('Настройки экспортированы');
      toast.success('Настройки экспортированы');
    } catch (error) {
      logger.error('Ошибка экспорта настроек', error);
      toast.error('Ошибка экспорта настроек');
    }
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        
        if (importData.productConfigs) {
          setProductConfigs(importData.productConfigs);
          localStorage.setItem('calculator-product-configs', JSON.stringify(importData.productConfigs));
        }
        
        if (importData.presets) {
          setSavedPresets(importData.presets);
          localStorage.setItem('printing-calculator-presets', JSON.stringify(importData.presets));
        }
        
        // Поле settings более не используется
        
        onConfigUpdate();
        logger.info('Настройки импортированы', { version: importData.version });
        toast.success('Настройки успешно импортированы!');
      } catch (error) {
        logger.error('Ошибка импорта настроек', error);
        toast.error('Ошибка импорта настроек');
      }
    };
    reader.readAsText(file);
  };

  // Мемоизированная фильтрация данных
  const filteredProducts = useMemo(() => {
    return Object.entries(productConfigs).filter(([key, config]) =>
      searchQuery === '' || 
      config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [productConfigs, searchQuery]);

  const filteredPresets = useMemo(() => {
    return savedPresets.filter(preset =>
      searchQuery === '' ||
      (preset.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.productType.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [savedPresets, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="config-modal-overlay">
      <div className="config-modal improved-config-modal">
        <div className="config-header">
          <h2>⚙️ Настройка калькулятора</h2>
          <div className="header-actions">
            <button 
              className="btn btn-sm btn-outline"
              onClick={exportSettings}
              title="Экспорт настроек"
            >
              📤 Экспорт
            </button>
            <label className="btn btn-sm btn-outline" title="Импорт настроек">
              📥 Импорт
              <input
                type="file"
                accept=".json"
                onChange={importSettings}
                style={{ display: 'none' }}
              />
            </label>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="config-tabs">
          {[ 
            { key: 'products', label: '📦 Продукты', icon: '📦' },
            { key: 'create', label: '➕ Создать', icon: '➕' },
            { key: 'presets', label: '⭐ Пресеты', icon: '⭐' }
          ].map(tab => (
            <button 
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key as ConfigTab)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="config-content">
          {/* Поиск и фильтры */}
          <div className="search-section">
            <div className="search-input">
              <input
                type="text"
                placeholder="🔍 Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="filter-buttons">
              {[
                { key: 'all', label: 'Все' },
                { key: 'products', label: 'Продукты' },
                { key: 'prices', label: 'Цены' },
                { key: 'presets', label: 'Пресеты' }
              ].map(filter => (
                <button
                  key={filter.key}
                  className={`filter-btn ${filterType === filter.key ? 'active' : ''}`}
                  onClick={() => setFilterType(filter.key as any)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Вкладка продуктов */}
          {activeTab === 'products' && (
            <div className="products-tab">
              <div className="tab-header">
                <h3>📦 Управление продуктами</h3>
                <div className="stats">
                  <span className="stat">Всего: {Object.keys(productConfigs).length}</span>
                  <span className="stat">Показано: {filteredProducts.length}</span>
                  {loadingStates.products && <span className="loading-indicator">⏳ Загрузка...</span>}
                </div>
              </div>
              
              {loadingStates.products ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Загрузка конфигурации продуктов...</p>
                </div>
              ) : (
                <div className="products-grid">
                {filteredProducts.map(([key, config]) => (
                  <div key={key} className="product-card">
                    <div className="product-header">
                      <h4>{config.name}</h4>
                      <div className="product-badges">
                        {config.magnetic && <span className="badge">🧲 Магнитные</span>}
                        {config.cutting && <span className="badge">✂️ Резка</span>}
                        {config.folding && <span className="badge">📄 Фальцовка</span>}
                      </div>
                    </div>
                    
                    <div className="product-details">
                      <div className="detail-item">
                        <strong>Форматы:</strong> {config.formats.join(', ')}
                      </div>
                      <div className="detail-item">
                        <strong>Плотности:</strong> {config.paperDensities.join(', ')}г/м²
                      </div>
                      <div className="detail-item">
                        <strong>Стороны:</strong> {config.sides.join(', ')}
                      </div>
                      {config.laminations && (
                        <div className="detail-item">
                          <strong>Ламинация:</strong> {config.laminations.join(', ')}
                        </div>
                      )}
                    </div>
                    
                    <div className="product-actions">
                      <button 
                        className="btn btn-sm btn-primary"
                        onClick={() => startEditingProduct(key)}
                        title="Редактировать"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn btn-sm btn-danger"
                        onClick={() => deleteProduct(key)}
                        title="Удалить"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          )}

          {/* Вкладка создания продукта */}
          {activeTab === 'create' && (
            <div className="create-product-tab">
              <h3>➕ Создать новый продукт</h3>
              <div className="new-product-form">
                <div className="form-group">
                  <label>Название продукта:</label>
                  <input
                    type="text"
                    value={newProduct.name || ''}
                    onChange={(e) => {
                      setNewProduct(prev => ({ ...prev, name: e.target.value }));
                      // Очищаем ошибку при изменении
                      if (errors.name) {
                        setErrors(prev => ({ ...prev, name: '' }));
                      }
                    }}
                    placeholder="Например: Наклейки"
                    className={errors.name ? 'error' : ''}
                  />
                  {errors.name && <div className="error-message">{errors.name}</div>}
                </div>

                <div className="form-group">
                  <label>Форматы:</label>
                  <div className="checkbox-group">
                    {['A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'стандартные', 'произвольный'].map(format => (
                      <label key={format} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newProduct.formats?.includes(format) || false}
                          onChange={(e) => {
                            handleFormatChange(format, e.target.checked);
                            // Очищаем ошибку при изменении
                            if (errors.formats) {
                              setErrors(prev => ({ ...prev, formats: '' }));
                            }
                          }}
                        />
                        {format}
                      </label>
                    ))}
                  </div>
                  {errors.formats && <div className="error-message">{errors.formats}</div>}
                </div>

                <div className="form-group">
                  <label>Плотности бумаги (г/м²):</label>
                  <div className="checkbox-group">
                    {[80, 90, 100, 120, 130, 150, 160, 170, 200, 250, 300, 350].map(density => (
                      <label key={density} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newProduct.paperDensities?.includes(density) || false}
                          onChange={(e) => handleDensityChange(density, e.target.checked)}
                        />
                        {density}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Стороны печати:</label>
                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newProduct.sides?.includes(1) || false}
                        onChange={(e) => handleSideChange(1, e.target.checked)}
                      />
                      Односторонние
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newProduct.sides?.includes(2) || false}
                        onChange={(e) => handleSideChange(2, e.target.checked)}
                      />
                      Двусторонние
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Дополнительные опции:</label>
                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newProduct.magnetic || false}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, magnetic: e.target.checked }))}
                      />
                      Магнитные
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newProduct.cutting || false}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, cutting: e.target.checked }))}
                      />
                      Резка
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newProduct.folding || false}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, folding: e.target.checked }))}
                      />
                      Сгибка
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newProduct.roundCorners || false}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, roundCorners: e.target.checked }))}
                      />
                      Скругление углов
                    </label>
                  </div>
                </div>

                <button 
                  className="btn btn-primary" 
                  onClick={handleAddProduct}
                  disabled={loadingStates.saving}
                >
                  {loadingStates.saving ? (
                    <>
                      <div className="loading-spinner-small"></div>
                      Сохранение...
                    </>
                  ) : (
                    'Добавить продукт'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Вкладка цен удалена (цены из склада/бэкенда) */}

          {/* Вкладка пресетов */}
          {activeTab === 'presets' && (
            <div className="presets-tab">
              <h3>⭐ Управление пресетами</h3>
              
              {filteredPresets.length === 0 ? (
                <div className="no-presets">
                  <div className="no-presets-icon">⭐</div>
                  <h5>Сохраненных пресетов пока нет</h5>
                  <p>Создайте пресеты в калькуляторе, чтобы управлять ими здесь</p>
                </div>
              ) : (
                <div className="presets-list">
                  {filteredPresets.map((preset, index) => (
                    <div key={index} className="preset-item">
                      <div className="preset-info">
                        <h4>{preset.name || `${productConfigs[preset.productType]?.name || 'Продукт'} ${preset.format}`}</h4>
                        <p className="preset-details">
                          {preset.quantity?.toLocaleString()} шт. • {preset.paperType} {preset.paperDensity}г/м² • {preset.priceType}
                        </p>
                        <p className="preset-extra">
                          {preset.sides === 2 ? 'Двусторонние' : 'Односторонние'} • 
                          {preset.lamination !== 'none' ? ` ${preset.lamination} ламинация` : ' без ламинации'}
                          {preset.magnetic && ' • Магнитные'}
                          {preset.cutting && ' • Резка'}
                          {preset.folding && ' • Фальцовка'}
                        </p>
                      </div>
                      <div className="preset-actions">
                        <button 
                          className="btn btn-sm btn-info"
                          onClick={() => duplicatePreset(index)}
                          title="Создать копию пресета"
                        >
                          📋
                        </button>
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => deletePreset(index)}
                          title="Удалить пресет"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Вкладки settings/backup удалены */}
        </div>

        <div className="config-footer">
          <div className="footer-info">
            <span>Версия: 1.0</span>
            <span>Последнее обновление: {new Date().toLocaleDateString()}</span>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>

      {editingProductKey && editingProductConfig && (
        <EditProductModal
          isOpen={!!editingProductKey}
          onClose={closeEditModal}
          productKey={editingProductKey}
          productConfig={editingProductConfig}
          onProductUpdated={handleProductUpdated}
        />
      )}
    </div>
  );
};
