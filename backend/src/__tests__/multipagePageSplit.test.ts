import {
  resolveBlockPagesForPrint,
  resolveMultipagePageSplit,
} from '../utils/multipagePagesConsistency';

describe('resolveMultipagePageSplit', () => {
  const structure = {
    cover: { mode: 'separate' as const, page_count: 4 },
    binding: { service_id: 1 },
  };

  it('28 стр. в калькуляторе = всего с обложкой → блок 24', () => {
    const split = resolveMultipagePageSplit({
      pagesCount: 28,
      multiPageStructure: structure,
      pagesFromParameter: true,
    });
    expect(split.totalPages).toBe(28);
    expect(split.coverPages).toBe(4);
    expect(split.innerPages).toBe(24);
    expect(resolveBlockPagesForPrint(split)).toBe(24);
  });

  it('режим self: печать блока по всем 28 стр.', () => {
    const split = resolveMultipagePageSplit({
      pagesCount: 28,
      multiPageStructure: { cover: { mode: 'self', page_count: 4 } },
      pagesFromParameter: true,
    });
    expect(resolveBlockPagesForPrint(split)).toBe(28);
  });
});
