import React from 'react';
import { Button, Alert, FormField } from '../../../components/common';
import type { ProductCategory } from '../../../services/products';

interface InfoTabProps {
  loading: boolean;
  form: {
    name: string;
    description?: string;
    icon?: string;
    image_url?: string;
    calculator_type?: string;
    product_type?: string;
    category_id?: number;
    operator_percent?: string;
  };
  product: any;
  saving: boolean;
  categories?: ProductCategory[];
  onFormChange: (field: string, value: string) => void;
  onSave: () => void;
}

export const InfoTab: React.FC<InfoTabProps> = React.memo(({
  loading,
  form,
  product,
  saving,
  categories = [],
  onFormChange,
  onSave,
}) => {
  return (
    <div className="product-tab-panel">
      <Alert type="info">
        Измените базовые данные продукта. После сохранения они сразу будут доступны в каталоге и модулях расчёта.
      </Alert>
      {loading && <Alert type="info">Загружаем данные продукта…</Alert>}
      <div className="product-form-grid">
        <FormField label="Название" required help="Отображается в каталоге и калькуляторе">
          <input
            className="form-input form-input--full"
            value={form.name}
            onChange={(e) => onFormChange('name', e.target.value)}
          />
        </FormField>
        <FormField label="Иконка" help="Эмодзи или короткий символ">
          <input
            className="form-input form-input--full"
            value={form.icon || ''}
            onChange={(e) => onFormChange('icon', e.target.value)}
          />
        </FormField>
        <FormField label="Изображение (URL)" help="URL изображения продукта для сайта">
          <input
            className="form-input form-input--full"
            value={form.image_url || ''}
            onChange={(e) => onFormChange('image_url', e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
        </FormField>
        <FormField label="Тип продукции" help="Влияет на процессы и расчёты">
          <input
            className="form-input form-input--full"
            value={form.product_type || ''}
            onChange={(e) => onFormChange('product_type', e.target.value)}
          />
        </FormField>
        <FormField
          label="Тип калькулятора"
          help={form.product_type === 'multi_page' ? 'Для многостраничных изделий используется simplified.' : 'product / operation / simplified'}
        >
          <select
            className="form-select"
            value={form.calculator_type || ''}
            onChange={(e) => onFormChange('calculator_type', e.target.value)}
            disabled={form.product_type === 'multi_page'}
          >
            <option value="">—</option>
            <option value="product">product</option>
            <option value="operation">operation</option>
            <option value="simplified">simplified</option>
          </select>
        </FormField>
        <FormField label="Категория" help="Выберите категорию продукта">
          <select
            className="form-select"
            value={form.category_id ?? product?.category_id ?? ''}
            onChange={(e) => onFormChange('category_id', e.target.value)}
          >
            <option value="">— Без категории —</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Процент оператора" help="Процент от суммы позиции заказа">
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.1"
            value={form.operator_percent ?? ''}
            onChange={(e) => onFormChange('operator_percent', e.target.value)}
            placeholder="Например: 10"
          />
        </FormField>
        <FormField label="Описание" help="Краткий текст для менеджеров и клиентов">
          <textarea
            className="form-textarea"
            value={form.description || ''}
            onChange={(e) => onFormChange('description', e.target.value)}
            rows={4}
          />
        </FormField>
      </div>
      <div className="product-form-actions">
        <Button variant="primary" onClick={onSave} disabled={saving || !form.name}>
          {saving ? 'Сохранение…' : 'Сохранить изменения'}
        </Button>
      </div>
    </div>
  );
});

InfoTab.displayName = 'InfoTab';

