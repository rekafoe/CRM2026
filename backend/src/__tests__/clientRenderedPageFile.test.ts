import {
  buildOrderFileFieldsFromDraftFile,
  isClientRenderedPageFileName,
  parseClientRenderedPagePartNumber,
} from '../utils/clientRenderedPageFile'

describe('clientRenderedPageFile', () => {
  it('parses production PNG originalName into 1-based partNumber', () => {
    expect(parseClientRenderedPagePartNumber('client-render-page-001.png')).toBe(1)
    expect(parseClientRenderedPagePartNumber('client-render-page-16.png')).toBe(16)
    expect(parseClientRenderedPagePartNumber('photo-library.jpg')).toBeNull()
    expect(isClientRenderedPageFileName('client-render-page-007.png')).toBe(true)
  })

  it('marks production PNG as client_rendered_page for order_files', () => {
    expect(buildOrderFileFieldsFromDraftFile(
      { originalName: 'client-render-page-007.png' },
      16,
    )).toEqual({
      artifactType: 'client_rendered_page',
      partNumber: 7,
      metadata: JSON.stringify({ source: 'client_png', pageIndex: 6, pageCount: 16 }),
    })
    expect(buildOrderFileFieldsFromDraftFile({ originalName: 'family.jpg' }, 16)).toEqual({
      artifactType: null,
      partNumber: null,
      metadata: null,
    })
  })
})
