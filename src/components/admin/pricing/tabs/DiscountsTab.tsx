import React, { useMemo, useCallback } from 'react';
import { Button, FormField, StatusBadge, EmptyState } from '../../../common';
import type { QuantityDiscount, PricingItemType, EditingItem, EditingValues } from '../../hooks/usePricingManagementState';

interface DiscountsTabProps {
  quantityDiscounts: QuantityDiscount[];
  loading: boolean;
  searchTerm: string;
  editingItem: EditingItem | null;
  editingValues: EditingValues;
  onEdit: (item: QuantityDiscount, type: PricingItemType) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  getEditingValue: (key: string) => string | number;
  updateEditingValue: (key: string, value: string | number) => void;
}

const getFilteredData = <T extends QuantityDiscount>(
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

const DiscountsTabComponent: React.FC<DiscountsTabProps> = ({
  quantityDiscounts,
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
    () => getFilteredData(quantityDiscounts, searchTerm),
    [quantityDiscounts, searchTerm]
  );

  const handleEdit = useCallback((item: QuantityDiscount) => {
    onEdit(item, 'quantity-discounts');
  }, [onEdit]);

  const handleDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditingValue('discount_percent', parseFloat(e.target.value) || 0);
  }, [updateEditingValue]);

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Скидки за объем печати</h3>
        <p>Управление скидками в зависимости от количества</p>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Нет скидок за объем"
          description="Добавьте скидки для различных объемов заказов"
        />
      ) : (
        <div className="data-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="data-card">
              <div className="card-header">
                <div className="card-title">
                  <h4>{item.min_quantity} - {item.max_quantity || '∞'} листов</h4>
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
                  <FormField label="Процент скидки">
                    {editingItem?.id === item.id ? (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={getEditingValue('discount_percent')}
                        onChange={handleDiscountChange}
                        className="form-control"
                      />
                    ) : (
                      <span className="field-value">{item.discount_percent}%</span>
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

export const DiscountsTab = React.memo(DiscountsTabComponent);
DiscountsTab.displayName = 'DiscountsTab';

