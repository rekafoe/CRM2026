/**
 * После be373bb0 обязательная отделка всегда в расчёте, но без тарифа
 * (цены только на вариантах / base rate 0) раньше молча давала $0.
 */
import { enforceRequiredFinishing } from '../modules/pricing/services/finishingQuantity'

describe('required finishing must stay billable', () => {
  it('strips client units_per_item:0 when template has no units', () => {
    expect(
      enforceRequiredFinishing(
        [{ service_id: 42, units_per_item: 0, variant_id: 7 }],
        [{ service_id: 42, is_required: true }],
      ),
    ).toEqual([{ service_id: 42, variant_id: 7 }])
  })

  it('keeps template units including explicit zero', () => {
    expect(
      enforceRequiredFinishing(
        [{ service_id: 42, units_per_item: 9 }],
        [{ service_id: 42, is_required: 1, units_per_item: 0 }],
      ),
    ).toEqual([{ service_id: 42, units_per_item: 0 }])
  })

  it('locks template variant on required service', () => {
    expect(
      enforceRequiredFinishing(
        [{ service_id: 42, variant_id: 99, units_per_item: 1 }],
        [{ service_id: 42, is_required: true, variant_id: 3, units_per_item: 1 }],
      ),
    ).toEqual([{ service_id: 42, variant_id: 3, units_per_item: 1 }])
  })
})
