import {
  computeCoverSheetsTotal,
  computeMultipageCoverPrintUnits,
  computeMultipagePrintUnits,
  computeMultipageSheetsPerItem,
  resolveCoverPageCount,
  resolveCoverSheetRule,
  resolveMultipagePageSplit,
  resolveSheetBlock,
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

describe('листы блока', () => {
  const notebook = {
    coverChoice: 'printed',
    notebook: { use_sheets: true, sheets: 50 },
    cover: { mode: 'separate', page_count: 4 },
  };

  it('50 листов с двух сторон и два картона — 102 страницы', () => {
    expect(resolveSheetBlock(notebook, 50)).toEqual({
      sheets: 50,
      blockPages: 100,
      coverPages: 2,
      totalPages: 102,
    });
    expect(
      resolveMultipagePageSplit({ pagesCount: 102, multiPageStructure: notebook, pagesFromParameter: true }),
    ).toEqual({ totalPages: 102, coverPages: 2, innerPages: 100, coverMode: 'separate' });
  });

  it('без числа с калькулятора берёт листы шаблона, без них — 50', () => {
    expect(resolveSheetBlock({ ...notebook, notebook: { use_sheets: true, sheets: 24 } }, undefined)?.totalPages).toBe(50);
    expect(resolveSheetBlock({ ...notebook, notebook: { use_sheets: true } }, 0)?.sheets).toBe(50);
  });

  it('выключенная галочка и готовая крышка листами не считаются', () => {
    expect(resolveSheetBlock({ ...notebook, notebook: { use_sheets: false } }, 50)).toBeNull();
    expect(resolveSheetBlock({ ...notebook, coverChoice: 'ready' }, 50)).toBeNull();
    expect(resolveSheetBlock(null, 50)).toBeNull();
  });

  it('больше 500 листов — ошибка 400', () => {
    expect(() => resolveSheetBlock(notebook, 501)).toThrow('Листов блока: от 1 до 500');
  });
});

describe('листы обложки', () => {
  const wrapped = { cover: { mode: 'separate', wrap: true, page_count: 4 } };
  const cards = { notebook: { use_sheets: true }, cover: { mode: 'separate' } };
  const album = { cover: { mode: 'separate', page_count: 4 } };

  it('правило выбирается по сборке', () => {
    expect(resolveCoverSheetRule(wrapped)).toBe('wrap');
    expect(resolveCoverSheetRule({ ...cards, cover: { mode: 'separate', wrap: true } })).toBe('wrap');
    expect(resolveCoverSheetRule(cards)).toBe('cards');
    expect(resolveCoverSheetRule(album)).toBe('layout');
    // Кашировка у готовой крышки и у обложки «как блок» не действует.
    expect(resolveCoverSheetRule({ coverChoice: 'ready', cover: { mode: 'separate', wrap: true } })).toBe('layout');
    expect(resolveCoverSheetRule({ cover: { mode: 'self', wrap: true } })).toBe('layout');
  });

  it('два картона и кашировка — всегда 2 страницы обложки', () => {
    expect(resolveCoverPageCount(wrapped)).toBe(2);
    expect(resolveCoverPageCount(cards)).toBe(2);
    expect(resolveCoverPageCount(album)).toBe(4);
    expect(resolveCoverPageCount({ cover: { mode: 'separate' } })).toBe(4);
    expect(resolveCoverPageCount({ cover: { mode: 'none', wrap: true } })).toBe(0);
  });

  it('кашировка: два листа на изделие, стороны и раскладка их не меняют', () => {
    for (const sidesMode of ['single', 'duplex']) {
      expect(
        computeCoverSheetsTotal({ rule: 'wrap', quantity: 3, coverPages: 2, itemsPerSheet: 4, sidesMode }),
      ).toBe(6);
    }
    expect(
      computeMultipageCoverPrintUnits({ rule: 'wrap', quantity: 3, coverPages: 2, itemsPerSheet: 4, sidesMode: 'single' }),
    ).toBe(6);
  });

  it('два картона режутся раскладкой и считаются на тираж', () => {
    expect(
      computeCoverSheetsTotal({ rule: 'cards', quantity: 1, coverPages: 2, itemsPerSheet: 4, sidesMode: 'single' }),
    ).toBe(1);
    expect(
      computeCoverSheetsTotal({ rule: 'cards', quantity: 10, coverPages: 2, itemsPerSheet: 4, sidesMode: 'duplex' }),
    ).toBe(5);
    expect(
      computeCoverSheetsTotal({ rule: 'cards', quantity: 3, coverPages: 2, itemsPerSheet: 1, sidesMode: 'single' }),
    ).toBe(6);
  });

  it('обычная обложка альбома считается как раньше', () => {
    expect(
      computeCoverSheetsTotal({ rule: 'layout', quantity: 10, coverPages: 4, itemsPerSheet: 2, sidesMode: 'duplex' }),
    ).toBe(10);
    expect(
      computeMultipageCoverPrintUnits({ quantity: 10, coverPages: 4, itemsPerSheet: 2, sidesMode: 'duplex' }),
    ).toBe(20);
  });
});
