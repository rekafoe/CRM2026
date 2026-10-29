import { finishingServiceCaption, finishingServiceDisplayName } from '../modules/pricing/services/finishingServiceCaption';

describe('finishingServiceCaption', () => {
  it('пишет тип и подтип листа, а не пустую плотность', () => {
    expect(
      finishingServiceCaption({
        type: 'Глянцевая',
        density: '',
        subType: '30 мк',
        parentVariantId: 155,
      }),
    ).toBe('Глянцевая, 30 мк');
  });

  it('берёт тип у родителя, если на листе только подтип', () => {
    expect(
      finishingServiceCaption(
        { parentVariantId: 240, subType: '75 мк' },
        { type: 'SOFT-TOUCH' },
      ),
    ).toBe('SOFT-TOUCH, 75 мк');
  });

  it('добавляет подпись к имени услуги', () => {
    const params = new Map<number, Record<string, unknown>>([
      [156, { type: 'Матовая', density: '30 ', subType: '30 мк', parentVariantId: 154 }],
    ]);
    expect(finishingServiceDisplayName('Ламинация рулонная', 156, params)).toBe(
      'Ламинация рулонная — Матовая, 30 мк',
    );
  });
});
