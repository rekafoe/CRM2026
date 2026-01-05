import React, { useState, useEffect } from 'react';
import { 
  getEnhancedProductTypes,
  getEnhancedProductSchema,
  upsertEnhancedProduct,
  upsertEnhancedProductSchema,
  deleteEnhancedProduct
} from '../../api';
import { numberInputFromString, numberInputToNumber, type NumberInputValue } from '../../utils/numberInput';

interface ProductType {
  key: string;
  name: string;
  status: string;
  created_at: string;
}

interface ProductSchema {
  key: string;
  name: string;
  parameters: Record<string, any>;
  operations: Array<{
    operation: string;
    service: string;
    type: string;
    unit: string;
    rate: number | NumberInputValue;
    formula: string;
  }>;
}

const ProductTypesManager: React.FC = () => {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [schema, setSchema] = useState<ProductSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductType, setNewProductType] = useState({
    key: '',
    name: '',
    operations: [] as any[]
  });

  useEffect(() => {
    loadProductTypes();
  }, []);

  useEffect(() => {
    if (selectedType) {
      loadSchema(selectedType);
    }
  }, [selectedType]);

  const loadProductTypes = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getEnhancedProductTypes();
      setProductTypes(response.data || response);
    } catch (err) {
      setError('Ошибка загрузки типов продуктов');
      console.error('Error loading product types:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSchema = async (key: string) => {
    try {
      const response = await getEnhancedProductSchema(key);
      setSchema(response.data || response);
    } catch (err) {
      setError('Ошибка загрузки схемы продукта');
      console.error('Error loading schema:', err);
    }
  };

  const handleAddProductType = async () => {
    if (!newProductType.key || !newProductType.name) {
      setError('Заполните все обязательные поля');
      return;
    }

    try {
      await upsertEnhancedProduct(newProductType);
      setShowAddModal(false);
      setNewProductType({ key: '', name: '', operations: [] });
      loadProductTypes();
    } catch (err) {
      setError('Ошибка создания типа продукта');
    }
  };

  const handleDeleteProductType = async (key: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот тип продукта?')) {
      return;
    }

    try {
      await deleteEnhancedProduct(key);
      loadProductTypes();
      if (selectedType === key) {
        setSelectedType(null);
        setSchema(null);
      }
    } catch (err) {
      setError('Ошибка удаления типа продукта');
    }
  };

  const handleUpdateSchema = async () => {
    if (!selectedType || !schema) return;

    try {
      await upsertEnhancedProductSchema(selectedType, {
        operations: schema.operations.map((op) => ({
          ...op,
          rate: numberInputToNumber(op.rate as any, 0),
        }))
      });
      setError(null);
    } catch (err) {
      setError('Ошибка обновления схемы');
    }
  };

  const addOperation = () => {
    if (!schema) return;
    
    setSchema({
      ...schema,
      operations: [
        ...schema.operations,
        {
          operation: '',
          service: '',
          type: '',
          unit: '',
          rate: 0,
          formula: ''
        }
      ]
    });
  };

  const updateOperation = (index: number, field: string, value: any) => {
    if (!schema) return;
    
    const updatedOperations = [...schema.operations];
    updatedOperations[index] = { ...updatedOperations[index], [field]: value };
    
    setSchema({
      ...schema,
      operations: updatedOperations
    });
  };

  const removeOperation = (index: number) => {
    if (!schema) return;
    
    setSchema({
      ...schema,
      operations: schema.operations.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Управление типами продуктов</h1>
        <p className="text-gray-600">Настройка схем и операций для различных типов продуктов</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Список типов продуктов */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Типы продуктов</h2>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Добавить тип
              </button>
            </div>
          </div>
          
          <div className="p-4">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {productTypes.map((type) => (
                  <div
                    key={type.key}
                    className={`p-3 border rounded cursor-pointer transition-colors ${
                      selectedType === type.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedType(type.key)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium">{type.name}</h3>
                        <p className="text-sm text-gray-500">{type.key}</p>
                      </div>
                      <div className="flex space-x-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          type.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {type.status}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProductType(type.key);
                          }}
                          className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Схема выбранного типа */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">
              {schema ? `Схема: ${schema.name}` : 'Выберите тип продукта'}
            </h2>
          </div>
          
          <div className="p-4">
            {schema ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Операции</h3>
                  <div className="space-y-2">
                    {schema.operations.map((operation, index) => (
                      <div key={index} className="p-3 border rounded">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input
                            type="text"
                            placeholder="Название операции"
                            value={operation.operation}
                            onChange={(e) => updateOperation(index, 'operation', e.target.value)}
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Формула (например: sheets * sides)"
                            value={operation.formula}
                            onChange={(e) => updateOperation(index, 'formula', e.target.value)}
                            className="px-2 py-1 border rounded text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <input
                            type="text"
                            placeholder="Услуга"
                            value={operation.service}
                            onChange={(e) => updateOperation(index, 'service', e.target.value)}
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Тип"
                            value={operation.type}
                            onChange={(e) => updateOperation(index, 'type', e.target.value)}
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Единица"
                            value={operation.unit}
                            onChange={(e) => updateOperation(index, 'unit', e.target.value)}
                            className="px-2 py-1 border rounded text-sm"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Тариф"
                            value={operation.rate}
                            onChange={(e) => updateOperation(index, 'rate', numberInputFromString(e.target.value))}
                            className="px-2 py-1 border rounded text-sm w-24"
                          />
                          <button
                            onClick={() => removeOperation(index)}
                            className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={addOperation}
                    className="mt-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    + Добавить операцию
                  </button>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={handleUpdateSchema}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Сохранить схему
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                Выберите тип продукта для редактирования схемы
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно добавления типа продукта */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Добавить тип продукта</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ключ (key)
                </label>
                <input
                  type="text"
                  value={newProductType.key}
                  onChange={(e) => setNewProductType({ ...newProductType, key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="flyers, business_cards, etc."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название
                </label>
                <input
                  type="text"
                  value={newProductType.name}
                  onChange={(e) => setNewProductType({ ...newProductType, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Листовки, Визитки, etc."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Отмена
              </button>
              <button
                onClick={handleAddProductType}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductTypesManager;
