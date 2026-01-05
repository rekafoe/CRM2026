import React, { useState } from 'react';
import { Modal, Button, FormField, Alert } from '../common';
import { ProductCategory } from '../../services/products';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import './ProductManagement.css';

interface SimplifiedProductCreatorProps {
  visible: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  onCreated: (productId: number) => void;
}

// 🎯 Умные шаблоны продуктов
const PRODUCT_TEMPLATES = {
  flyers: {
    name: 'Листовки',
    icon: '📄',
    description: 'Рекламные листовки различных форматов',
    product_type: 'sheet_single',
    calculator_type: 'product' as const,
    autoOperationType: 'flyers',
    parameters: [
      { name: 'format', type: 'select', label: 'Формат', options: ['A6', 'A5', 'A4', 'A3'], is_required: true, sort_order: 1 },
      { name: 'quantity', type: 'number', label: 'Количество', min_value: 100, max_value: 10000, is_required: true, sort_order: 2 },
      { name: 'sides', type: 'select', label: 'Стороны', options: ['1', '2'], default_value: '2', is_required: true, sort_order: 3 },
      { name: 'lamination', type: 'select', label: 'Ламинация', options: ['none', 'matte', 'glossy'], default_value: 'none', sort_order: 4 },
    ],
  },
  business_cards: {
    name: 'Визитки',
    icon: '💳',
    description: 'Визитные карточки',
    product_type: 'sheet_item',
    calculator_type: 'product' as const,
    autoOperationType: 'business_cards',
    parameters: [
      { name: 'quantity', type: 'number', label: 'Количество', min_value: 100, max_value: 5000, is_required: true, sort_order: 1 },
      { name: 'card_type', type: 'select', label: 'Тип', options: ['Стандартные', 'Ламинированные', 'Магнитные'], is_required: true, sort_order: 2 },
      { name: 'size', type: 'select', label: 'Размер', options: ['85x55', '90x50'], is_required: true, sort_order: 3 },
      { name: 'sides', type: 'select', label: 'Печать', options: ['Односторонняя', 'Двухсторонняя'], is_required: true, sort_order: 4 },
      { name: 'lamination', type: 'checkbox', label: 'Ламинирование', sort_order: 5 },
      { name: 'rounded_corners', type: 'checkbox', label: 'Скругление углов', sort_order: 6 },
    ],
  },
  booklets: {
    name: 'Буклеты',
    icon: '📖',
    description: 'Многостраничные буклеты',
    product_type: 'multi_page',
    calculator_type: 'product' as const,
    autoOperationType: 'multi_page',
    parameters: [
      { name: 'pages', type: 'number', label: 'Количество страниц', min_value: 4, max_value: 200, is_required: true, sort_order: 1 },
      { name: 'quantity', type: 'number', label: 'Экземпляров', min_value: 1, max_value: 10000, is_required: true, sort_order: 2 },
      { name: 'format', type: 'select', label: 'Формат', options: ['A6', 'A5', 'A4'], is_required: true, sort_order: 3 },
      { name: 'print_type', type: 'select', label: 'Тип печати', options: ['Цветная', 'Ч/Б', 'Смешанная'], is_required: true, sort_order: 4 },
      { name: 'binding_type', type: 'select', label: 'Переплет', options: ['Скрепка', 'Клей', 'Пружина'], is_required: true, sort_order: 5 },
      { name: 'duplex_printing', type: 'checkbox', label: 'Двухсторонняя печать', sort_order: 6 },
    ],
  },
  stickers: {
    name: 'Наклейки',
    icon: '🏷️',
    description: 'Самоклеящиеся наклейки',
    product_type: 'sheet_item',
    calculator_type: 'product' as const,
    autoOperationType: 'flyers', // используем базовые операции листовых
    parameters: [
      { name: 'quantity', type: 'number', label: 'Количество', min_value: 50, max_value: 5000, is_required: true, sort_order: 1 },
      { name: 'size', type: 'text', label: 'Размер (мм)', is_required: true, sort_order: 2 },
      { name: 'shape', type: 'select', label: 'Форма', options: ['Прямоугольные', 'Круглые', 'Фигурные'], is_required: true, sort_order: 3 },
      { name: 'cutting', type: 'checkbox', label: 'Вырубка', sort_order: 4 },
    ],
  },
  custom: {
    name: 'Пользовательский продукт',
    icon: '📦',
    description: 'Продукт с настраиваемыми параметрами',
    product_type: 'universal',
    calculator_type: 'product' as const,
    autoOperationType: 'flyers',
    parameters: [
      { name: 'quantity', type: 'number', label: 'Количество', min_value: 1, max_value: 100000, is_required: true, sort_order: 1 },
    ],
  },
};

