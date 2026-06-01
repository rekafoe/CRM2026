import { computeMultipageSheetsPerItem } from '../utils/multipagePagesConsistency';

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
