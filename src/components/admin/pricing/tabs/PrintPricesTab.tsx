import React, { useMemo, useCallback } from 'react';
import { Button, FormField, StatusBadge, EmptyState } from '../../../common';
import type { PrintPrice, PricingItemType, EditingItem, EditingValues } from '../../hooks/usePricingManagementState';

interface PrintPricesTabProps {
  printPrices: PrintPrice[];
  printTechnologies: { code: string; name: string }[];
  loading: boolean;
  searchTerm: string;
  editingItem: EditingItem | null;
  editingValues: EditingValues;
  onEdit: (item: PrintPrice, type: PricingItemType) => void;
  onAddNew: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  getEditingValue: (key: string) => string | number;
  updateEditingValue: (key: string, value: string | number) => void;
}

const getFilteredData = <T extends PrintPrice>(items: T[], searchTerm: string): T[] => {
  if (!items) return [];
  const term = searchTerm.toLowerCase();
  return items.filter((item) =>
    [item.technology_code, item.counter_unit]
      .concat([
        item.price_bw_single,
        item.price_bw_duplex,
        item.price_color_single,
        item.price_color_duplex,
        item.price_bw_per_meter,
        item.price_color_per_meter,
      ] as any)
      .some((v) => String(v ?? '').toLowerCase().includes(term)),
  );
};

