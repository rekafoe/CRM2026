import React, { useMemo } from 'react';
import { Button, DecimalNumberInput } from '../../../components/common';
import { formatTierQuantity } from './plotterQtyTierFormat';

export type PlotterQtyTierRow = { min_quantity: number; price_per_unit: number };

type Props = {
  tiers: PlotterQtyTierRow[] | undefined;
  onChange: (next: PlotterQtyTierRow[]) => void;
  thresholdTitle: string;
  priceTitle: string;
  rangeUnit: string;
  description: string;
  emptyHint?: string;
  thresholdFractionDigits?: number;
  priceFractionDigits?: number;
  addRangeLabel?: string;
  rangeColumnHeading?: string;
  /** Нельзя удалить последнюю строку (базовая ставка резки). */
  keepOneRow?: boolean;
};

/** Строки «от / до / цена». Верхняя граница — порог следующей строки. */
export const PlotterQtyTiersTable: React.FC<Props> = ({
  tiers,
  onChange,
  thresholdTitle,
  priceTitle,
  rangeUnit,
  description,
  emptyHint = 'Пока нет строк.',
  thresholdFractionDigits = 3,
  priceFractionDigits = 4,
  addRangeLabel = 'Добавить порог',
  rangeColumnHeading,
  keepOneRow = false,
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
    if (keepOneRow && sortedRows.length <= 1) return;
    const row = sortedRows[idxInSorted];
    const origIdx = rows.indexOf(row);
    if (origIdx < 0) return;
    onChange(rows.filter((_, i) => i !== origIdx));
  };

  const addRow = () => {
    const lastMin = sortedRows.length ? sortedRows[sortedRows.length - 1].min_quantity : 0;
    const step = thresholdFractionDigits === 0 ? 1 : 1;
    onChange([
      ...rows,
      {
        min_quantity: roundThreshold(lastMin + step),
        price_per_unit: sortedRows.length ? sortedRows[sortedRows.length - 1].price_per_unit : 0,
      },
    ]);
  };

  return (
    <div className="plotter-tier-table">
      {rangeColumnHeading ? <p className="plotter-rate-rows__title">{rangeColumnHeading}</p> : null}
      <p className="plotter-tier-table__desc">{description}</p>
      <div className="plotter-rate-rows__surface">
        <table className="plotter-rate-rows">
          <thead>
            <tr>
              <th>От, {rangeUnit}</th>
              <th>До</th>
              <th>{priceTitle}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="plotter-rate-rows__empty">
                  {emptyHint}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, idx) => {
                const upper = sortedRows[idx + 1]?.min_quantity;
                const upperText =
                  upper !== undefined
                    ? `${formatTierQuantity(upper, thresholdFractionDigits)} ${rangeUnit}`
                    : 'и выше';
                return (
                  <tr key={`${row.min_quantity}-${idx}`}>
                    <td>
                      <DecimalNumberInput
                        className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--qty"
                        value={row.min_quantity}
                        emptyFallback={0}
                        minClamp={0}
                        fractionDigits={thresholdFractionDigits}
                        aria-label={`${thresholdTitle}, строка ${idx + 1}`}
                        onChange={(v) => patchRow(idx, { min_quantity: roundThreshold(v ?? 0) })}
                      />
                    </td>
                    <td className="plotter-rate-rows__until">{upperText}</td>
                    <td>
                      <DecimalNumberInput
                        className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--price"
                        value={row.price_per_unit}
                        emptyFallback={0}
                        minClamp={0}
                        fractionDigits={priceFractionDigits}
                        aria-label={`${priceTitle}, строка ${idx + 1}`}
                        onChange={(v) => patchRow(idx, { price_per_unit: v ?? 0 })}
                      />
                    </td>
                    <td>
                      {!(keepOneRow && sortedRows.length <= 1) ? (
                        <button
                          type="button"
                          className="plotter-rate-rows__remove"
                          aria-label="Удалить порог"
                          onClick={() => removeRow(idx)}
                        >
                          ×
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={addRow}>
        {addRangeLabel}
      </Button>
    </div>
  );
};
