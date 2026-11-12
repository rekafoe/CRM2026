import {
  enforceRequiredFinishing,
  flatFinishingUnits,
  getEffectiveFinishing,
  isTemplateFinishingRequired,
  resolveCountableFinishingUnits,
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

  it('не подключает синтетические id плоттера', () => {
    expect(
      enforceRequiredFinishing([], [{ service_id: -910003, is_required: true, units_per_item: 5 }]),
    ).toEqual([]);
  });

  it('без quantity_scope считает per_item на тираж, а per_cut и fixed один раз', () => {
    expect(resolveCountableFinishingUnits('per_item', 100, 2, undefined)).toBe(200);
    expect(resolveCountableFinishingUnits('per_cut', 100, 3, undefined)).toBe(3);
    expect(resolveCountableFinishingUnits('fixed', 100, 1, undefined)).toBe(1);
    expect(resolveCountableFinishingUnits('per_order', 50, 0, undefined)).toBe(0);
    expect(resolveCountableFinishingUnits('per_hour', 4, 5 / 60, undefined)).toBeCloseTo(5 / 60);
  });

  it('quantity_scope=item умножает норму на тираж, run оставляет её один раз', () => {
    expect(resolveCountableFinishingUnits('per_cut', 100, 3, 'item')).toBe(300);
    expect(resolveCountableFinishingUnits('fixed', 100, 1, 'item')).toBe(100);
    expect(resolveCountableFinishingUnits('per_hour', 10, 0.5, 'item')).toBe(5);
    expect(resolveCountableFinishingUnits('per_item', 100, 2, 'run')).toBe(2);
    expect(resolveCountableFinishingUnits('per_item', 10, 0, 'item')).toBe(0);
  });

  it('переносит quantity_scope обязательной услуги', () => {
    expect(
      enforceRequiredFinishing(
        [{ service_id: 9, units_per_item: 1 }],
        [{ service_id: 9, is_required: true, units_per_item: 2, quantity_scope: 'item' }],
      ),
    ).toEqual([{ service_id: 9, units_per_item: 2, quantity_scope: 'item' }]);
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