type TemplateKey = keyof typeof PRODUCT_TEMPLATES;

export const SimplifiedProductCreator: React.FC<SimplifiedProductCreatorProps> = ({
  visible,
  onClose,
  categories,
  onCreated,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('flyers');
  const [customName, setCustomName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(
    categories.length > 0 ? categories[0].id : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProductWithSetup = useProductDirectoryStore((state) => state.createProductWithSetup);

  const handleTemplateSelect = (templateKey: TemplateKey) => {
    setSelectedTemplate(templateKey);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedCategory) {
      setError('Выберите категорию продукта');
      return;
    }

    if (!customName.trim()) {
      setError('Введите название продукта');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const template = PRODUCT_TEMPLATES[selectedTemplate];

      const payload = {
        product: {
          category_id: selectedCategory,
          name: customName.trim(),
          description: template.description,
          icon: template.icon,
          calculator_type: template.calculator_type,
          product_type: template.product_type,
        },
        operations: [], // операции будут добавлены автоматически через autoOperationType
        autoOperationType: template.autoOperationType,
        materials: [],
        parameters: template.parameters.map((param, index) => ({
          ...param,
          options: Array.isArray(param.options) ? JSON.stringify(param.options) : param.options,
          sort_order: param.sort_order ?? index,
        })),
        template: {
          trim_size: {},
          print_run: { enabled: false },
          finishing: [],
          packaging: [],
          price_rules: [],
        },
      };

      const productId = await createProductWithSetup(payload);

      if (productId) {
        onCreated(productId);
        handleClose();
      } else {
        setError('Не удалось создать продукт');
      }
    } catch (err: unknown) {
      console.error('Ошибка создания продукта:', err);
      setError(getErrorMessage(err, 'Произошла ошибка при создании продукта'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedTemplate('flyers');
    setCustomName('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={visible}
      onClose={handleClose}
      title="Создать продукт"
      size="large"
    >
      <div className="simplified-product-creator">
        {error && (
          <Alert type="error" style={{ marginBottom: '20px' }}>
            {error}
          </Alert>
        )}

        {step === 1 && (
          <div className="template-selection">
            <h3 style={{ marginBottom: '16px' }}>Выберите тип продукта</h3>
            <div className="template-grid">
              {(Object.keys(PRODUCT_TEMPLATES) as TemplateKey[]).map((key) => {
                const template = PRODUCT_TEMPLATES[key];
                return (
                  <button
                    key={key}
                    className="template-card"
                    onClick={() => handleTemplateSelect(key)}
                  >
                    <div className="template-icon">{template.icon}</div>
                    <div className="template-name">{template.name}</div>
                    <div className="template-description">{template.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="product-details">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(1)}
              style={{ marginBottom: '16px' }}
            >
              ← Назад к шаблонам
            </Button>

            <div className="selected-template-info" style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                {PRODUCT_TEMPLATES[selectedTemplate].icon}
              </div>
              <h3>{PRODUCT_TEMPLATES[selectedTemplate].name}</h3>
              <p style={{ color: '#666', fontSize: '14px' }}>
                {PRODUCT_TEMPLATES[selectedTemplate].description}
              </p>
            </div>

            <FormField
              label="Категория"
              type="select"
              value={selectedCategory?.toString() || ''}
              onChange={(e) => setSelectedCategory(Number(e.target.value))}
              required
            >
              <option value="">Выберите категорию</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </FormField>

            <FormField
              label="Название продукта"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={`Например: ${PRODUCT_TEMPLATES[selectedTemplate].name} A4`}
              required
            />

            <Alert type="info" style={{ marginTop: '20px' }}>
              <strong>Что будет создано:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                <li>Продукт с базовыми настройками</li>
                <li>
                  Параметры: {PRODUCT_TEMPLATES[selectedTemplate].parameters.length} полей
                </li>
                <li>Операции добавятся автоматически</li>
                <li>Можно настроить подробнее после создания</li>
              </ul>
            </Alert>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Отмена
          </Button>
          {step === 2 && (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !customName.trim() || !selectedCategory}
            >
              {submitting ? 'Создание...' : 'Создать продукт'}
            </Button>
          )}
        </div>
      </div>

      <style>{`
        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .template-card {
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .template-card:hover {
          border-color: #4CAF50;
          box-shadow: 0 4px 12px rgba(76, 175, 80, 0.15);
          transform: translateY(-2px);
        }

        .template-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .template-name {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 8px;
          color: #333;
        }

        .template-description {
          font-size: 13px;
          color: #666;
          line-height: 1.4;
        }

        .selected-template-info {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
        }

        .selected-template-info h3 {
          margin: 8px 0;
          color: #333;
        }
      `}</style>
    </Modal>
  );
};


