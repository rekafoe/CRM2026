import React from 'react';
import { FormField, DecimalNumberInput } from '../../../components/common';
import { RollCutLevelRulesFields } from './RollCutLevelRulesFields';
import { PlotterQtyTiersTable } from './PlotterQtyTiersTable';
import type { PlotterCuttingModeTariffApi } from '../../../services/pricing';
import type { PlotterTariffMaterialOption } from './usePlotterCuttingTariffsForm';
import { plotterVolumeTierThresholdTitle, plotterVolumeTierTableHint } from './plotterTierQty';

export type PlotterTariffModeBlockProps = {
  title: string;
  value: PlotterCuttingModeTariffApi;
  onChange: (next: PlotterCuttingModeTariffApi) => void;
  materials: PlotterTariffMaterialOption[];
  showRollCutLevels?: boolean;
};

export const PlotterTariffModeBlock: React.FC<PlotterTariffModeBlockProps> = ({
  title,
  value,
  onChange,
  materials,
  showRollCutLevels,
}) => {
  const set = (patch: Partial<PlotterCuttingModeTariffApi>) => onChange({ ...value, ...patch });

  return (
    <section className="plotter-tariff-mode" aria-labelledby={`plotter-h-${value.mode}`}>
      <h3 className="plotter-tariff-mode__title" id={`plotter-h-${value.mode}`}>
        {title}
      </h3>
      <div className="plotter-tariff-mode__grid">
        <FormField label="Название в расчёте">
          <input
            className="form-input plotter-tariffs-form__field-text plotter-tariffs-form__inp-text"
            value={value.label}
            onChange={(e) => set({ label: e.target.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Цена за п.м. (база)">
          <DecimalNumberInput
            className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--price"
            value={value.price_per_meter}
            emptyFallback={0}
            minClamp={0}
            fractionDigits={4}
            onChange={(v) => set({ price_per_meter: v ?? 0 })}
          />
        </FormField>
        <FormField label="Основа метража">
          <select
            className="form-input plotter-tariffs-form__inp-select"
            value={value.meter_basis}
            onChange={(e) =>
              set({ meter_basis: e.target.value === 'feed' ? 'feed' : 'knife_path' })
            }
          >
            <option value="knife_path">Пробег ножа (knife_path)</option>
            <option value="feed">Подача материала (feed)</option>
          </select>
        </FormField>
        <FormField label="Ось тиражных ступеней">
          <select
            className="form-input plotter-tariffs-form__inp-select"
            value={value.volume_tier_basis ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              set({
                volume_tier_basis:
                  v === 'knife_m' || v === 'feed_m' || v === 'cut_area_m2' ? v : undefined,
              });
            }}
          >
            <option value="">Как «Основа метража» (нож или подача)</option>
            <option value="knife_m">Пробег ножа (м)</option>
            <option value="feed_m">Подача материала (м)</option>
            <option value="cut_area_m2">Площадь изделия trim (м²) × тираж</option>
          </select>
        </FormField>
        <div className="plotter-tariff-mode__volume-tiers">
          <h4 className="plotter-tariff-mode__subtitle">Диапазоны цен по объёму (резка)</h4>
          <PlotterQtyTiersTable
            tiers={value.volume_tiers}
            onChange={(volume_tiers) => set({ volume_tiers })}
            thresholdTitle={plotterVolumeTierThresholdTitle(
              value.volume_tier_basis,
              value.meter_basis
            )}
            priceTitle="Цена за п.м."
            rangeUnit={value.volume_tier_basis === 'cut_area_m2' ? 'м²' : 'м'}
            description={plotterVolumeTierTableHint(value.volume_tier_basis)}
          />
        </div>
        <FormField label="Мин. объём (п.м.)">
          <DecimalNumberInput
            className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--qty"
            value={value.min_quantity}
            emptyFallback={1}
            fractionDigits={3}
            onChange={(v) => {
              const n = v ?? 1;
              set({
                min_quantity: n > 0 ? Math.round(n * 1000) / 1000 : 1,
              });
            }}
          />
        </FormField>
        <FormField label="Макс. объём (п.м.), пусто — без лимита">
          <DecimalNumberInput
            className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--qty"
            nullable
            value={value.max_quantity ?? null}
            onChange={(v) => set({ max_quantity: v })}
          />
        </FormField>
        <FormField label="% оператора">
          <DecimalNumberInput
            className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--pct"
            nullable
            value={value.operator_percent ?? null}
            minClamp={0}
            fractionDigits={2}
            onChange={(v) => set({ operator_percent: v })}
          />
        </FormField>
        <FormField label="Материал списания (опц.)">
          <select
            className="form-input plotter-tariffs-form__inp-select"
            value={value.material_id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              set({ material_id: v === '' ? null : Number(v) });
            }}
          >
            <option value="">—</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Расход на ед. операции">
          <DecimalNumberInput
            className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--price"
            nullable
            value={value.qty_per_item ?? null}
            minClamp={0}
            fractionDigits={4}
            onChange={(v) => set({ qty_per_item: v })}
          />
        </FormField>
      </div>
      {showRollCutLevels ? (
        <div className="plotter-tariff-mode__cut-levels">
          <h4 className="plotter-tariff-mode__subtitle">Уровни резки (только рулон)</h4>
          <RollCutLevelRulesFields
            rules={value.cut_level_rules}
            onChange={(cut_level_rules) => set({ cut_level_rules })}
          />
        </div>
      ) : null}
    </section>
  );
};
