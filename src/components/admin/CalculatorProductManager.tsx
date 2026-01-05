import React, { useEffect, useCallback } from 'react';
import { 
  getEnhancedProductTypes,
  getEnhancedProductSchema,
  upsertEnhancedProduct,
  upsertEnhancedProductSchema,
  deleteEnhancedProduct,
  calcUniversalPrice
} from '../../api';
import { Alert } from '../common';
import './CalculatorProductManager.css';
import {
  useCalculatorProductManagerState,
  ProductType,
  ProductSchema,
  Service,
  CalculationTest,
} from '../hooks/useCalculatorProductManagerState';
import { ProductsTab, TestTab, AnalyticsTab, AddProductTypeModal } from './calculator-product';

const CalculatorProductManager: React.FC = () => {
  const {
    state,
    setLoading,
    setError,
    setSuccessMessage,
    setActiveTab,
    setProductTypes,
    setSelectedType,
    setSchema,
    setServices,
    setShowAddModal,
    updateNewProductType,
    resetNewProductType,
    setSaving,
    setTestCalculation,
    setCalcResult,
    setCalcLoading,
  } = useCalculatorProductManagerState();

  const {
    loading,
    error,
    successMessage,
    activeTab,
    productTypes,
    selectedType,
    schema,
    services,
    showAddModal,
    newProductType,
    saving,
    testCalculation,
    calcResult,
    calcLoading,
  } = state;

  useEffect(() => {
    void loadProductTypes();
    void loadServices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedType) {
      void loadSchema(selectedType);
    }
  }, [selectedType]);

  const loadProductTypes = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getEnhancedProductTypes();
      const data = response.data || response;
      setProductTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Ошибка загрузки типов продуктов');
      console.error('Error loading product types:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const response = await fetch('/api/pricing/services');
      const data = await response.json();
      const servicesArray = data.data || data;
      setServices(Array.isArray(servicesArray) ? servicesArray : []);
    } catch (err) {
      console.error('Error loading services:', err);
    }
  };

  const loadSchema = async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getEnhancedProductSchema(key);
      const data = response.data || response;
      setSchema(data);
    } catch (err) {
      setError('Ошибка загрузки схемы продукта');
      console.error('Error loading schema:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProductType = async () => {
    if (!newProductType.key || !newProductType.name) {
      setError('Заполните все обязательные поля');
      return;
    }

    if (!/^[a-z_]+$/.test(newProductType.key)) {
      setError('Ключ должен содержать только строчные буквы и подчеркивания (например: flyers, business_cards)');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      console.log('Creating product type:', newProductType);
      const response = await upsertEnhancedProduct(newProductType);
      console.log('Product type created:', response);
      
      setShowAddModal(false);
      resetNewProductType();
      setSuccessMessage(`Тип продукта "${newProductType.name}" успешно создан`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Перезагружаем список типов
      await loadProductTypes();
    } catch (err: any) {
      console.error('Error creating product type:', err);
      setError(err?.response?.data?.message || 'Ошибка создания типа продукта');
    } finally {
      setSaving(false);
    }
  }, [newProductType, setSaving, setError, setSuccessMessage, setShowAddModal, resetNewProductType, loadProductTypes]);

  const handleDeleteProductType = useCallback(async (key: string) => {
    const productName = productTypes.find(p => p.key === key)?.name || key;
    if (!confirm(`Вы уверены, что хотите удалить тип продукта "${productName}"?\n\nВсе операции для этого типа будут деактивированы.`)) {
      return;
    }

    try {
      await deleteEnhancedProduct(key);
      setSuccessMessage(`Тип продукта "${productName}" успешно удален`);
      setTimeout(() => setSuccessMessage(null), 3000);
      loadProductTypes();
      if (selectedType === key) {
        setSelectedType(null);
        setSchema(null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Ошибка удаления типа продукта');
    }
  }, [productTypes, selectedType, setSelectedType, setSchema, setSuccessMessage, setError, loadProductTypes]);

  const handleUpdateSchema = async () => {
    if (!selectedType || !schema) return;

    // Валидация операций
    const invalidOperations = schema.operations.filter(op => !op.operation || !op.service || !op.formula);
    if (invalidOperations.length > 0) {
      setError('Все операции должны иметь название, услугу и формулу');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertEnhancedProductSchema(selectedType, {
        operations: schema.operations.map(op => ({
          operation: op.operation,
          service_id: op.service_id,
          service: op.service,
          formula: op.formula
        }))
      });
      setSuccessMessage('Схема успешно сохранена');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Ошибка обновления схемы');
    } finally {
      setSaving(false);
    }
  };

  const updateOperation = useCallback((index: number, field: string, value: any) => {
    if (!schema) return;
    
    const updatedOperations = [...schema.operations];
    updatedOperations[index] = { ...updatedOperations[index], [field]: value };
    
    // Если изменилось название услуги, ищем service_id и обновляем связанные поля
    if (field === 'service' && value) {
      const service = services.find(s => s.name === value);
      if (service) {
        updatedOperations[index].service_id = service.id;
        updatedOperations[index].unit = service.unit;
        updatedOperations[index].rate = service.rate;
      }
    }
    
    setSchema({
      ...schema,
      operations: updatedOperations
    });
  }, [schema, services, setSchema]);

  const removeOperation = useCallback((index: number) => {
    if (!schema) return;
    
    if (!confirm('Вы уверены, что хотите удалить эту операцию?')) {
      return;
    }
    
    setSchema({
      ...schema,
      operations: schema.operations.filter((_, i) => i !== index)
    });
  }, [schema, setSchema]);

  const runTestCalculation = useCallback(async () => {
    setCalcLoading(true);
    setError(null);
    
    try {
      const result = await calcUniversalPrice({
        productType: testCalculation.productType,
        specifications: testCalculation.specifications,
        qty: testCalculation.quantity,
        priceType: testCalculation.priceType as 'rush' | 'online' | 'promo',
        customerType: testCalculation.customerType as 'regular' | 'vip'
      });
      
      setCalcResult(result.data || result);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Ошибка расчета цены');
      console.error('Calculation error:', err);
    } finally {
      setCalcLoading(false);
    }
  }, [testCalculation, setCalcLoading, setError, setCalcResult]);

  const handleUpdateTestCalculation = useCallback((updates: Partial<CalculationTest>) => {
    setTestCalculation({ ...testCalculation, ...updates });
  }, [testCalculation, setTestCalculation]);

  const handleAddOperation = useCallback(() => {
    if (!schema) return;
    
    setSchema({
      ...schema,
      operations: [
        ...schema.operations,
        {
          operation: '',
          service_id: undefined,
          service: '',
          type: '',
          unit: '',
          rate: 0,
          formula: ''
        }
      ]
    });
  }, [schema, setSchema]);

  const renderProductsTab = () => (
    <ProductsTab
      loading={loading}
      productTypes={productTypes}
      selectedType={selectedType}
      schema={schema}
      services={services}
      onSelectType={setSelectedType}
      onDeleteType={handleDeleteProductType}
      onAddType={() => setShowAddModal(true)}
      onUpdateOperation={updateOperation}
      onRemoveOperation={removeOperation}
      onAddOperation={handleAddOperation}
      onSaveSchema={handleUpdateSchema}
      saving={saving}
    />
  );

  const renderTestTab = () => (
    <TestTab
      productTypes={productTypes}
      testCalculation={testCalculation}
      onUpdateTestCalculation={handleUpdateTestCalculation}
      onRunCalculation={runTestCalculation}
      calcLoading={calcLoading}
      calcResult={calcResult}
    />
  );


  return (
    <div className="calculator-product-manager">
      <div className="manager-header">
        <h1>Управление продуктами калькулятора</h1>
        <p>Настройка типов продуктов, операций и тестирование расчетов</p>
      </div>

      {error && (
        <Alert type="error" onClose={() => setError(null)} className="mb-4">
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert type="success" onClose={() => setSuccessMessage(null)} className="mb-4">
          {successMessage}
        </Alert>
      )}

      <div className="tabs-container">
        <nav className="tabs-nav">
          {[
            { key: 'products', label: 'Продукты', icon: '📦' },
            { key: 'test', label: 'Тестирование', icon: '🧪' },
            { key: 'analytics', label: 'Аналитика', icon: '📊' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'products' && renderProductsTab()}
      {activeTab === 'test' && renderTestTab()}
      {activeTab === 'analytics' && renderAnalyticsTab()}

      <AddProductTypeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        newProductType={newProductType}
        onUpdateNewProductType={updateNewProductType}
        onResetNewProductType={resetNewProductType}
        onSave={handleAddProductType}
        saving={saving}
        onSetError={setError}
      />
    </div>
  );
};

export default CalculatorProductManager;
