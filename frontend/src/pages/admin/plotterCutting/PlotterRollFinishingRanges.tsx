import React from 'react';
import { PlotterQtyTiersTable } from './PlotterQtyTiersTable';
import type { PlotterCuttingModeTariffApi } from '../../../services/pricing';
import { tierRateAtOrderQty } from './plotterTierQty';

type Props = {
  rollTariff: PlotterCuttingModeTariffApi;
  onChangeRollTariff: (next: PlotterCuttingModeTariffApi) => void;
};

function exampleLine(tiers: Array<{ min_quantity: number; price_per_unit: number }> | undefined): string | null {
  if (!tiers?.length) return null;
  const rate = tierRateAtOrderQty(tiers, 50);
  return `50 шт → ${rate} за изделие`;
}

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

  const patchProof = (proof_tiers: NonNullable<PlotterCuttingModeTariffApi['proof_tiers']>) =>
    onChangeRollTariff({
      ...rollTariff,
      proof_tiers,
      proof_price_per_item: proof_tiers.length ? tierRateAtOrderQty(proof_tiers, 1) : null,
    });

  const weedingExample = exampleLine(rollTariff.weeding_tiers);
  const mountingExample = exampleLine(rollTariff.mounting_tiers);

  return (
    <section className="plotter-roll-finishing">
      <div className="plotter-roll-finishing__header">
        <h4 className="plotter-tariff-mode__subtitle">Выборка, накатка и проверка</h4>
      </div>
      <p className="plotter-block__hint">
        Только для рулона. Порог — тираж в штуках. Пустая таблица значит, что этой галочки в калькуляторе нет.
      </p>
      <div className="plotter-roll-finishing__tier-blocks">
        <div className="plotter-roll-finishing__tier-block">
          <PlotterQtyTiersTable
            tiers={rollTariff.weeding_tiers}
            onChange={patchWeeding}
            thresholdTitle="Тираж от"
            priceTitle="Цена за изделие"
            rangeUnit="шт"
            thresholdFractionDigits={0}
            rangeColumnHeading="Выборка"
            description="Снять лишний винил вокруг контура."
            emptyHint="Пока пусто — в калькуляторе выборки не будет."
            addRangeLabel="Добавить порог выборки"
          />
          {weedingExample ? <p className="plotter-example">{weedingExample}</p> : null}
        </div>
        <div className="plotter-roll-finishing__tier-block">
          <PlotterQtyTiersTable
            tiers={rollTariff.mounting_tiers}
            onChange={patchMounting}
            thresholdTitle="Тираж от"
            priceTitle="Цена за изделие"
            rangeUnit="шт"
            thresholdFractionDigits={0}
            rangeColumnHeading="Накатка"
            description="Прикатать монтажную плёнку."
            emptyHint="Пока пусто — в калькуляторе накатки не будет."
            addRangeLabel="Добавить порог накатки"
          />
          {mountingExample ? <p className="plotter-example">{mountingExample}</p> : null}
        </div>
        <div className="plotter-roll-finishing__tier-block">
          <PlotterQtyTiersTable
            tiers={rollTariff.proof_tiers}
            onChange={patchProof}
            thresholdTitle="Тираж от"
            priceTitle="Цена за изделие"
            rangeUnit="шт"
            thresholdFractionDigits={0}
            rangeColumnHeading="Проверка"
            description="Проверить макет перед резкой."
            emptyHint="Пока пусто — в калькуляторе проверки не будет."
            addRangeLabel="Добавить порог проверки"
          />
        </div>
      </div>
    </section>
  );
};

export default PlotterRollFinishingRanges;
