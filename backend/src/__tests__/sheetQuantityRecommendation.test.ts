import { sheetQuantityRecommendation } from '../modules/pricing/utils/sheetQuantityRecommendation';

describe('sheetQuantityRecommendation', () => {
  it('меньше листа рекомендует один лист и цену как для него', () => {
    expect(sheetQuantityRecommendation(20, 88)).toEqual({
      itemsPerSheet: 88,
      pricedQuantity: 88,
      recommendedQuantity: 88,
    });
  });

  it('между листами называет меньшее и большее кратное количество', () => {
    expect(sheetQuantityRecommendation(100, 88)).toEqual({
      itemsPerSheet: 88,
      pricedQuantity: 100,
      lowerQuantity: 88,
      higherQuantity: 176,
    });
  });

  it('ровный лист и единичную раскладку не подсказывает', () => {
    expect(sheetQuantityRecommendation(88, 88)).toBeNull();
    expect(sheetQuantityRecommendation(176, 88)).toBeNull();
    expect(sheetQuantityRecommendation(7, 1)).toBeNull();
  });
});
