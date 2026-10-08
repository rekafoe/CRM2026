import React from 'react';
import './PlotterCuttingCalculatorForm.css';
import { AppIcon } from '../../ui/AppIcon';
import { SelectedProductCard } from './SelectedProductCard';
import type { PlotterBareQuoteResponse, PlotterCalculatorMaterial } from '../../../services/pricing';

export type PlotterCalcDraft = {
  widthMm: string;
  heightMm: string;
  quantity: string;
  materialId: number | null;
  levelKey: string;
  weeding: boolean;
  mounting: boolean;
  proof: boolean;
};

type LevelOption = { key: string; label: string; multiplier: number | null; name: string | null };

type Props = {
  selectedProductName: string;
  onOpenProductSelector: () => void;
  materials: PlotterCalculatorMaterial[];
  loading: boolean;
  error: string | null;
  draft: PlotterCalcDraft;
  onChange: (patch: Partial<PlotterCalcDraft>) => void;
  quote: PlotterBareQuoteResponse | null;
};

function levelOptions(quote: PlotterBareQuoteResponse | null): LevelOption[] {
  const rules = quote?.cut_level_rules ?? [];
  const auto: LevelOption = { key: 'auto', label: 'По размеру', multiplier: null, name: null };
  const rows = rules.map((rule, index) => {
    const name = rule.name?.trim() || `${index + 1}-й уровень`;
    return {
      key: `rule-${index}`,
      label: `${name} (до ${rule.max_cell_long_side_mm} мм, ×${rule.multiplier})`,
      multiplier: rule.multiplier,
      name,
    };
  });
  return [auto, ...rows];
}

export function levelChoice(draft: PlotterCalcDraft, quote: PlotterBareQuoteResponse | null) {
  const option = levelOptions(quote).find((row) => row.key === draft.levelKey) ?? levelOptions(quote)[0];
  return { multiplier: option?.multiplier ?? null, name: option?.name ?? null };
}

function stepQuantity(current: string, delta: number): string {
  const base = Math.floor(Number(current));
  const start = Number.isFinite(base) && base > 0 ? base : 0;
  return String(Math.max(1, start + delta));
}

export const PlotterCuttingCalculatorForm: React.FC<Props> = ({
  selectedProductName,
  onOpenProductSelector,
  materials,
  loading,
  error,
  draft,
  onChange,
  quote,
}) => {
  const levels = levelOptions(quote);

  return (
    <div className="calculator-section-group calculator-section-unified">
      <div className="section-group-header">
        <h3>
          <AppIcon name="scissors" size="xs" /> Плоттерная резка
        </h3>
      </div>
      <div className="section-group-content plotter-bare-calc">
        <SelectedProductCard
          productType="plotter"
          displayName={selectedProductName || 'Плоттерная резка'}
          onOpenSelector={onOpenProductSelector}
        />
        <p className="plotter-bare-calc__lead">
          Резка плёнки для аппликации. Ставки реза, уровней, выборки, накатки и проверки берутся из раздела «Плоттерная
          резка». Материалы отмечаются в продуктах. «Без материала» считает только резку.
        </p>
        {error ? <p className="validation-error">{error}</p> : null}
        <div className="plotter-bare-calc__grid">
          <label>
            Ширина, мм
            <input
              className="form-input"
              inputMode="decimal"
              value={draft.widthMm}
              onChange={(e) => onChange({ widthMm: e.target.value })}
            />
          </label>
          <label>
            Длина, мм
            <input
              className="form-input"
              inputMode="decimal"
              value={draft.heightMm}
              onChange={(e) => onChange({ heightMm: e.target.value })}
            />
          </label>
          <label className="param-group param-group--quantity">
            Количество, шт
            <div className="quantity-controls">
              <button
                type="button"
                className="quantity-btn quantity-btn-minus"
                aria-label="Уменьшить количество"
                disabled={Math.floor(Number(draft.quantity)) <= 1}
                onClick={() => onChange({ quantity: stepQuantity(draft.quantity, -1) })}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                className="quantity-input"
                value={draft.quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
                onBlur={() => {
                  const next = Math.floor(Number(draft.quantity));
                  onChange({ quantity: next > 0 ? String(next) : '1' });
                }}
              />
              <button
                type="button"
                className="quantity-btn quantity-btn-plus"
                aria-label="Увеличить количество"
                onClick={() => onChange({ quantity: stepQuantity(draft.quantity, 1) })}
              >
                +
              </button>
            </div>
          </label>
          <label>
            Уровень сложности
            <select
              className="form-input"
              value={levels.some((row) => row.key === draft.levelKey) ? draft.levelKey : 'auto'}
              onChange={(e) => onChange({ levelKey: e.target.value })}
              disabled={levels.length < 2}
            >
              {levels.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="plotter-bare-calc__material">
            Материал
            <select
              className="form-input"
              value={draft.materialId ?? ''}
              onChange={(e) =>
                onChange(
                  e.target.value
                    ? { materialId: Number(e.target.value) }
                    : { materialId: null, weeding: false, mounting: false, proof: false },
                )
              }
            >
              <option value="">Без материала</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="plotter-bare-calc__ops">
          <label>
            <input
              type="checkbox"
              checked={draft.weeding}
              disabled={draft.materialId == null || !quote?.operations.weeding}
              onChange={(e) => onChange({ weeding: e.target.checked })}
            />
            Выборка
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.mounting}
              disabled={draft.materialId == null || !quote?.operations.mounting}
              onChange={(e) => onChange({ mounting: e.target.checked })}
            />
            Накатка монтажной плёнки
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.proof}
              disabled={draft.materialId == null || !quote?.operations.proof}
              onChange={(e) => onChange({ proof: e.target.checked })}
            />
            Проверка
          </label>
        </div>
        {materials.length === 0 ? (
          <p className="plotter-bare-calc__status">
            Список плёнок пуст. Отметьте рулоны в продуктах, кнопка «Материалы плоттера».
          </p>
        ) : null}
        {draft.materialId != null && !materials.some((row) => row.id === draft.materialId) ? (
          <p className="plotter-bare-calc__status">Этот рулон больше не отмечен для калькулятора.</p>
        ) : null}
        {loading ? <p className="plotter-bare-calc__status">Считаем…</p> : null}
        {quote?.warnings?.length ? (
          <ul className="plotter-bare-calc__warnings">
            {quote.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {quote ? (
          <ul className="plotter-bare-calc__lines">
            {quote.lines.map((line) => (
              <li key={line.key}>
                <span>{line.title}</span>
                <span>
                  {line.quantity} {line.unit} × {line.unitPrice.toFixed(2)} = {line.total.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
