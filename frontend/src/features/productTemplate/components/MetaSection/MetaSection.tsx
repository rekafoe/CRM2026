import React from 'react';
import { Button, FormField, Alert } from '../../../../components/common';
import type { ProductCategory } from '../../../../services/products';

interface MetaSectionProps {
  name: string;
  description: string;
  icon: string;
  operator_percent: string;
  category_id?: number;
  categories?: ProductCategory[];
  saving: boolean;
  onChange: (patch: Partial<{ name: string; description: string; icon: string; operator_percent: string; category_id?: number }>) => void;
  onSave: () => Promise<void> | void;
}

const MetaSection: React.FC<MetaSectionProps> = ({ name, description, icon, operator_percent, category_id, categories = [], saving, onChange, onSave }) => {
  const hasChanges = name.trim().length > 0;

  return (
    <div className="form-section">
      <div className="form-section__content">
        <FormField label="Название продукта" required help="Отображается в каталоге и калькуляторе">
          <input
            className="form-input"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Например: Визитки"
          />
        </FormField>

        <FormField label="Иконка (эмодзи)" help="Один или два символа для визуального обозначения">
          <div className="icon-input-wrapper">
            <input
              className="form-input"
              value={icon}
              onChange={(e) => onChange({ icon: e.target.value })}
              placeholder="📦"
              maxLength={2}
            />
            {icon && (
              <div className="icon-preview">
                <span>{icon}</span>
              </div>
            )}
          </div>
        </FormField>

        <FormField label="Описание" help="Краткое описание для менеджеров и клиентов">
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Опишите особенности продукта..."
            rows={4}
          />
        </FormField>

        <FormField label="Процент оператора" help="Процент от суммы позиции заказа">
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.1"
            value={operator_percent}
            onChange={(e) => onChange({ operator_percent: e.target.value })}
            placeholder="Например: 10"
          />
        </FormField>

        <FormField label="Категория" help="Категория для группировки в каталоге">
          <select
            className="form-input"
            value={category_id ?? ''}
            onChange={(e) => onChange({ category_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">— Без категории —</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </option>
            ))}
          </select>
        </FormField>

        {!hasChanges && (
          <Alert type="warning">
            Название продукта обязательно для заполнения
          </Alert>
        )}

        <div className="form-section__actions">
          <Button
            variant="primary"
            onClick={() => void onSave()}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Сохранение…' : '💾 Сохранить изменения'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MetaSection;
