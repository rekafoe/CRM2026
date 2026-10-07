import React from 'react';
import { FormField, DecimalNumberInput } from '../../../components/common';
import { RollCutLevelRulesFields } from './RollCutLevelRulesFields';
import { PlotterQtyTiersTable } from './PlotterQtyTiersTable';
import type { PlotterCuttingModeTariffApi } from '../../../services/pricing';
import type { PlotterTariffMaterialOption } from './usePlotterCuttingTariffsForm';
import {
  applyAreaDiscount,
  applyMeasure,
  commitCuttingRows,
  measureLabel,
  visibleCuttingRows,
  type PlotterMeasure,
} from './plotterTariffEdit';

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
  const measure: PlotterMeasure = value.meter_basis === 'feed' ? 'feed' : 'knife_path';
  const areaDiscount = value.volume_tier_basis === 'cut_area_m2';
  const rows = visibleCuttingRows(value);
  const billed = measureLabel(measure);

  return (
    <section className="plotter-tariff-mode" aria-labelledby={`plotter-h-${value.mode}`}>
      <h3 className="plotter-tariff-mode__title" id={`plotter-h-${value.mode}`}>
        {title}
      </h3>

      <div className="plotter-block">
        <h4 className="plotter-tariff-mode__subtitle">Резка</h4>
        <p className="plotter-block__hint">
          Цена умножается на метры {billed}. Длина реза — путь ножа вокруг каждой наклейки. Подача плёнки — сколько
          метров рулона отмоталось.
        </p>
        <div className="plotter-measure" role="radiogroup" aria-label="Что умножать на ставку">
          <button
            type="button"
            className={measure === 'knife_path' ? 'plotter-measure__btn is-active' : 'plotter-measure__btn'}
            aria-pressed={measure === 'knife_path'}
            onClick={() => onChange(applyMeasure(value, 'knife_path'))}
          >
            По длине реза
          </button>
          <button
            type="button"
            className={measure === 'feed' ? 'plotter-measure__btn is-active' : 'plotter-measure__btn'}
            aria-pressed={measure === 'feed'}
            onClick={() => onChange(applyMeasure(value, 'feed'))}
          >
            По подаче плёнки
          </button>
        </div>
        <PlotterQtyTiersTable
          tiers={rows}
          keepOneRow
          onChange={(next) => onChange(commitCuttingRows(value, next))}
          thresholdTitle={areaDiscount ? 'Площадь от' : 'Метры от'}
          priceTitle="Цена за метр"
          rangeUnit={areaDiscount ? 'м²' : 'м'}
          thresholdFractionDigits={areaDiscount ? 3 : 3}
          description={
            areaDiscount
              ? 'Порог строки — суммарная площадь изделий в заказе. Цена строки всё равно за метр ' + billed + '.'
              : 'Первая строка — обычная ставка. Следующие пороги снижают её, когда метров ' + billed + ' становится больше.'
          }
          addRangeLabel="Добавить порог"
        />
        <label className="plotter-block__check">
          <input
            type="checkbox"
            checked={areaDiscount}
            onChange={(e) => onChange(applyAreaDiscount(value, e.target.checked))}
          />
          <span>Пороги скидки считать по площади изделий, а не по метрам</span>
        </label>
      </div>

      {showRollCutLevels ? (
        <div className="plotter-tariff-mode__cut-levels">
          <h4 className="plotter-tariff-mode__subtitle">Уровни резки</h4>
          <RollCutLevelRulesFields
            rules={value.cut_level_rules}
            onChange={(cut_level_rules) => onChange({ ...value, cut_level_rules })}
          />
        </div>
      ) : null}

      <details className="plotter-extra">
        <summary>Списание и зарплата</summary>
        <div className="plotter-extra__grid">
          <FormField label="Название в расчёте">
            <input
              className="form-input plotter-tariffs-form__field-text plotter-tariffs-form__inp-text"
              value={value.label}
              onChange={(e) => onChange({ ...value, label: e.target.value })}
              autoComplete="off"
            />
          </FormField>
          <FormField label={`Минимум к оплате, м ${billed}`}>
            <DecimalNumberInput
              className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--qty"
              value={value.min_quantity}
              emptyFallback={1}
              fractionDigits={3}
              onChange={(v) => {
                const n = v ?? 1;
                onChange({ ...value, min_quantity: n > 0 ? Math.round(n * 1000) / 1000 : 1 });
              }}
            />
          </FormField>
          <FormField label="Максимум, м. Пусто — без потолка">
            <DecimalNumberInput
              className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--qty"
              nullable
              value={value.max_quantity ?? null}
              onChange={(v) => onChange({ ...value, max_quantity: v })}
            />
          </FormField>
          <FormField label="Процент оператора">
            <DecimalNumberInput
              className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--pct"
              nullable
              value={value.operator_percent ?? null}
              minClamp={0}
              fractionDigits={2}
              onChange={(v) => onChange({ ...value, operator_percent: v })}
            />
          </FormField>
          <FormField label="Материал списания">
            <select
              className="form-input plotter-tariffs-form__inp-select"
              value={value.material_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ ...value, material_id: v === '' ? null : Number(v) });
              }}
            >
              <option value="">Не списывать</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Расход материала на 1 м">
            <DecimalNumberInput
              className="form-input plotter-tariffs-form__inp-num plotter-tariffs-form__inp-num--price"
              nullable
              value={value.qty_per_item ?? null}
              minClamp={0}
              fractionDigits={4}
              onChange={(v) => onChange({ ...value, qty_per_item: v })}
            />
          </FormField>
        </div>
      </details>
    </section>
  );
};
