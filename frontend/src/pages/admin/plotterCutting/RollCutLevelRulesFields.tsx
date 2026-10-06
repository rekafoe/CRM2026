import React from 'react';
import { Button, DecimalNumberInput } from '../../../components/common';

export type CutLevelRuleRow = { max_cell_long_side_mm: number; multiplier: number };

type Props = {
  rules: CutLevelRuleRow[] | undefined;
  onChange: (next: CutLevelRuleRow[]) => void;
};

const DEFAULT_LEVELS: CutLevelRuleRow[] = [
  { max_cell_long_side_mm: 50, multiplier: 1.5 },
  { max_cell_long_side_mm: 150, multiplier: 1.25 },
  { max_cell_long_side_mm: 9999, multiplier: 1 },
];

function levelTitle(index: number, total: number): string {
  if (total <= 1) return 'Все размеры';
  if (index === 0) return 'Мелкие';
  if (index === total - 1) return 'Крупные';
  if (total === 3 && index === 1) return 'Средние';
  return 'Следующий размер';
}

export const RollCutLevelRulesFields: React.FC<Props> = ({ rules, onChange }) => {
  const rows = [...(rules ?? [])].sort((a, b) => a.max_cell_long_side_mm - b.max_cell_long_side_mm);

  const patchRow = (idx: number, patch: Partial<CutLevelRuleRow>) => {
    onChange(rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addBeforeLast = () => {
    if (rows.length === 0) {
      onChange(DEFAULT_LEVELS);
      return;
    }
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const suggested = prev ? Math.round((prev.max_cell_long_side_mm + last.max_cell_long_side_mm) / 2) : 150;
    const inserted = { max_cell_long_side_mm: Math.max(1, suggested), multiplier: 1.25 };
    onChange([...rows.slice(0, -1), inserted, last]);
  };

  if (rows.length === 0) {
    return (
      <div className="plotter-levels">
        <p className="plotter-block__hint">
          Сейчас ставка одна на все размеры. Можно умножить её для мелких наклеек: нож на них ездит дольше относительно
          метра плёнки.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange(DEFAULT_LEVELS)}>
          Разделить на мелкие, средние и крупные
        </Button>
      </div>
    );
  }

  return (
    <div className="plotter-levels">
      <p className="plotter-block__hint">
        Длинная сторона наклейки с вылетами. Подходит первая строка, чей порог не меньше этой стороны. Крупные стоят
        последними.
      </p>
      <ul className="plotter-levels__list">
        {rows.map((row, idx) => {
          return (
            <li key={idx} className="plotter-levels__row">
              <div className="plotter-levels__name">{levelTitle(idx, rows.length)}</div>
              <label className="plotter-levels__field">
                <span>До, мм</span>
                <DecimalNumberInput
                  className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--dim"
                  value={row.max_cell_long_side_mm}
                  emptyFallback={150}
                  minClamp={1}
                  fractionDigits={0}
                  onChange={(v) => {
                    const n = v ?? 150;
                    if (n > 0) patchRow(idx, { max_cell_long_side_mm: n });
                  }}
                />
              </label>
              <label className="plotter-levels__field">
                <span>Множитель</span>
                <DecimalNumberInput
                  className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--mult"
                  value={row.multiplier}
                  emptyFallback={1}
                  minClamp={0.01}
                  fractionDigits={2}
                  onChange={(v) => {
                    const n = v ?? 1;
                    if (n > 0) patchRow(idx, { multiplier: n });
                  }}
                />
              </label>
              <button type="button" className="plotter-rate-rows__remove" aria-label="Удалить уровень" onClick={() => removeRow(idx)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={addBeforeLast}>
        Добавить размер
      </Button>
    </div>
  );
};
