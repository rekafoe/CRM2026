import React from 'react';
import { PlotterQtyTiersTable } from './PlotterQtyTiersTable';
import type { PlotterCuttingModeTariffApi } from '../../../services/pricing';
import { tierRateAtOrderQty } from './plotterTierQty';

type Props = {
  rollTariff: PlotterCuttingModeTariffApi;
  onChangeRollTariff: (next: PlotterCuttingModeTariffApi) => void;
};

export const PlotterRollFinishingRanges: React.FC<Props> = ({ rollTariff, onChangeRollTariff }) => {
  const patchWeeding = (weeding_tiers: NonNullable<PlotterCuttingModeTariffApi['weeding_tiers']>) =>
    onChangeRollTariff({
      ...rollTariff,
      weeding_tiers,
      weeding_price_per_item: weeding_tiers.length ? tierRateAtOrderQty(weeding_tiers, 1) : null,
    });

  const patchMounting = (mounting_tiers: NonNullable<PlotterCuttingModeTariffApi['mounting_tiers']>) =>
    onChangeRollTariff({
      ...rollTariff,
      mounting_tiers,
      mounting_price_per_item: mounting_tiers.length ? tierRateAtOrderQty(mounting_tiers, 1) : null,
    });

  return (
    <section className="plotter-roll-finishing">
      <div className="plotter-roll-finishing__header">
        <h4 className="plotter-tariff-mode__subtitle">Выборка / накатка — диапазоны за изделие</h4>
        <span className="plotter-roll-finishing__badge">Рулонная резка</span>
      </div>
      <p className="plotter-roll-finishing__hint">
        Порог по <strong>тиражу заказа (шт)</strong>. При включении чекбокса в калькуляторе к позиции добавляется
        строка из подходящего диапазона.
      </p>

      <div className="plotter-roll-finishing__tier-blocks">
        <div className="plotter-roll-finishing__tier-block">
          <PlotterQtyTiersTable
            tiers={rollTariff.weeding_tiers}
            onChange={patchWeeding}
            thresholdTitle="Тираж от, шт"
            priceTitle="Цена за изделие"
            rangeUnit="шт"
            thresholdFractionDigits={0}
            description="Выборка винила."
            emptyHint="Нет диапазонов — в расчёт не попадёт (или добавьте порог от 1 шт.)."
          />
        </div>
        <div className="plotter-roll-finishing__tier-block">
          <PlotterQtyTiersTable
            tiers={rollTariff.mounting_tiers}
            onChange={patchMounting}
            thresholdTitle="Тираж от, шт"
            priceTitle="Цена за изделие"
            rangeUnit="шт"
            thresholdFractionDigits={0}
            description="Накатка монтажной плёнки."
            emptyHint="Нет диапазонов — в расчёт не попадёт (или добавьте порог от 1 шт.)."
          />
        </div>
      </div>
    </section>
  );
};

export default PlotterRollFinishingRanges;
