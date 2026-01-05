import React from 'react';
import { Button, FormField, Alert } from '../../../../components/common';

interface MetaSectionProps {
  name: string;
  description: string;
  icon: string;
  saving: boolean;
  onChange: (patch: Partial<{ name: string; description: string; icon: string }>) => void;
  onSave: () => Promise<void> | void;
}

const MetaSection: React.FC<MetaSectionProps> = ({ name, description, icon, saving, onChange, onSave }) => {
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
