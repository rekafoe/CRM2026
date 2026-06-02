import {
  getCoverAllowedMaterialIds,
  isSeparateCoverMode,
  resolveCoverMaterialIdForPricing,
} from '../utils/multipageCoverMaterials';

describe('multipageCoverMaterials', () => {
  it('isSeparateCoverMode', () => {
    expect(isSeparateCoverMode({ mode: 'separate' })).toBe(true);
    expect(isSeparateCoverMode({ mode: 'none' })).toBe(false);
  });

  it('getCoverAllowedMaterialIds prefers allowed list', () => {
    expect(
      getCoverAllowedMaterialIds({
        mode: 'separate',
        allowed_material_ids: [10, 20],
        material_id: 99,
      })
    ).toEqual([10, 20]);
  });

  it('getCoverAllowedMaterialIds falls back to material_id', () => {
    expect(
      getCoverAllowedMaterialIds({ mode: 'separate', material_id: 5 })
    ).toEqual([5]);
  });

  it('resolveCoverMaterialIdForPricing uses cover_material_id when allowed', () => {
    expect(
      resolveCoverMaterialIdForPricing(
        { mode: 'separate', allowed_material_ids: [10, 20], material_id: 10 },
        { cover_material_id: 20, material_id: 1 }
      )
    ).toBe(20);
  });

  it('resolveCoverMaterialIdForPricing rejects disallowed cover_material_id', () => {
    expect(
      resolveCoverMaterialIdForPricing(
        { mode: 'separate', allowed_material_ids: [10] },
        { cover_material_id: 99, material_id: 1 }
      )
    ).toBe(10);
  });
});
