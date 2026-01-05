/**
 * Панель быстрого редактирования для продукта
 * Позволяет быстро изменять основные параметры без перехода в отдельные вкладки
 */

import React, { useState } from 'react';
import { Button, FormField, Alert } from '../../../../components/common';

interface QuickEditPanelProps {
  product: {
    id: number;
    name: string;
    description?: string;
    icon?: string;
    is_active?: boolean;
  } | null;
  onSave: (data: { name?: string; description?: string; icon?: string }) => Promise<void>;
  onToggleActive?: () => Promise<void>;
  saving?: boolean;
}

export const QuickEditPanel: React.FC<QuickEditPanelProps> = ({
  product,
  onSave,
  onToggleActive,
  saving = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [quickEdit, setQuickEdit] = useState({
    name: product?.name || '',
    description: product?.description || '',
    icon: product?.icon || '',
  });
  const [quickSaving, setQuickSaving] = useState(false);

  React.useEffect(() => {
    if (product) {
      setQuickEdit({
        name: product.name || '',
        description: product.description || '',
        icon: product.icon || '',
      });
    }
  }, [product]);

  const handleQuickSave = async () => {
    if (!product) return;
    try {
      setQuickSaving(true);
      await onSave({
        name: quickEdit.name !== product.name ? quickEdit.name : undefined,
        description: quickEdit.description !== product.description ? quickEdit.description : undefined,
        icon: quickEdit.icon !== product.icon ? quickEdit.icon : undefined,
      });
      setIsExpanded(false);
    } catch (error) {
      console.error('Ошибка быстрого сохранения', error);
    } finally {
      setQuickSaving(false);
    }
  };

  const hasChanges = product && (
    quickEdit.name !== product.name ||
    quickEdit.description !== product.description ||
    quickEdit.icon !== product.icon
  );

  if (!product) return null;

  return (
    <div className="quick-edit-panel">
      <div className="quick-edit-panel__header">
        <div className="quick-edit-panel__title">
          <span className="quick-edit-panel__icon">{product.icon || '📦'}</span>
          <div>
            <div className="quick-edit-panel__name">{product.name}</div>
            <div className="quick-edit-panel__meta">ID: {product.id}</div>
          </div>
        </div>
        <div className="quick-edit-panel__actions">
          {onToggleActive && (
            <Button
              variant={product.is_active ? 'secondary' : 'primary'}
              size="sm"
              onClick={onToggleActive}
              disabled={saving}
            >
              {product.is_active ? 'Деактивировать' : 'Активировать'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '✕ Свернуть' : '✏️ Быстрое редактирование'}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="quick-edit-panel__content">
          <Alert type="info">
            Быстрое редактирование основных полей продукта. Изменения сохраняются сразу.
          </Alert>

          <div className="quick-edit-form">
            <FormField label="Название" required>
              <input
                className="form-input"
                value={quickEdit.name}
                onChange={(e) => setQuickEdit((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Название продукта"
              />
            </FormField>

            <FormField label="Иконка (эмодзи)">
              <input
                className="form-input"
                value={quickEdit.icon}
                onChange={(e) => setQuickEdit((prev) => ({ ...prev, icon: e.target.value }))}
                placeholder="📦"
                maxLength={2}
              />
            </FormField>

            <FormField label="Описание">
              <textarea
                className="form-textarea"
                value={quickEdit.description}
                onChange={(e) => setQuickEdit((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Краткое описание продукта"
                rows={3}
              />
            </FormField>

            <div className="quick-edit-form__actions">
              <Button
                variant="primary"
                onClick={handleQuickSave}
                disabled={quickSaving || !hasChanges || !quickEdit.name.trim()}
              >
                {quickSaving ? 'Сохранение…' : 'Сохранить изменения'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuickEdit({
                    name: product.name || '',
                    description: product.description || '',
                    icon: product.icon || '',
                  });
                  setIsExpanded(false);
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

