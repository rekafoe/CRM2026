import React from 'react';
import { Button, FormField, DecimalNumberInput } from '../../../components/common';

export type CutLevelRuleRow = { max_cell_long_side_mm: number; multiplier: number };

type Props = {
  rules: CutLevelRuleRow[] | undefined;
  onChange: (next: CutLevelRuleRow[]) => void;
};

export const RollCutLevelRulesFields: React.FC<Props> = ({ rules, onChange }) => {
  const rows = rules?.length ? rules : [];

  const patchRow = (idx: number, patch: Partial<CutLevelRuleRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    onChange([...rows, { max_cell_long_side_mm: 150, multiplier: 1.25 }]);
  };

  return (
    <div className="plotter-roll-cut-levels">
      <p className="plotter-roll-cut-levels__hint">
        Уровни резки для рулона: ставка за п.м. умножается, если длинная сторона ячейки (trim max + 2×вылет){' '}
        не превышает порога. Правила сортируются по порогу; подходит первое, где размер ≤ порога. Последняя
        строка с большим порогом (например 9999) и множителем 1 задаёт «крупный формат».
      </p>
      {rows.length === 0 ? (
        <p className="plotter-roll-cut-levels__empty">Нет правил — коэффициент 1.</p>
      ) : (
        <ul className="plotter-roll-cut-levels__list" aria-label="Пороги уровня резки">
          {rows.map((r, idx) => (
            <li key={idx} className="plotter-roll-cut-levels__row">
              <FormField label="Макс. длинная сторона ячейки, мм">
                <DecimalNumberInput
                  className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--dim"
                  value={r.max_cell_long_side_mm}
                  emptyFallback={150}
                  minClamp={1}
                  fractionDigits={3}
                  onChange={(v) => {
                    const n = v ?? 150;
                    if (n > 0) patchRow(idx, { max_cell_long_side_mm: n });
                  }}
                />
              </FormField>
              <FormField label="× к ставке">
                <DecimalNumberInput
                  className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--mult"
                  value={r.multiplier}
                  emptyFallback={1}
                  minClamp={0.01}
                  fractionDigits={4}
                  onChange={(v) => {
                    const n = v ?? 1;
                    if (n > 0) patchRow(idx, { multiplier: n });
                  }}
                />
              </FormField>
              <div className="plotter-roll-cut-levels__actions">
                <Button type="button" variant="secondary" onClick={() => removeRow(idx)}>
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="secondary" onClick={addRow}>
        Добавить правило
      </Button>
    </div>
  );
};
