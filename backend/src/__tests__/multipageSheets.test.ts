import {
  computeMultipageCoverPrintUnits,
  computeMultipagePrintUnits,
  computeMultipageSheetsPerItem,
} from '../utils/multipagePagesConsistency';

describe('computeMultipagePrintUnits', () => {
  it('7 физических листов × 2 на сторону → 14 позиций печати', () => {
    expect(computeMultipagePrintUnits(7, 2)).toBe(14);
  });
});

describe('computeMultipageCoverPrintUnits', () => {
  it('10 изделий × 4 стр. обложки, 1 на лист → 40 позиций печати', () => {
    expect(
      computeMultipageCoverPrintUnits({
        quantity: 10,
        coverPages: 4,
        itemsPerSheet: 1,
        sidesMode: 'single',
      }),
    ).toBe(40);
  });
});

describe('computeMultipageSheetsPerItem', () => {
  it('28 стр., 2 на сторону, duplex → 7 листов', () => {
    expect(computeMultipageSheetsPerItem(28, 2, 'duplex')).toBe(7);
  });

  it('28 стр., 2 на сторону, single → 14 листов', () => {
    expect(computeMultipageSheetsPerItem(28, 2, 'single')).toBe(14);
  });

  it('16 стр., 1 на сторону, single → 16 листов', () => {
    expect(computeMultipageSheetsPerItem(16, 1, 'single')).toBe(16);
  });

  it('16 стр., 1 на сторону, duplex → 8 листов', () => {
    expect(computeMultipageSheetsPerItem(16, 1, 'duplex')).toBe(8);
  });
});
