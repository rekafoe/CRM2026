import {
  isCancelledOrderForLegalDocuments,
  selectActiveOrdersForLegalDocuments,
} from '../utils/legalDocumentOrders'

describe('legalDocumentOrders', () => {
  it('treats is_cancelled=1 as cancelled', () => {
    expect(isCancelledOrderForLegalDocuments({ is_cancelled: 1 })).toBe(true)
    expect(isCancelledOrderForLegalDocuments({ is_cancelled: 0 })).toBe(false)
    expect(isCancelledOrderForLegalDocuments({})).toBe(false)
    expect(isCancelledOrderForLegalDocuments(null)).toBe(false)
  })

  it('drops soft-cancelled orders while preserving id order', () => {
    const map = new Map([
      [10, { id: 10, is_cancelled: 0 }],
      [11, { id: 11, is_cancelled: 1 }],
      [12, { id: 12, is_cancelled: 0 }],
    ])
    expect(selectActiveOrdersForLegalDocuments([11, 10, 12, 99], map).map((o) => o.id)).toEqual([
      10, 12,
    ])
  })

  it('returns empty when every requested order is soft-cancelled', () => {
    const map = new Map([[7, { id: 7, is_cancelled: 1 }]])
    expect(selectActiveOrdersForLegalDocuments([7], map)).toEqual([])
  })
})
