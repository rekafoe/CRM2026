import React, { useMemo, useCallback } from 'react';
import { Button, FormField, StatusBadge, EmptyState } from '../../../common';
import type { MarkupSetting, PricingItemType, EditingItem, EditingValues } from '../../hooks/usePricingManagementState';

interface MarkupTabProps {
  markupSettings: MarkupSetting[];
  loading: boolean;
  searchTerm: string;
  editingItem: EditingItem | null;
  editingValues: EditingValues;
  onEdit: (item: MarkupSetting, type: PricingItemType) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  getEditingValue: (key: string) => string | number;
  updateEditingValue: (key: string, value: string | number) => void;
}

const getFilteredData = <T extends MarkupSetting>(
  items: T[],
  searchTerm: string
): T[] => {
  if (!items) return [];
  
  return items.filter(item => 
    Object.values(item).some(value => 
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );
};

const MarkupTabComponent: React.FC<MarkupTabProps> = ({
  markupSettings,
  loading,
  searchTerm,
  editingItem,
  editingValues,
  onEdit,
  onSave,
  onCancel,
  getEditingValue,
  updateEditingValue,
}) => {
  const filteredItems = useMemo(
    () => getFilteredData(markupSettings, searchTerm),
    [markupSettings, searchTerm]
  );

  const handleEdit = useCallback((item: MarkupSetting) => {
    onEdit(item, 'markup-settings');
  }, [onEdit]);

  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditingValue('setting_value', parseFloat(e.target.value) || 0);
  }, [updateEditingValue]);

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Настройки наценок</h3>
        <p>Управление коэффициентами наценки</p>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon="📈"
          title="Нет настроек наценок"
          description="Добавьте настройки наценок для различных условий"
        />
      ) : (
        <div className="data-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="data-card">
              <div className="card-header">
                <div className="card-title">
                  <h4>{item.setting_name}</h4>
                  <StatusBadge status={item.is_active ? 'active' : 'inactive'} />
                </div>
                {editingItem?.id === item.id ? (
                  <div className="card-actions">
                    <Button variant="success" size="sm" onClick={onSave} loading={loading}>
                      Сохранить
                    </Button>
                    <Button variant="secondary" size="sm" onClick={onCancel}>
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => handleEdit(item)}>
                    Изменить
                  </Button>
                )}
              </div>
              
              <div className="card-content">
                <div className="field-group">
                  <FormField label="Значение наценки">
                    {editingItem?.id === item.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={getEditingValue('setting_value')}
                        onChange={handleValueChange}
                        className="form-control"
                      />
                    ) : (
                      <span className="field-value">
                        {item.setting_name.includes('multiplier') ?
                          `${item.setting_value} (${((item.setting_value - 1) * 100).toFixed(0)}%)` :
                          `${item.setting_value}%`
                        }
                      </span>
                    )}
                  </FormField>
                  
                  <FormField label="Описание">
                    <span className="field-value">{item.description}</span>
                  </FormField>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const MarkupTab = React.memo(MarkupTabComponent);
MarkupTab.displayName = 'MarkupTab';

