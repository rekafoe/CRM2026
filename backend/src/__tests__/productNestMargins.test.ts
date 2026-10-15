import {
  computeOptimizedRollFeedMeters,
  PLOTTER_DEFAULTS,
  resolveProductNestMargins,
  resolvePlotterMargins,
} from '../modules/pricing/services/plotterLayout';
import { resolveWarehouseFeedMeters } from '../modules/pricing/services/finishingPerM2';

describe('resolveProductNestMargins', () => {
  it('без плоттера не подставляет дефолты 25/2 — только явный cut_margin', () => {
    expect(resolveProductNestMargins(false, 'roll', undefined, undefined)).toEqual({
      edgeMm: 0,
      gapMm: 0,
    });
    expect(resolveProductNestMargins(false, 'roll', 10, 3)).toEqual({ edgeMm: 10, gapMm: 3 });
  });

  it('с плоттером берёт те же поля, что резка (рулон 25/2)', () => {
    expect(resolveProductNestMargins(true, 'roll', undefined, undefined)).toEqual(PLOTTER_DEFAULTS.roll);
    expect(resolveProductNestMargins(true, 'roll', undefined, undefined)).toEqual(
      resolvePlotterMargins('roll', undefined, undefined),
    );
    expect(resolveProductNestMargins(true, 'sheet', undefined, undefined)).toEqual(PLOTTER_DEFAULTS.sheet);
  });

  it('ламинация roll_feed на плоттерном продукте не недосписывает относительно плёнки', () => {
    const trimMm = { width: 105, height: 105 };
    const quantity = 100;
    const rollWidthMm = 630;
    const layout = {
      trimMm,
      bleedMm: 0,
      quantity,
      margins: resolveProductNestMargins(true, 'roll', undefined, undefined),
    };
    const zeroMarginLayout = {
      ...layout,
      margins: resolveProductNestMargins(false, 'roll', undefined, undefined),
    };

    const printFeed = computeOptimizedRollFeedMeters({
      rollWidthMm,
      trimMm,
      bleedMm: 0,
      quantity,
      margins: resolvePlotterMargins('roll', undefined, undefined),
    });
    const finishingFeed = resolveWarehouseFeedMeters({
      rollWidthMm,
      layout,
    });
    const buggyFinishingFeed = resolveWarehouseFeedMeters({
      rollWidthMm,
      layout: zeroMarginLayout,
    });

    expect(finishingFeed.feedMeters).toBeCloseTo(printFeed.feedMeters, 4);
    expect(buggyFinishingFeed.feedMeters).toBeLessThan(printFeed.feedMeters * 0.9);
  });
});
