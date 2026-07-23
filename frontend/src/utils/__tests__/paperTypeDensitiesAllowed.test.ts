import {
  densitiesWithMaterialId,
  summarizeAllowedPaperTypeDensities,
  toggleMaterialIdInAllowed,
} from '../paperTypeDensitiesAllowed';

describe('paperTypeDensitiesAllowed', () => {
  const paperTypes = [
    {
      id: 'glossy',
      name: 'glossy',
      display_name: 'Мелованная',
      densities: [
        { material_id: 1, value: 120, price: 0.5 },
        { material_id: 2, value: 160, price: 0.7 },
        { material_id: 0, value: 200 },
      ],
    },
    {
      id: 'matte',
      name: 'matte',
      display_name: 'Полуматовая',
      densities: [{ material_id: 3, value: 300, price: 1.2 }],
    },
  ];

  it('densitiesWithMaterialId skips invalid material_id', () => {
    expect(densitiesWithMaterialId(paperTypes[0]).map((d) => d.materialId)).toEqual([1, 2]);
  });

  it('toggleMaterialIdInAllowed adds and removes', () => {
    expect(toggleMaterialIdInAllowed([1], 2, true)).toEqual([1, 2]);
    expect(toggleMaterialIdInAllowed([1, 2], 1, false)).toEqual([2]);
    expect(toggleMaterialIdInAllowed([1], 1, true)).toEqual([1]);
  });

  it('summarizeAllowedPaperTypeDensities formats selected types', () => {
    expect(summarizeAllowedPaperTypeDensities(paperTypes, [2, 3])).toBe(
      'Мелованная · 160; Полуматовая · 300'
    );
    expect(summarizeAllowedPaperTypeDensities(paperTypes, [])).toBe('');
  });
});
