import React, { useState, useEffect } from 'react';
import { Material } from '../../types/shared';
import { api } from '../../api';

interface PaperType {
  id: number;
  name: string;
  display_name: string;
}

interface MaterialFormModalProps {
  isOpen: boolean;
  material?: Material | null;
  onClose: () => void;
  onSave: (materialData: any) => void;
}

export const MaterialFormModal: React.FC<MaterialFormModalProps> = ({
  isOpen,
  material,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<Partial<Material> & { finish?: string }>({
    name: '',
    description: '',
    category_id: undefined, // Изменяем на undefined, чтобы пользователь выбрал категорию
    quantity: 0,
    unit: 'шт',
    price: 0,
    sheet_price_single: 0, // Добавляем поле для backend
    supplier_id: undefined,
    min_stock_level: 0,
    max_stock_level: 100,
    location: '',
    barcode: '',
    sku: '',
    notes: '',
    is_active: true,
    paper_type_id: undefined, // 🆕 Добавляем поле для связи с типом бумаги
    density: undefined, // 🆕 Добавляем поле плотности
    finish: '' // 🆕 Отделка (для ламинации)
  });

  // 🆕 Состояние для типов бумаги
  const [paperTypes, setPaperTypes] = useState<PaperType[]>([]);
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);
  
  // 🆕 Состояние для поставщиков
  const [suppliers, setSuppliers] = useState<{id: number, name: string}[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  
  // 🆕 Состояние для категорий
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const selectedCategory = React.useMemo(
    () => categories.find((c) => c.id === formData.category_id),
    [categories, formData.category_id]
  );
  const isLamination = React.useMemo(() => {
    if (!selectedCategory) return false;
    const name = selectedCategory.name.toLowerCase();
    // Показываем ламинационные поля как минимум для категорий, содержащих "лам" или "пленк"
    return name.includes('лам') || name.includes('пленк');
  }, [selectedCategory]);

  // 🆕 Загрузка типов бумаги
  const loadPaperTypes = async () => {
    try {
      setLoadingPaperTypes(true);
      const response = await api.get('/paper-types');
      const data = response.data || [];
      // Дедупликация по id
      const uniquePaperTypes = data.reduce((acc: PaperType[], paperType: PaperType) => {
        if (!acc.find(pt => pt.id === paperType.id)) {
          acc.push(paperType);
        }
        return acc;
      }, []);
      setPaperTypes(uniquePaperTypes);
    } catch (error) {
      console.error('Ошибка загрузки типов бумаги:', error);
      setPaperTypes([]);
    } finally {
      setLoadingPaperTypes(false);
    }
  };

  // 🆕 Загрузка поставщиков
  const loadSuppliers = async () => {
    try {
      setLoadingSuppliers(true);
      const response = await api.get('/suppliers');
      const data = response.data || [];
      // Дедупликация по id
      const uniqueSuppliers = data.reduce((acc: {id: number, name: string}[], supplier: {id: number, name: string}) => {
        if (!acc.find(s => s.id === supplier.id)) {
          acc.push(supplier);
        }
        return acc;
      }, []);
      setSuppliers(uniqueSuppliers);
    } catch (error) {
      console.error('Ошибка загрузки поставщиков:', error);
      setSuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // 🆕 Загрузка категорий
  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const response = await api.get('/material-categories');
      const data = response.data || [];
      // Дедупликация по id
      const uniqueCategories = data.reduce((acc: {id: number, name: string}[], category: {id: number, name: string}) => {
        if (!acc.find(c => c.id === category.id)) {
          acc.push(category);
        }
        return acc;
      }, []);
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  // 🆕 Загружаем типы бумаги, поставщиков и категории при монтировании компонента
  useEffect(() => {
    loadPaperTypes();
    loadSuppliers();
    loadCategories();
  }, []);

  useEffect(() => {
    if (material) {
      // Определяем цену: приоритет у sheet_price_single, затем price
      const price = material.sheet_price_single ?? material.price ?? 0;
      
      setFormData({
        name: material.name || '',
        description: material.description || '',
        category_id: material.category_id || undefined,
        quantity: material.quantity || 0,
        unit: material.unit || 'шт',
        price: price,
        sheet_price_single: price, // Синхронизируем с backend полем
        supplier_id: material.supplier_id,
        min_stock_level: material.min_stock_level || 0,
        max_stock_level: material.max_stock_level || 100,
        location: material.location || '',
        barcode: material.barcode || '',
        sku: material.sku || '',
        notes: material.notes || '',
        is_active: material.is_active !== undefined ? material.is_active : true,
        paper_type_id: (material as any).paper_type_id || undefined, // 🆕 Добавляем поле типа бумаги
        density: (material as any).density || undefined, // 🆕 Добавляем поле плотности
        finish: (material as any).finish || '' // 🆕 Отделка (для ламинации)
      });
    } else {
      // При создании нового материала сбрасываем форму
      setFormData({
        name: '',
        description: '',
        category_id: undefined,
        quantity: 0,
        unit: 'шт',
        price: 0,
        sheet_price_single: 0,
        supplier_id: undefined,
        min_stock_level: 0,
        max_stock_level: 100,
        location: '',
        barcode: '',
        sku: '',
        notes: '',
        is_active: true,
        paper_type_id: undefined,
        density: undefined,
        finish: ''
      });
    }
  }, [material]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('=== ОТПРАВКА ФОРМЫ ===');
    console.log('formData:', formData);
    onSave(formData);
  };

  const handleChange = (field: keyof Material, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{material ? 'Редактировать материал' : 'Добавить материал'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="material-form">
          <div className="form-row">
            <div className="form-group">
              <label>Название *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                placeholder="Введите название материала"
              />
            </div>
            <div className="form-group">
              <label>Описание</label>
              <input
                type="text"
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Краткое описание"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Категория *</label>
              <select
                value={formData.category_id || ''}
                onChange={(e) => handleChange('category_id', parseInt(e.target.value))}
                required
                disabled={loadingCategories}
              >
                <option value="">Выберите категорию</option>
                {categories.map((category, index) => (
                  <option key={`category-${category.id}-${index}`} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {loadingCategories && <div className="loading-text">Загрузка категорий...</div>}
            </div>
            <div className="form-group">
              <label>Единица измерения *</label>
              <select
                value={formData.unit || 'шт'}
                onChange={(e) => handleChange('unit', e.target.value)}
                required
              >
                <option value="шт">Штуки</option>
                <option value="кг">Килограммы</option>
                <option value="л">Литры</option>
                <option value="м">Метры</option>
                <option value="м²">Квадратные метры</option>
                <option value="м³">Кубические метры</option>
                <option value="упак">Упаковки</option>
              </select>
            </div>
          </div>

          {/* Поля для бумаги */}
          {!isLamination && (
            <div className="form-row">
              <div className="form-group">
                <label>Тип бумаги</label>
                <select
                  value={formData.paper_type_id || ''}
                  onChange={(e) => handleChange('paper_type_id', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={loadingPaperTypes}
                >
                  <option value="">Выберите тип бумаги (опционально)</option>
                  {paperTypes.map((paperType, index) => (
                    <option key={`papertype-${paperType.id}-${index}`} value={paperType.id}>
                      {paperType.display_name}
                    </option>
                  ))}
                </select>
                {loadingPaperTypes && (
                  <small style={{ color: '#666', fontSize: '12px' }}>
                    Загрузка типов бумаги...
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Плотность (г/м²)</label>
                <input
                  type="number"
                  value={(formData as any).density || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    handleChange('density' as any, value ? parseInt(value) : undefined);
                  }}
                  placeholder="120, 150, 200..."
                  min="50"
                  max="500"
                  step="1"
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Укажите плотность бумаги для точного сопоставления с калькулятором
                </small>
              </div>
            </div>
          )}

          {/* Поля для ламинации */}
          {isLamination && (
            <div className="form-row">
              <div className="form-group">
                <label>Тип ламинации</label>
                <select
                  value={(formData as any).finish || ''}
                  onChange={(e) => handleChange('finish' as any, e.target.value || '')}
                >
                  <option value="">Выберите тип ламинации</option>
                  <option value="Глянцевая">Глянцевая</option>
                  <option value="Матовая">Матовая</option>
                  <option value="Софт-тач">Софт-тач</option>
                  <option value="Антискретч">Антискретч</option>
                  <option value="UV">UV</option>
                </select>
              </div>
              <div className="form-group">
                <label>Толщина пленки (мк)</label>
                <input
                  type="number"
                  value={(formData as any).density || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    handleChange('density' as any, value ? parseInt(value) : undefined);
                  }}
                  placeholder="25, 32, 42..."
                  min="10"
                  max="250"
                  step="1"
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Используем поле толщины для ламинации (в микронах)
                </small>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Количество *</label>
              <input
                type="number"
                value={formData.quantity || 0}
                onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 0)}
                required
                min="0"
                step="1"
              />
            </div>
            <div className="form-group">
              <label>Цена за единицу (BYN) *</label>
              <input
                type="number"
                value={formData.price || 0}
                onChange={(e) => {
                  const price = parseFloat(e.target.value) || 0;
                  handleChange('price', price);
                  handleChange('sheet_price_single', price); // Синхронизируем с backend полем
                }}
                required
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Минимальный запас</label>
              <input
                type="number"
                value={formData.min_stock_level || 0}
                onChange={(e) => handleChange('min_stock_level', parseInt(e.target.value) || 0)}
                min="0"
                step="1"
              />
            </div>
            <div className="form-group">
              <label>Максимальный запас</label>
              <input
                type="number"
                value={formData.max_stock_level || 100}
                onChange={(e) => handleChange('max_stock_level', parseInt(e.target.value) || 100)}
                min="0"
                step="1"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Местоположение</label>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="Стеллаж, полка, ящик"
              />
            </div>
            <div className="form-group">
              <label>Штрих-код</label>
              <input
                type="text"
                value={formData.barcode || ''}
                onChange={(e) => handleChange('barcode', e.target.value)}
                placeholder="Штрих-код или QR-код"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Артикул (SKU)</label>
              <input
                type="text"
                value={formData.sku || ''}
                onChange={(e) => handleChange('sku', e.target.value)}
                placeholder="Внутренний артикул"
              />
            </div>
            <div className="form-group">
              <label>Поставщик</label>
              <select
                value={formData.supplier_id || ''}
                onChange={(e) => handleChange('supplier_id', e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={loadingSuppliers}
              >
                <option value="">Выберите поставщика</option>
                {suppliers.map((supplier, index) => (
                  <option key={`supplier-${supplier.id}-${index}`} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {loadingSuppliers && <small>Загрузка поставщиков...</small>}
            </div>
          </div>

          <div className="form-group">
            <label>Примечания</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация о материале"
              rows={3}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={formData.is_active !== false}
                onChange={(e) => handleChange('is_active', e.target.checked)}
              />
              Материал активен
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              {material ? 'Сохранить изменения' : 'Добавить материал'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
