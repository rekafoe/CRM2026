import { compactServiceVariantParametersForSite } from '../modules/products/routes/helpers';

describe('compactServiceVariantParametersForSite', () => {
  it('keeps nested type/subType/parent and drops roll width', () => {
    const params = compactServiceVariantParametersForSite(
      {
        type: '',
        subType: '30 мк',
        parentVariantId: 11,
        roll_width_mm: 1270,
        rollWidth: 1270,
      },
      11
    );

    expect(params).toEqual({
      type: '',
      subType: '30 мк',
      parentVariantId: 11,
    });
  });

  it('injects parent from column when JSON has none', () => {
    expect(compactServiceVariantParametersForSite({ subType: '100 мк' }, 22)).toEqual({
      subType: '100 мк',
      parentVariantId: 22,
    });
  });
});
