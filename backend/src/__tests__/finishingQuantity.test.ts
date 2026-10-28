import {
  enforceRequiredFinishing,
  flatFinishingUnits,
  getEffectiveFinishing,
  isTemplateFinishingRequired,
} from '../modules/pricing/services/finishingQuantity';

describe('finishing quantity', () => {
  it('считает fixed, per_order и per_hour один раз', () => {
    expect(flatFinishingUnits('per_order', 5)).toBe(5);
    expect(flatFinishingUnits('fixed', 2)).toBe(2);
    expect(flatFinishingUnits('per_hour', 5 / 60)).toBeCloseTo(5 / 60);
    expect(flatFinishingUnits('per_hour', 0)).toBe(0);
    expect(flatFinishingUnits('per_order', undefined)).toBe(1);
    expect(flatFinishingUnits('per_item', 5)).toBeNull();
    expect(flatFinishingUnits('per_cut', 5)).toBeNull();
  });

  it('добавляет обязательную услугу и не трогает необязательную', () => {
    const result = enforceRequiredFinishing(
      [{ service_id: 2, units_per_item: 1 }],
      [
        { service_id: 9, is_required: true, units_per_item: 5, variant_id: 3 },
        { service_id: 2, is_required: false, units_per_item: 4 },
      ],
    );
    expect(result).toEqual([
      { service_id: 2, units_per_item: 1 },
      { service_id: 9, units_per_item: 5, variant_id: 3 },
    ]);
  });

  it('подменяет количество, которое прислал клиент', () => {
    expect(isTemplateFinishingRequired({ is_required: 1 })).toBe(true);
    const result = enforceRequiredFinishing(
      [{ service_id: 9, units_per_item: 1, variant_id: 8 }],
      [{ service_id: 9, is_required: '1', units_per_item: 5, variant_id: 3 }],
    );
    expect(result).toEqual([{ service_id: 9, units_per_item: 5, variant_id: 3 }]);
  });

  it('сохраняет нулевую норму обязательной услуги', () => {
    const result = enforceRequiredFinishing(
      [{ service_id: 9, units_per_item: 5 }],
      [{ service_id: 9, is_required: true, units_per_item: 0 }],
    );
    expect(result).toEqual([{ service_id: 9, units_per_item: 0 }]);
  });

  it('не даёт клиенту обнулить обязательную услугу, если в шаблоне нет нормы', () => {
    const result = enforceRequiredFinishing(
      [{ service_id: 9, units_per_item: 0 }],
      [{ service_id: 9, is_required: true }],
    );
    expect(result).toEqual([{ service_id: 9 }]);
  });

  it('не подключает синтетические id плоттера', () => {
    expect(
      enforceRequiredFinishing([], [{ service_id: -910003, is_required: true, units_per_item: 5 }]),
    ).toEqual([]);
  });

  it('берёт общие услуги типа, пока у размера нет своего списка', () => {
    const common = [{ service_id: 9, units_per_item: 1 }];
    const own = [{ service_id: 4, units_per_item: 2 }];
    expect(getEffectiveFinishing({ common_finishing: common }, { finishing: own })).toEqual(common);
    expect(getEffectiveFinishing({ common_finishing: [] }, { finishing: own })).toEqual(own);
    expect(getEffectiveFinishing({ common_finishing: common }, { use_own_finishing: true, finishing: own })).toEqual(own);
    expect(getEffectiveFinishing({ common_finishing: common }, { use_own_finishing: false, finishing: own })).toEqual(common);
    expect(getEffectiveFinishing(null, { finishing: own })).toEqual(own);
  });
});