const PrintPricesTabComponent: React.FC<PrintPricesTabProps> = ({
  printPrices,
  printTechnologies,
  loading,
  searchTerm,
  editingItem,
  editingValues,
  onEdit,
  onAddNew,
  onSave,
  onCancel,
  getEditingValue,
  updateEditingValue,
}) => {
  const filteredItems = useMemo(
    () => getFilteredData(printPrices, searchTerm),
    [printPrices, searchTerm]
  );

  const handleEdit = useCallback((item: PrintPrice) => {
    onEdit(item, 'print-prices');
  }, [onEdit]);

  const handleChange = useCallback(
    (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.value;
      updateEditingValue(key, val === '' ? '' : Number(val));
    },
    [updateEditingValue],
  );

  const handleCounterUnitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateEditingValue('counter_unit', e.target.value);
    },
    [updateEditingValue],
  );

  const handleTechnologyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateEditingValue('technology_code', e.target.value);
    },
    [updateEditingValue],
  );

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Цены печати по технологиям</h3>
        <p>Задайте цены для технологий печати (чб/цвет, одно-/двухсторонняя, листы или пог. метры)</p>
        <div className="section-actions">
          <Button variant="primary" size="sm" onClick={onAddNew}>
            Добавить цену технологии
          </Button>
        </div>
      </div>

      {/* Карточка создания новой записи показывается всегда, если нажали "Добавить" */}
      {editingItem?.id === -1 && (
        <div className="data-card">
          <div className="card-header">
            <div className="card-title">
              <h4>Новая технология</h4>
              <StatusBadge status={'active'} />
            </div>
            <div className="card-actions">
              <Button variant="success" size="sm" onClick={onSave} loading={loading}>
                Сохранить
              </Button>
              <Button variant="secondary" size="sm" onClick={onCancel}>
                Отмена
              </Button>
            </div>
          </div>

          <div className="card-content">
            <FormField label="Технология печати">
              <select
                value={getEditingValue('technology_code')}
                onChange={handleTechnologyChange}
                className="form-control"
              >
                <option value="">-- выберите технологию --</option>
                {printTechnologies.map((t) => (
                  <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                ))}
              </select>
            </FormField>

            <FormField label="Единица учета">
              <select
                value={getEditingValue('counter_unit')}
                onChange={handleCounterUnitChange}
                className="form-control"
              >
                <option value="sheets">Листы</option>
                <option value="meters">Пог. метры</option>
              </select>
            </FormField>

            <FormField label="ЧБ, односторонняя">
              <input
                type="number"
                step="0.01"
                value={getEditingValue('price_bw_single')}
                onChange={handleChange('price_bw_single')}
                className="form-control"
              />
            </FormField>

            <FormField label="ЧБ, двусторонняя">
              <input
                type="number"
                step="0.01"
                value={getEditingValue('price_bw_duplex')}
                onChange={handleChange('price_bw_duplex')}
                className="form-control"
              />
            </FormField>

            <FormField label="Цвет, односторонняя">
              <input
                type="number"
                step="0.01"
                value={getEditingValue('price_color_single')}
                onChange={handleChange('price_color_single')}
                className="form-control"
              />
            </FormField>

            <FormField label="Цвет, двусторонняя">
              <input
                type="number"
                step="0.01"
                value={getEditingValue('price_color_duplex')}
                onChange={handleChange('price_color_duplex')}
                className="form-control"
              />
            </FormField>

            <FormField label="ЧБ, пог. метр">
              <input
                type="number"
                step="0.01"
                value={getEditingValue('price_bw_per_meter')}
                onChange={handleChange('price_bw_per_meter')}
                className="form-control"
              />
            </FormField>

            <FormField label="Цвет, пог. метр">
              <input
                type="number"
                step="0.01"
                value={getEditingValue('price_color_per_meter')}
                onChange={handleChange('price_color_per_meter')}
                className="form-control"
              />
            </FormField>
          </div>
        </div>
      )}

      {filteredItems.length === 0 && !editingItem?.id ? (
        <EmptyState
          icon="📄"
          title="Нет данных о ценах печати"
          description="Добавьте цены для технологий печати"
        />
      ) : (
        <div className="data-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="data-card">
              <div className="card-header">
                <div className="card-title">
                  <h4>{item.technology_code}</h4>
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
                <FormField label="Технология печати">
                  {editingItem?.id === item.id ? (
                    <select
                      value={getEditingValue('technology_code')}
                      onChange={handleTechnologyChange}
                      className="form-control"
                    >
                      <option value="">-- выберите технологию --</option>
                      {printTechnologies.map((t) => (
                        <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                      ))}
                    </select>
                  ) : (
                    <span>{item.technology_code}</span>
                  )}
                </FormField>

                <FormField label="Единица учета">
                  {editingItem?.id === item.id ? (
                    <select
                      value={getEditingValue('counter_unit')}
                      onChange={handleCounterUnitChange}
                      className="form-control"
                    >
                      <option value="sheets">Листы</option>
                      <option value="meters">Пог. метры</option>
                    </select>
                  ) : (
                    <span>{item.counter_unit === 'meters' ? 'Пог. метры' : 'Листы'}</span>
                  )}
                </FormField>

                <FormField label="ЧБ, односторонняя">
                  {editingItem?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getEditingValue('price_bw_single')}
                      onChange={handleChange('price_bw_single')}
                      className="form-control"
                    />
                  ) : (
                    <span className="price-value">{item.price_bw_single ?? '—'}</span>
                  )}
                </FormField>

                <FormField label="ЧБ, двусторонняя">
                  {editingItem?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getEditingValue('price_bw_duplex')}
                      onChange={handleChange('price_bw_duplex')}
                      className="form-control"
                    />
                  ) : (
                    <span className="price-value">{item.price_bw_duplex ?? '—'}</span>
                  )}
                </FormField>

                <FormField label="Цвет, односторонняя">
                  {editingItem?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getEditingValue('price_color_single')}
                      onChange={handleChange('price_color_single')}
                      className="form-control"
                    />
                  ) : (
                    <span className="price-value">{item.price_color_single ?? '—'}</span>
                  )}
                </FormField>

                <FormField label="Цвет, двусторонняя">
                  {editingItem?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getEditingValue('price_color_duplex')}
                      onChange={handleChange('price_color_duplex')}
                      className="form-control"
                    />
                  ) : (
                    <span className="price-value">{item.price_color_duplex ?? '—'}</span>
                  )}
                </FormField>

                <FormField label="ЧБ, пог. метр">
                  {editingItem?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getEditingValue('price_bw_per_meter')}
                      onChange={handleChange('price_bw_per_meter')}
                      className="form-control"
                    />
                  ) : (
                    <span className="price-value">{item.price_bw_per_meter ?? '—'}</span>
                  )}
                </FormField>

                <FormField label="Цвет, пог. метр">
                  {editingItem?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getEditingValue('price_color_per_meter')}
                      onChange={handleChange('price_color_per_meter')}
                      className="form-control"
                    />
                  ) : (
                    <span className="price-value">{item.price_color_per_meter ?? '—'}</span>
                  )}
                </FormField>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const PrintPricesTab = React.memo(PrintPricesTabComponent);
PrintPricesTab.displayName = 'PrintPricesTab';

