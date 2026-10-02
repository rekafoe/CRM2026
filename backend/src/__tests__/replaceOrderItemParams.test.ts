import { buildReplacedItemParams } from '../modules/orders/services/replaceOrderItemParams'

describe('buildReplacedItemParams', () => {
  it('убирает старые ключи расчёта и оставляет дату, принтер и резервы', () => {
    const next = buildReplacedItemParams({
      existing: {
        productId: 12,
        format: 'A3',
        createdDate: '2026-04-01',
        readyDate: '2026-04-02',
        printerId: 4,
        components: [{ materialId: 1, qtyPerItem: 2, reservationId: 9 }],
      },
      incoming: {
        productId: 15,
        format: 'A4',
        priceLockedByCalculator: true,
      },
    })

    expect(next.productId).toBe(15)
    expect(next.format).toBe('A4')
    expect(next.createdDate).toBe('2026-04-01')
    expect(next.readyDate).toBe('2026-04-02')
    expect(next.printerId).toBe(4)
    expect(next.components).toEqual([{ materialId: 1, qtyPerItem: 2, reservationId: 9 }])
  })

  it('пустой черновик макета не затирает уже собранные страницы', () => {
    const artwork = { pages: [{ fabricJSON: { objects: [{ type: 'text' }] } }] }
    const next = buildReplacedItemParams({
      existing: {
        designState: artwork,
        designTemplateId: 77,
        editorDraftToken: 'draft-1',
      },
      incoming: {
        productId: 3,
        designState: { pageCount: 2, pages: [] },
      },
    })

    expect(next.designState).toBe(artwork)
    expect(next.designTemplateId).toBe(77)
    expect(next.editorDraftToken).toBe('draft-1')
    expect(next.productId).toBe(3)
  })

  it('новый состав материалов заменяет старые резервы', () => {
    const next = buildReplacedItemParams({
      existing: {
        components: [{ materialId: 1, qtyPerItem: 2, reservationId: 9 }],
      },
      incoming: { productId: 3 },
      components: [{ materialId: 8, qtyPerItem: 1, reservationId: 20 }],
    })

    expect(next.components).toEqual([{ materialId: 8, qtyPerItem: 1, reservationId: 20 }])
  })
})