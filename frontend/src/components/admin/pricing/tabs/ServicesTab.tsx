import React, { useMemo, useCallback } from 'react';
import { Button, FormField, StatusBadge, EmptyState } from '../../../common';
import type { ServicePrice, PricingItemType, EditingItem, EditingValues } from '../../hooks/usePricingManagementState';

interface ServicesTabProps {
  servicePrices: ServicePrice[];
  loading: boolean;
  searchTerm: string;
  editingItem: EditingItem | null;
  editingValues: EditingValues;
  onEdit: (item: ServicePrice, type: PricingItemType) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  getEditingValue: (key: string) => string | number;
  updateEditingValue: (key: string, value: string | number) => void;
}

const getFilteredData = <T extends ServicePrice>(
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

const ServicesTabComponent: React.FC<ServicesTabProps> = ({
  servicePrices,
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
    () => getFilteredData(servicePrices, searchTerm),
    [servicePrices, searchTerm]
  );

  const handleEdit = useCallback((item: ServicePrice) => {
    onEdit(item, 'service-prices');
  }, [onEdit]);

  const handlePriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditingValue('price_per_unit', parseFloat(e.target.value) || 0);
  }, [updateEditingValue]);

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Дополнительные услуги</h3>
        <p>Управление ценами на дополнительные услуги</p>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon="🔧"
          title="Нет дополнительных услуг"
          description="Добавьте услуги для различных операций"
        />
      ) : (
        <div className="data-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="data-card">
              <div className="card-header">
                <div className="card-title">
                  <h4>{item.service_name}</h4>
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
                  <FormField label="Цена за единицу">
                    {editingItem?.id === item.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={getEditingValue('price_per_unit')}
                        onChange={handlePriceChange}
                        className="form-control"
                      />
                    ) : (
                      <span className="price-value">{item.price_per_unit.toFixed(2)} BYN</span>
                    )}
                  </FormField>
                  
                  <FormField label="Единица измерения">
                    <span className="field-value">{item.unit}</span>
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

export const ServicesTab = React.memo(ServicesTabComponent);
ServicesTab.displayName = 'ServicesTab';

