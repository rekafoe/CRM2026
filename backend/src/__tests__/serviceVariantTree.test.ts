import {
  collectLeafVariantIds,
  collectNonLeafVariantIds,
  type ServiceVariantTreeRow,
} from '../modules/pricing/utils/serviceVariantTree';

const row = (
  id: number,
  variantName: string,
  parameters: Record<string, unknown> = {},
  parentVariantId: number | null = null,
): ServiceVariantTreeRow => ({
  id,
  variant_name: variantName,
  parameters,
  parent_variant_id: parentVariantId,
});

describe('service variant leaf pricing', () => {
  it('stores price on level 1 when it is the only level', () => {
    const rows = [row(1, 'Пружина')];
    expect([...collectNonLeafVariantIds(rows)]).toEqual([]);
    expect(collectLeafVariantIds(rows)).toEqual([1]);
  });

  it('moves pricing to level 2 when a type is added', () => {
    const rows = [
      row(1, 'Пружина'),
      row(2, 'Пружина', { type: 'Металлическая' }),
      row(3, 'Пружина', { type: 'Пластиковая' }),
    ];
    expect([...collectNonLeafVariantIds(rows)]).toEqual([1]);
    expect(collectLeafVariantIds(rows)).toEqual([2, 3]);
  });

  it('moves pricing to level 3 only for the branch that has children', () => {
    const rows = [
      row(1, 'Пружина'),
      row(2, 'Пружина', { type: 'Металлическая' }),
      row(3, 'Пружина', { type: 'Пластиковая' }),
      row(4, 'Пружина', { parentVariantId: 2, subType: 'Белая' }, 2),
      row(5, 'Пружина', { parentVariantId: 2, subType: 'Чёрная' }, 2),
    ];
    expect(new Set(collectNonLeafVariantIds(rows))).toEqual(new Set([1, 2]));
    expect(collectLeafVariantIds(rows)).toEqual([3, 4, 5]);
  });

  it('uses the earliest root candidate for legacy groups without an explicit root', () => {
    const rows = [
      row(10, 'Скоба', { type: 'Обычная' }),
      row(11, 'Скоба', { type: 'Премиум' }),
    ];
    expect([...collectNonLeafVariantIds(rows)]).toEqual([10]);
    expect(collectLeafVariantIds(rows)).toEqual([11]);
  });
});
