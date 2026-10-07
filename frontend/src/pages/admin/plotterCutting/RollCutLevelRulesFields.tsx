import React from 'react';
import { Button, DecimalNumberInput } from '../../../components/common';

export type CutLevelRuleRow = { max_cell_long_side_mm: number; multiplier: number; name?: string };

type Props = {
  rules: CutLevelRuleRow[] | undefined;
  onChange: (next: CutLevelRuleRow[]) => void;
};

function levelOrdinal(index: number): string {
  return `${index + 1}-й уровень`;
}

export const RollCutLevelRulesFields: React.FC<Props> = ({ rules, onChange }) => {
  const rows = rules ?? [];

  const patchRow = (idx: number, patch: Partial<CutLevelRuleRow>) => {
    onChange(rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addLevel = () => {
    const last = rows[rows.length - 1];
    const suggested = last ? Math.max(1, Math.round(last.max_cell_long_side_mm / 2)) : 500;
    onChange([
      ...rows,
      { name: '', max_cell_long_side_mm: suggested, multiplier: 1 },
    ]);
  };

  if (rows.length === 0) {
    return (
      <div className="plotter-levels">
        <p className="plotter-block__hint">
          Сейчас ставка одна на все размеры. Добавьте уровни, если мелкий контур должен стоить дороже.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={addLevel}>
          Добавить уровень
        </Button>
      </div>
    );
  }

  return (
    <div className="plotter-levels">
      <p className="plotter-block__hint">
        Название — подпись уровня. В цену идёт порог: наклейка попадает в самый узкий уровень, который её ещё
        покрывает.
      </p>
      <ul className="plotter-levels__list">
        {rows.map((row, idx) => (
          <li key={idx} className="plotter-levels__row">
            <div className="plotter-levels__ordinal">{levelOrdinal(idx)}</div>
            <label className="plotter-levels__field plotter-levels__name-field">
              <span>Название</span>
              <input
                className="form-input plotter-tariffs-form__field-text plotter-tariffs-form__inp-text"
                value={row.name ?? ''}
                placeholder="например, >50 см"
                autoComplete="off"
                onChange={(e) => patchRow(idx, { name: e.target.value })}
              />
            </label>
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
        ))}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={addLevel}>
        Добавить уровень
      </Button>
    </div>
  );
};
