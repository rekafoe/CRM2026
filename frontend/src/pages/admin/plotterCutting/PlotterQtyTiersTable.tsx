import React, { useMemo } from 'react';
import { Button, DecimalNumberInput } from '../../../components/common';
import { formatTierQuantity } from './plotterQtyTierFormat';

export type PlotterQtyTierRow = { min_quantity: number; price_per_unit: number };

type Props = {
  tiers: PlotterQtyTierRow[] | undefined;
  onChange: (next: PlotterQtyTierRow[]) => void;
  /** Подпись нижней границы (aria), напр. «Мин. пробег ножа (м)». */
  thresholdTitle: string;
  /** Подпись поля цены под диапазоном. */
  priceTitle: string;
  /** Единица в строке диапазона: «м», «м²», «шт». */
  rangeUnit: string;
  description: string;
  emptyHint?: string;
  thresholdFractionDigits?: number;
  priceFractionDigits?: number;
  addRangeLabel?: string;
  /** Краткая подпись таблицы (caption). */
  rangeColumnHeading?: string;
};

const UPPER_BOUND_TITLE =
  'При значении, совпадающем со следующим порогом, действует строка ниже.';

/** Табличное отображение: один ряд столбцов — в каждом «от … до …» и под ней цена. */
export const PlotterQtyTiersTable: React.FC<Props> = ({
  tiers,
  onChange,
  thresholdTitle,
  priceTitle,
  rangeUnit,
  description,
  emptyHint = 'Нет диапазонов — используйте добавление строки.',
  thresholdFractionDigits = 3,
  priceFractionDigits = 4,
  addRangeLabel = 'Добавить диапазон',
  rangeColumnHeading = 'Диапазоны и ставки по объёму',
}) => {
  const rows = tiers?.length ? tiers : [];
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.min_quantity - b.min_quantity),
    [rows],
  );

  const roundThreshold = (n: number) => {
    const p = 10 ** thresholdFractionDigits;
    return Math.round(n * p) / p;
  };

  const patchRow = (idxInSorted: number, patch: Partial<PlotterQtyTierRow>) => {
    const row = sortedRows[idxInSorted];
    const origIdx = rows.indexOf(row);
    if (origIdx < 0) return;
    onChange(rows.map((r, i) => (i === origIdx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idxInSorted: number) => {
    const row = sortedRows[idxInSorted];
    const origIdx = rows.indexOf(row);
    if (origIdx < 0) return;
    onChange(rows.filter((_, i) => i !== origIdx));
  };

  const addRow = () => {
    const lastMin = sortedRows.length ? sortedRows[sortedRows.length - 1].min_quantity : 0;
    onChange([...rows, { min_quantity: roundThreshold(lastMin + 1), price_per_unit: 0 }]);
  };

  const colCount = sortedRows.length > 0 ? sortedRows.length : 1;

  return (
    <div className="plotter-tier-table">
      <p className="plotter-tier-table__desc">{description}</p>
      <div className="plotter-tier-table__surface plotter-tier-table__surface--scroll">
        <table className="plotter-tier-table__table plotter-tier-table__table--columns">
          <caption className="plotter-tier-table__caption">{rangeColumnHeading}</caption>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={1} className="plotter-tier-table__empty">
                  {emptyHint}
                </td>
              </tr>
            ) : (
              <tr>
                {sortedRows.map((r, idx) => {
                  const upper = sortedRows[idx + 1]?.min_quantity;
                  const upperFmt =
                    upper !== undefined ? formatTierQuantity(upper, thresholdFractionDigits) : null;
                  return (
                    <td key={`${r.min_quantity}-${idx}`} className="plotter-tier-table__tier-cell">
                      <div className="plotter-tier-table__stack plotter-tier-table__stack--col">
                        <div className="plotter-tier-table__col-head">
                          <button
                            type="button"
                            className="plotter-tier-table__remove"
                            aria-label="Удалить диапазон"
                            title="Удалить"
                            onClick={() => removeRow(idx)}
                          >
                            ×
                          </button>
                        </div>
                        <div className="plotter-tier-table__band-line" aria-label="Диапазон порогов">
                          <span className="plotter-tier-table__band-txt">От</span>
                          <DecimalNumberInput
                            className="plotter-tier-table__field plotter-tier-table__field--band-lo"
                            value={r.min_quantity}
                            emptyFallback={0}
                            minClamp={0}
                            fractionDigits={thresholdFractionDigits}
                            placeholder="0"
                            aria-label={`${thresholdTitle} (нижняя граница)`}
                            onChange={(v) =>
                              patchRow(idx, {
                                min_quantity: roundThreshold(v ?? 0),
                              })
                            }
                          />
                          {upperFmt !== null ? (
                            <>
                              <span className="plotter-tier-table__band-txt">до</span>
                              <span
                                className="plotter-tier-table__band-upper"
                                title={UPPER_BOUND_TITLE}
                              >
                                {upperFmt}
                                {rangeUnit ? `\u00a0${rangeUnit}` : ''}
                              </span>
                            </>
                          ) : (
                            <span className="plotter-tier-table__band-rest">
                              {rangeUnit ? `\u00a0${rangeUnit}` : ''} и выше
                            </span>
                          )}
                        </div>
                        <div className="plotter-tier-table__price-line plotter-tier-table__price-line--col">
                          <span className="plotter-tier-table__price-caption">{priceTitle}</span>
                          <DecimalNumberInput
                            className="plotter-tier-table__field plotter-tier-table__field--price-col"
                            value={r.price_per_unit}
                            emptyFallback={0}
                            minClamp={0}
                            fractionDigits={priceFractionDigits}
                            aria-label={priceTitle}
                            onChange={(v) => patchRow(idx, { price_per_unit: v ?? 0 })}
                          />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={colCount} className="plotter-tier-table__toolbar">
                <Button type="button" variant="secondary" size="sm" onClick={addRow}>
                  {addRangeLabel}
                </Button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
