import React from 'react';
import { Button, Alert, FormField } from '../../../components/common';

interface InfoTabProps {
  loading: boolean;
  form: {
    name: string;
    description?: string;
    icon?: string;
    calculator_type?: string;
    product_type?: string;
    category_id?: number;
  };
  product: any;
  saving: boolean;
  onFormChange: (field: string, value: string) => void;
  onSave: () => void;
}

export const InfoTab: React.FC<InfoTabProps> = React.memo(({
  loading,
  form,
  product,
  saving,
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
            className="form-input"
            value={form.name}
            onChange={(e) => onFormChange('name', e.target.value)}
          />
        </FormField>
        <FormField label="Иконка" help="Эмодзи или короткий символ">
          <input
            className="form-input"
            value={form.icon || ''}
            onChange={(e) => onFormChange('icon', e.target.value)}
          />
        </FormField>
        <FormField label="Тип продукции" help="Влияет на процессы и расчёты">
          <input
            className="form-input"
            value={form.product_type || ''}
            onChange={(e) => onFormChange('product_type', e.target.value)}
          />
        </FormField>
        <FormField label="Тип калькулятора" help="product / operation">
          <select
            className="form-select"
            value={form.calculator_type || ''}
            onChange={(e) => onFormChange('calculator_type', e.target.value)}
          >
            <option value="">—</option>
            <option value="product">product</option>
            <option value="operation">operation</option>
          </select>
        </FormField>
        <FormField label="Категория" help="ID категории (только чтение)">
          <input className="form-input" value={form.category_id ?? product?.category_id ?? ''} disabled />
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

