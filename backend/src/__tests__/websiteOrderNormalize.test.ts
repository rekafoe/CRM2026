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

  it('strips plotterBareProduct so website totalCost cannot skip server reprice', () => {
    const [item] = normalizeWebsiteItems([
      {
        type: 'Листовки',
        price: 0.01,
        quantity: 100,
        totalCost: 0.01,
        params: {
          description: 'A6',
          productId: 22,
          storedTotalCost: 0.01,
          plotterBareProduct: true,
          priceLockedByCalculator: true,
        },
      },
    ])

    expect(item.totalCost).toBe(0.01)
    expect(item.params.plotterBareProduct).toBeUndefined()
    expect(item.params.productId).toBe(22)
    expect(item.params.storedTotalCost).toBe(0.01)
  })
})
