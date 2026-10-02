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
  const [icon, setIcon] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(
    categories.length > 0 ? categories[0].id : null
  );
  const [calculatorType, setCalculatorType] = useState<'product' | 'operation' | 'simplified'>('product');
  const [productType, setProductType] = useState<'sheet_single' | 'multi_page' | 'universal'>('sheet_single');
  const [operatorPercent, setOperatorPercent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
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
      setOperatorPercent('');
      setImageUrl('');
      setError(null);
    }
  }, [visible, categories]);

  useEffect(() => {
    if (productType === 'multi_page') {
      setCalculatorType('simplified');
    }
  }, [productType]);

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
        image_url: imageUrl.trim() || undefined,
        calculator_type: productType === 'multi_page' ? 'simplified' : calculatorType,
        product_type: productType,
        operator_percent: operatorPercent ? Number(operatorPercent) : undefined,
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
    setOperatorPercent('');
    setImageUrl('');
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
            className="form-select form-select--full"
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

        <FormField label="Изображение (URL)" help="URL изображения продукта для сайта">
          <input
            className="form-input"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
        </FormField>

        <FormField label="Процент оператора" help="Процент от суммы позиции заказа">
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.1"
            value={operatorPercent}
            onChange={(e) => setOperatorPercent(e.target.value)}
            placeholder="Например: 10"
          />
        </FormField>

        <div className="form-row">
          <FormField label="Тип калькулятора" className="flex-1">
            <select
              className="form-select form-select--full"
              value={calculatorType}
              onChange={(e) => setCalculatorType(e.target.value as 'product' | 'operation' | 'simplified')}
              disabled={productType === 'multi_page'}
            >
              <option value="product">Продуктовый</option>
              <option value="operation">Операционный</option>
              <option value="simplified">Упрощённый</option>
            </select>
          </FormField>
        </div>

        <FormField label="Тип продукта">
          <select
            className="form-select form-select--full"
            value={productType}
            onChange={(e) => setProductType(e.target.value as 'sheet_single' | 'multi_page' | 'universal')}
          >
            {PRODUCT_TYPE_OPTIONS.filter((option) =>
              calculatorType === 'simplified' ? true : option.value !== 'multi_page'
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        {/* Подсказки по типам продуктов */}
        {productType === 'sheet_single' && (
          <Alert type="info">
            <div className="flex flex-column gap-1">
              <strong>Листовое изделие</strong>
              <span className="text-sm">Один лист бумаги с печатью. Примеры: визитки, листовки, флаеры, наклейки.</span>
            </div>
          </Alert>
        )}

        {productType === 'multi_page' && (
          <Alert type="info">
            <div className="flex flex-column gap-1">
              <strong>Многостраничное изделие</strong>
              <span className="text-sm">
                Изделие из нескольких страниц с переплетом. Примеры: буклеты, брошюры, каталоги, фотоальбомы.
              </span>
              <span className="text-sm">Для многостраничных используется упрощённый калькулятор.</span>
              <span className="text-sm mt-1">
                <strong>После создания</strong> откроется настройка шаблона: укажите варианты страниц (4, 8, 12…), добавьте размеры (форматы), для каждого размера — цены печати, материалы и отделку. Сохраните шаблон — продукт появится в калькуляторе.
              </span>
            </div>
          </Alert>
        )}

        {productType === 'universal' && (
          <Alert type="info">
            <div className="flex flex-column gap-1">
              <strong>Универсальное изделие</strong>
              <span className="text-sm">Гибкая настройка для нестандартных продуктов.</span>
            </div>
          </Alert>
        )}

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

