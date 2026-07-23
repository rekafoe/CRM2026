import {
  getCoverAllowedMaterialIds,
  isSeparateCoverMode,
  resolveCoverMaterialIdForPricing,
} from '../utils/multipageCoverMaterials';
import { collectMaterialIdsFromSimplified } from '../modules/products/routes/helpers';

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

  it('collectMaterialIdsFromSimplified includes cover.allowed_material_ids', () => {
    const ids = collectMaterialIdsFromSimplified({
      sizes: [{ allowed_material_ids: [1] }],
      multiPageStructure: {
        cover: {
          mode: 'separate',
          allowed_material_ids: [9, 10],
          material_id: 9,
        },
      },
    });
    expect(ids.sort((a, b) => a - b)).toEqual([1, 9, 10]);
  });

  it('collectMaterialIdsFromSimplified skips cover ids when mode is not separate', () => {
    const ids = collectMaterialIdsFromSimplified({
      sizes: [{ allowed_material_ids: [1] }],
      multiPageStructure: {
        cover: { mode: 'none', allowed_material_ids: [9, 10] },
      },
    });
    expect(ids).toEqual([1]);
  });
});
