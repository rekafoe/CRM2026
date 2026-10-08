import React, { useMemo } from 'react';
import './PlotterCuttingCalculatorForm.css';
import { AppIcon } from '../../ui/AppIcon';
import { SelectedProductCard } from './SelectedProductCard';
import type { Material } from '../../../types';
import type { PlotterBareQuoteResponse } from '../../../services/pricing';

export type PlotterCalcDraft = {
  widthMm: string;
  heightMm: string;
  quantity: string;
  materialId: number | null;
  finish: string;
  levelKey: string;
  weeding: boolean;
  mounting: boolean;
  proof: boolean;
};

type LevelOption = { key: string; label: string; multiplier: number | null; name: string | null };

type Props = {
  selectedProductName: string;
  onOpenProductSelector: () => void;
  materials: Material[];
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
  const finishes = useMemo(() => {
    const set = new Set<string>();
    for (const material of materials) {
      const finish = String(material.finish || '').trim();
      if (finish) set.add(finish);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [materials]);

  const visibleMaterials = useMemo(() => {
    const finish = draft.finish.trim();
    return materials.filter((material) => !finish || String(material.finish || '').trim() === finish);
  }, [materials, draft.finish]);

  const levels = levelOptions(quote);
  const rollOps = quote?.mode === 'roll';

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
          Без печати: длина реза, расход выбранного материала и, для рулона, выборка, накатка и проверка. Ставки резки и
          этих операций задаются в разделе «Плоттерная резка». Цена материала — отпускная цена его карточки.
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
          <label>
            Количество
            <input
              className="form-input quantitySelector"
              inputMode="numeric"
              value={draft.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
            />
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
          {finishes.length > 0 ? (
            <label>
              Свойство
              <select className="form-input" value={draft.finish} onChange={(e) => onChange({ finish: e.target.value })}>
                <option value="">Все</option>
                {finishes.map((finish) => (
                  <option key={finish} value={finish}>
                    {finish}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="plotter-bare-calc__material">
            Материал
            <select
              className="form-input"
              value={draft.materialId ?? ''}
              onChange={(e) => onChange({ materialId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Выберите материал</option>
              {visibleMaterials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                  {material.material_kind === 'roll' ? ' · рулон' : ' · лист'}
                  {material.finish ? ` · ${material.finish}` : ''}
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
              disabled={!rollOps || !quote?.operations.weeding}
              onChange={(e) => onChange({ weeding: e.target.checked })}
            />
            Выборка
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.mounting}
              disabled={!rollOps || !quote?.operations.mounting}
              onChange={(e) => onChange({ mounting: e.target.checked })}
            />
            Накатка монтажной плёнки
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.proof}
              disabled={!rollOps || !quote?.operations.proof}
              onChange={(e) => onChange({ proof: e.target.checked })}
            />
            Проверка
          </label>
        </div>
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
