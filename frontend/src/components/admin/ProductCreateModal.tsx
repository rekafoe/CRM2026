import React, { useState, useEffect } from 'react';
import { Modal, Button, FormField, Alert } from '../common';
import { ProductCategory } from '../../services/products';
import { createProduct } from '../../services/products';

// Опции типов продуктов
const PRODUCT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'sheet_single', label: 'Листовое изделие' },
  { value: 'multi_page', label: 'Многостраничное' },
  { value: 'universal', label: 'Универсальное' },
];

interface ProductCreateModalProps {
  visible: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  onCreated: (productId: number) => void;
}


export const ProductCreateModal: React.FC<ProductCreateModalProps> = ({
  visible,
  onClose,
  categories,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');
  const [categoryId, setCategoryId] = useState<number | null>(
    categories.length > 0 ? categories[0].id : null
  );
  const [calculatorType, setCalculatorType] = useState<'product' | 'operation'>('product');
  const [productType, setProductType] = useState<'sheet_single' | 'multi_page' | 'universal'>('sheet_single');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Сброс формы при открытии
      setName('');
      setDescription('');
      setIcon('📦');
      setCategoryId(categories.length > 0 ? categories[0].id : null);
      setCalculatorType('product');
      setProductType('sheet_single');
      setError(null);
    }
  }, [visible, categories]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Введите название продукта');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createProduct({
        category_id: categoryId ?? undefined,
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        calculator_type: calculatorType,
        product_type: productType,
      });

      if (result?.id) {
        onCreated(result.id);
        onClose();
      } else {
        setError('Не удалось создать продукт');
      }
    } catch (err: any) {
      console.error('Ошибка создания продукта:', err);
      setError(err?.response?.data?.error || err?.message || 'Ошибка создания продукта');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setIcon('📦');
    setCategoryId(categories.length > 0 ? categories[0].id : null);
    setCalculatorType('product');
    setProductType('sheet_single');
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={visible}
      onClose={handleClose}
      title="Создать продукт"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <Alert type="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <FormField label="Категория">
          <select
            className="form-select"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Без категории</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Название" required>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Визитки премиум"
          />
        </FormField>

        <FormField label="Описание">
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание продукта"
            rows={3}
          />
        </FormField>

        <div style={{ display: 'flex', gap: 12 }}>
          <FormField label="Иконка (эмодзи)" style={{ flex: 1 }}>
            <input
              className="form-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={2}
              placeholder="📦"
            />
          </FormField>
          <FormField label="Тип калькулятора" style={{ flex: 1 }}>
            <select
              className="form-select"
              value={calculatorType}
              onChange={(e) => setCalculatorType(e.target.value as 'product' | 'operation')}
            >
              <option value="product">Продуктовый</option>
              <option value="operation">Операционный</option>
            </select>
          </FormField>
        </div>

        <FormField label="Тип продукта">
          <select
            className="form-select"
            value={productType}
            onChange={(e) => setProductType(e.target.value as 'sheet_single' | 'multi_page' | 'universal')}
          >
            {PRODUCT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        {/* Подсказки по типам продуктов */}
        {productType === 'sheet_single' && (
          <Alert type="info">
            <div className="flex flex-col gap-1">
              <strong>📄 Листовое изделие</strong>
              <span className="text-sm">Один лист бумаги с печатью. Примеры: визитки, листовки, флаеры, наклейки.</span>
            </div>
          </Alert>
        )}

        {productType === 'multi_page' && (
          <Alert type="info">
            <div className="flex flex-col gap-1">
              <strong>📚 Многостраничное изделие</strong>
              <span className="text-sm">Изделие из нескольких страниц с переплетом. Примеры: буклеты, брошюры, каталоги, журналы.</span>
            </div>
          </Alert>
        )}

        {productType === 'universal' && (
          <Alert type="info">
            <div className="flex flex-col gap-1">
              <strong>🔧 Универсальное изделие</strong>
              <span className="text-sm">Гибкая настройка для нестандартных продуктов.</span>
            </div>
          </Alert>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Создание...' : 'Создать продукт'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

