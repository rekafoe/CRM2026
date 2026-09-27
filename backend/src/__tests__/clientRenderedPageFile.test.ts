import {
  buildOrderFileFieldsFromDraftFile,
  isClientRenderedPageFileName,
  parseClientRenderedPagePartNumber,
  planDraftFilesForOrderCopy,
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

  it('shifts later drafts so every slot page keeps a distinct partNumber', () => {
    const first = planDraftFilesForOrderCopy([
      { id: 1, originalName: 'client-render-page-1.png' },
    ])
    const second = planDraftFilesForOrderCopy(
      [{ id: 2, originalName: 'client-render-page-1.png' }],
      first.productionPageCount,
    )
    expect(first.planned[0].fields.partNumber).toBe(1)
    expect(second.planned[0].fields.partNumber).toBe(2)
    expect(second.productionPageCount).toBe(1)
  })

  it('keeps the latest re-upload of the same page inside one draft', () => {
    const planned = planDraftFilesForOrderCopy([
      { id: 4, originalName: 'client-render-page-1.png' },
      { id: 9, originalName: 'client-render-page-1.png' },
      { id: 5, originalName: 'photo.jpg' },
    ])
    expect(planned.productionPageCount).toBe(1)
    expect(planned.planned.map((row) => row.file.id)).toEqual([5, 9])
    expect(planned.planned.find((row) => row.file.id === 9)?.aliasFileIds).toEqual([4])
    expect(planned.planned.find((row) => row.file.id === 9)?.fields.partNumber).toBe(1)
  })
})
