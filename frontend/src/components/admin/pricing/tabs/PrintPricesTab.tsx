import React, { useMemo } from 'react';
import { Button, EmptyState, StatusBadge } from '../../../common';
import { MoneyAmount } from '../../../ui';
import type { PrintPrice } from '../../hooks/usePricingManagementState';
import {
  formatCounterUnit,
  resolveTechnologyName,
  sortPrintPrices,
} from '../printPriceDisplay';

interface PrintPricesTabProps {
  printPrices: PrintPrice[];
  printTechnologies: { code: string; name: string }[];
  loading: boolean;
  searchTerm: string;
  onNavigateToEdit: (id: number) => void;
  onNavigateToAdd: () => void;
}

function getFilteredData(
  items: PrintPrice[],
  searchTerm: string,
  technologies: Array<{ code: string; name: string }>,
): PrintPrice[] {
  if (!items?.length) return [];
  const term = searchTerm.trim().toLowerCase();
  if (!term) return items;

  return items.filter((item) => {
    const techName = resolveTechnologyName(item.technology_code, technologies);
    const fields = [
      item.technology_code,
      techName,
      item.counter_unit,
      formatCounterUnit(item.counter_unit),
      item.price_bw_single,
      item.price_bw_duplex,
      item.price_color_single,
      item.price_color_duplex,
      item.price_bw_per_meter,
      item.price_color_per_meter,
      item.price_color_per_m2,
      item.price_white_per_m2,
      item.price_varnish_per_m2,
      item.min_charge,
      item.max_width_mm,
      item.max_height_mm,
    ];
    return fields.some((v) => String(v ?? '').toLowerCase().includes(term));
  });
}

const PriceLine: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="price-summary__row">
    <span className="price-summary__label">{label}</span>
    <span className="price-summary__value">{value}</span>
  </div>
);

const PrintPricesTabComponent: React.FC<PrintPricesTabProps> = ({
  printPrices,
  printTechnologies,
  loading,
  searchTerm,
  onNavigateToEdit,
  onNavigateToAdd,
}) => {
  const hasUvM2 = useMemo(
    () => printPrices.some((p) => p.technology_code === 'uv' && p.counter_unit === 'm2'),
    [printPrices],
  );

  const filteredItems = useMemo(
    () => sortPrintPrices(getFilteredData(printPrices, searchTerm, printTechnologies)),
    [printPrices, searchTerm, printTechnologies],
  );

  return (
    <div className="pricing-section">
      <div className="section-header section-header--with-actions">
        <div className="section-header__text">
          <h3>Цены печати по технологиям</h3>
          <p>
            Центральные ставки: лист, погонный метр или кв. метр (УФ-планшет). Редактирование — на отдельной
            странице.
          </p>
        </div>
        <div className="section-actions">
          <Button variant="primary" size="sm" onClick={onNavigateToAdd}>
            Добавить цену технологии
          </Button>
        </div>
      </div>

      {!hasUvM2 && (
        <div className="print-price-hint-banner">
          Для УФ-планшета создайте запись с технологией <strong>uv</strong> и единицей учёта{' '}
          <strong>Кв. метры (УФ)</strong>. Подробная настройка — в документации{' '}
          <code>docs/uv-flatbed-setup-guide.md</code> в репозитории.
        </div>
      )}

      {filteredItems.length === 0 ? (
        <EmptyState
          icon="📄"
          title="Нет данных о ценах печати"
          description="Добавьте центральные ставки для технологий печати"
        />
      ) : (
        <div className="data-grid">
          {filteredItems.map((item) => {
            const techName = resolveTechnologyName(item.technology_code, printTechnologies);
            const sheetW = (item as PrintPrice & { sheet_width_mm?: number }).sheet_width_mm;
            const sheetH = (item as PrintPrice & { sheet_height_mm?: number }).sheet_height_mm;
            const tiersCount = (item as PrintPrice & { tiers?: unknown[] }).tiers?.length ?? 0;
            const m2TiersCount = item.m2_tiers?.length ?? 0;

            return (
              <div key={item.id} className="data-card">
                <div className="card-header">
                  <div className="card-title">
                    <h4>{techName}</h4>
                    <span className="print-price-card__code">{item.technology_code}</span>
                    <StatusBadge status={formatCounterUnit(item.counter_unit)} color="neutral" size="sm" />
                    {item.is_active === 0 && (
                      <StatusBadge status="Неактивна" color="warning" size="sm" />
                    )}
                  </div>
                  <Button variant="primary" size="sm" onClick={() => onNavigateToEdit(item.id)}>
                    Изменить
                  </Button>
                </div>
                <div className="card-content">
                  <div className="price-summary">
                    {item.counter_unit === 'sheets' && sheetW != null && (
                      <PriceLine
                        label="Размер листа"
                        value={`${sheetW}×${sheetH} мм`}
                      />
                    )}
                    {item.counter_unit === 'sheets' && (
                      <>
                        <PriceLine label="ЧБ одностор." value={<MoneyAmount value={item.price_bw_single} />} />
                        <PriceLine label="ЧБ двустор." value={<MoneyAmount value={item.price_bw_duplex} />} />
                        <PriceLine label="Цвет одностор." value={<MoneyAmount value={item.price_color_single} />} />
                        <PriceLine label="Цвет двустор." value={<MoneyAmount value={item.price_color_duplex} />} />
                      </>
                    )}
                    {item.counter_unit === 'meters' && (
                      <>
                        <PriceLine label="ЧБ / метр" value={<MoneyAmount value={item.price_bw_per_meter} />} />
                        <PriceLine label="Цвет / метр" value={<MoneyAmount value={item.price_color_per_meter} />} />
                      </>
                    )}
                    {item.counter_unit === 'm2' && (
                      <>
                        <PriceLine label="Цвет / м²" value={<MoneyAmount value={item.price_color_per_m2} />} />
                        <PriceLine label="Белый / м²" value={<MoneyAmount value={item.price_white_per_m2} />} />
                        <PriceLine label="Лак / м²" value={<MoneyAmount value={item.price_varnish_per_m2} />} />
                        <PriceLine label="Мин. заказ" value={<MoneyAmount value={item.min_charge} />} />
                        <PriceLine
                          label="Стол"
                          value={`${item.max_width_mm ?? 600}×${item.max_height_mm ?? 900} мм`}
                        />
                      </>
                    )}
                  </div>
                  {tiersCount > 0 && (
                    <div className="text-muted text-sm mt-2">Диапазонов (листы): {tiersCount}</div>
                  )}
                  {m2TiersCount > 0 && (
                    <div className="text-muted text-sm mt-2">Ступеней м²: {m2TiersCount}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const PrintPricesTab = React.memo(PrintPricesTabComponent);
PrintPricesTab.displayName = 'PrintPricesTab';
