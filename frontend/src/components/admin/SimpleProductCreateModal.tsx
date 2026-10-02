import React, { useState, useEffect } from 'react';
import { Modal, Button, FormField, Alert } from '../common';
import { ProductCategory } from '../../services/products';
import { createProduct } from '../../services/products';

interface ProductCreateModalProps {
  visible: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  onCreated: (productId: number) => void;
}

const PRODUCT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'sheet_single', label: 'Листовое изделие' },
  { value: 'multi_page', label: 'Многостраничное' },
  { value: 'universal', label: 'Универсальное' },
];

const OPERATION_CALCULATOR_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sheet_item', label: 'Листовое изделие (операции)' },
  { value: 'multi_page_item', label: 'Многостраничное изделие (операции)' },
];

export const ProductCreateModal: React.FC<ProductCreateModalProps> = ({
  visible,
  onClose,
  categories,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(
    categories.length > 0 ? categories[0].id : null
  );
  const [calculatorType, setCalculatorType] = useState<'product' | 'operation'>('product');
  const [productType, setProductType] = useState('sheet_single');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Сброс формы при открытии
      setName('');
      setDescription('');
      setIcon('');
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
        product_type: productType as any,
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
    setIcon('');
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
      <div className="flex flex-column gap-4">
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

        <div className="form-row">
          <FormField label="Тип калькулятора" className="flex-1">
            <select
              className="form-select"
              value={calculatorType}
              onChange={(e) => {
                setCalculatorType(e.target.value as 'product' | 'operation');
                // Автоматически меняем тип продукта при смене типа калькулятора
                if (e.target.value === 'operation') {
                  setProductType('sheet_item');
                } else {
                  setProductType('sheet_single');
                }
              }}
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
            onChange={(e) => setProductType(e.target.value)}
          >
            {(calculatorType === 'product'
              ? PRODUCT_TYPE_OPTIONS
              : OPERATION_CALCULATOR_TYPES
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        <div className="flex gap-3 justify-end mt-2">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || categories.length === 0}
          >
            {submitting ? 'Создание...' : 'Создать продукт'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

