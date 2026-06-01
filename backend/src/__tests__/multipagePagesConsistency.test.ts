import {
  assertMultipagePagesConsistency,
  readBindingPagesLimits,
  readDesignStatePageCount,
  readOrderItemPagesParam,
  validateBindingPagesLimit,
  validateMultiPageCountForTemplate,
} from '../utils/multipagePagesConsistency';

describe('multipagePagesConsistency', () => {
  it('readOrderItemPagesParam from specifications.pages', () => {
    expect(readOrderItemPagesParam({ specifications: { pages: 24 } })).toBe(24);
    expect(readOrderItemPagesParam({ pages: 16 })).toBe(16);
    expect(readOrderItemPagesParam({})).toBeNull();
  });

  it('readDesignStatePageCount from pageCount or pages array', () => {
    expect(readDesignStatePageCount({ pageCount: 20 })).toBe(20);
    expect(readDesignStatePageCount({ pages: [{}, {}, {}] })).toBe(3);
    expect(readDesignStatePageCount({})).toBeNull();
  });

  it('assertMultipagePagesConsistency passes when counts match', () => {
    const result = assertMultipagePagesConsistency({
      strict: false,
      editorDraftMode: 'multipage',
      orderPages: 24,
      designState: { pageCount: 24, pages: new Array(24).fill({}) },
    });
    expect(result.ok).toBe(true);
  });

  it('assertMultipagePagesConsistency throws in strict mode on mismatch', () => {
    expect(() =>
      assertMultipagePagesConsistency({
        strict: true,
        editorDraftMode: 'multipage',
        orderPages: 24,
        designState: { pageCount: 20 },
      }),
    ).toThrow(/не совпадает/);
  });

  it('assertMultipagePagesConsistency ignores non-multipage mode', () => {
    const result = assertMultipagePagesConsistency({
      strict: true,
      editorDraftMode: 'single',
      orderPages: 24,
      designState: { pageCount: 8 },
    });
    expect(result.ok).toBe(true);
  });

  it('validateMultiPageCountForTemplate rejects unknown preset for non-multi_page', () => {
    expect(() =>
      validateMultiPageCountForTemplate(10, { options: [4, 8, 12, 16, 20, 24] }),
    ).toThrow(/списка/);
  });

  it('validateMultiPageCountForTemplate allows preset value', () => {
    expect(() =>
      validateMultiPageCountForTemplate(24, { options: [4, 8, 12, 16, 20, 24] }),
    ).not.toThrow();
  });

  it('validateMultiPageCountForTemplate allows custom pages for multi_page', () => {
    expect(() =>
      validateMultiPageCountForTemplate(20, { options: [4, 8, 12, 16, 20, 24] }, { isMultiPage: true }),
    ).not.toThrow();
  });

  it('validateMultiPageCountForTemplate enforces max for multi_page custom', () => {
    expect(() =>
      validateMultiPageCountForTemplate(600, { options: [24], max: 500 }, { isMultiPage: true }),
    ).toThrow(/Не более/);
  });

  it('readBindingPagesLimits from parameters', () => {
    expect(readBindingPagesLimits({ min_pages: 4, max_pages: 60 })).toEqual({
      minPages: 4,
      maxPages: 60,
    });
  });

  it('validateBindingPagesLimit rejects over max', () => {
    expect(() =>
      validateBindingPagesLimit(80, { max_pages: 60 }, 'На скобу'),
    ).toThrow(/от 4 до 60|не более 60/);
  });

  it('validateBindingPagesLimit passes in range', () => {
    expect(() =>
      validateBindingPagesLimit(24, { min_pages: 4, max_pages: 60 }),
    ).not.toThrow();
  });
});
