import React, { useMemo } from 'react';
import { Button, EmptyState } from '../../../common';
import type { PrintPrice } from '../../hooks/usePricingManagementState';

interface PrintPricesTabProps {
  printPrices: PrintPrice[];
  printTechnologies: { code: string; name: string }[];
  loading: boolean;
  searchTerm: string;
  onNavigateToEdit: (id: number) => void;
  onNavigateToAdd: () => void;
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
  onNavigateToEdit,
  onNavigateToAdd,
}) => {
  const filteredItems = useMemo(
    () => getFilteredData(printPrices, searchTerm),
    [printPrices, searchTerm]
  );

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Цены печати по технологиям</h3>
        <p>Централизованные цены за лист SRA3. Нажмите «Изменить» для редактирования на отдельной странице.</p>
        <div className="section-actions">
          <Button variant="primary" size="sm" onClick={onNavigateToAdd}>
            Добавить цену технологии
          </Button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
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
                  <span className="badge badge-secondary">{item.counter_unit === 'meters' ? 'Пог. метры' : 'Листы'}</span>
                </div>
                <Button variant="primary" size="sm" onClick={() => onNavigateToEdit(item.id)}>
                  Изменить
                </Button>
              </div>
              <div className="card-content">
                {item.counter_unit === 'sheets' && (item as any).sheet_width_mm != null && (
                  <div className="mb-2">
                    <strong>Размер листа:</strong> {(item as any).sheet_width_mm}×{(item as any).sheet_height_mm} мм
                  </div>
                )}
                <div className="price-summary">
                  {item.counter_unit === 'sheets' && (
                    <>
                      <div>ЧБ одностор.: {item.price_bw_single ?? '—'}</div>
                      <div>ЧБ двустор.: {item.price_bw_duplex ?? '—'}</div>
                      <div>Цвет одностор.: {item.price_color_single ?? '—'}</div>
                      <div>Цвет двустор.: {item.price_color_duplex ?? '—'}</div>
                    </>
                  )}
                  {item.counter_unit === 'meters' && (
                    <>
                      <div>ЧБ/метр: {item.price_bw_per_meter ?? '—'}</div>
                      <div>Цвет/метр: {item.price_color_per_meter ?? '—'}</div>
                    </>
                  )}
                </div>
                {(item as any).tiers?.length > 0 && (
                  <div className="text-muted text-sm mt-2">
                    Диапазонов: {(item as any).tiers.length}
                  </div>
                )}
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
