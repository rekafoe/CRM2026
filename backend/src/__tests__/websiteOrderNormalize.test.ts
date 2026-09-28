import { normalizeWebsiteItems } from '../modules/orders/utils/websiteOrderNormalize'

describe('websiteOrderNormalize', () => {
  it('preserves editorDraftToken for editor checkout', () => {
    const [item] = normalizeWebsiteItems([
      {
        type: 'Визитки',
        price: 0.44,
        quantity: 24,
        params: {
          description: 'Визитки',
          productId: 22,
          editorDraftToken: 'GmbuHT3odWXg51xILm9Ic2lo',
          designTemplateId: 9,
          designEditorMode: 'single',
          layoutHumanLabel: 'Макет подготовлен в онлайн-редакторе',
          _crmCalculationSnapshot: { finalPrice: 10.47 },
        },
      },
    ])

    expect(item.params.editorDraftToken).toBe('GmbuHT3odWXg51xILm9Ic2lo')
    expect(item.params.designTemplateId).toBe(9)
    expect(item.params._crmCalculationSnapshot).toBeUndefined()
    expect(item.params.layoutHumanLabel).toBeUndefined()
    expect(item.params.designEditorMode).toBeUndefined()
  })

  it('keeps only positive qtyPerItem components (negative would inflate warehouse stock)', () => {
    const [item] = normalizeWebsiteItems([
      {
        type: '42',
        price: 1,
        quantity: 2,
        components: [
          { materialId: 10, qtyPerItem: -5 },
          { materialId: 11, qtyPerItem: 0 },
          { materialId: 12, qtyPerItem: 1.5 },
          { materialId: 'bad', qtyPerItem: 2 },
        ],
      },
    ])

    expect(item.components).toEqual([{ materialId: 12, qtyPerItem: 1.5 }])
  })

  it('omits components when every qtyPerItem is non-positive', () => {
    const [item] = normalizeWebsiteItems([
      {
        type: '42',
        price: 1,
        quantity: 1,
        components: [
          { materialId: 10, qtyPerItem: -1 },
          { materialId: 11, qtyPerItem: 0 },
        ],
      },
    ])

    expect(item.components).toBeUndefined()
  })
})
