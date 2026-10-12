import { assertPublicCheckoutItemsHaveSimplifiedProduct, PublicCheckoutPricingError } from '../modules/orders/utils/websiteOrderNormalize'

jest.mock('../modules/pricing/services/pricingGroupService', () => {
  const actual = jest.requireActual('../modules/pricing/services/pricingGroupService')
  return {
    ...actual,
    isSimplifiedProduct: jest.fn(),
  }
})

import { isSimplifiedProduct } from '../modules/pricing/services/pricingGroupService'

describe('assertPublicCheckoutItemsHaveSimplifiedProduct', () => {
  const mockedIsSimplified = isSimplifiedProduct as jest.MockedFunction<typeof isSimplifiedProduct>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows free design-only lines without productId', async () => {
    await expect(
      assertPublicCheckoutItemsHaveSimplifiedProduct([
        { type: 'design', price: 0, quantity: 1, params: { description: 'Макет' } },
      ] as any),
    ).resolves.toBeUndefined()
    expect(mockedIsSimplified).not.toHaveBeenCalled()
  })

  it('rejects priced line without productId (client totalCost underpay path)', async () => {
    await expect(
      assertPublicCheckoutItemsHaveSimplifiedProduct([
        {
          type: 'Визитки',
          price: 0.01,
          quantity: 100,
          totalCost: 0.01,
          params: { description: 'A6' },
        },
      ] as any),
    ).rejects.toMatchObject({
      code: 'PUBLIC_CHECKOUT_PRODUCT_REQUIRED',
    })
  })

  it('rejects priced line with params.storedTotalCost and no productId', async () => {
    await expect(
      assertPublicCheckoutItemsHaveSimplifiedProduct([
        {
          type: 'Листовки',
          price: 0,
          quantity: 50,
          params: { storedTotalCost: 0.01, description: 'x' },
        },
      ] as any),
    ).rejects.toBeInstanceOf(PublicCheckoutPricingError)
  })

  it('rejects non-simplified / missing catalog productId', async () => {
    mockedIsSimplified.mockResolvedValue(false)
    await expect(
      assertPublicCheckoutItemsHaveSimplifiedProduct([
        {
          type: '22',
          price: 1,
          quantity: 10,
          totalCost: 10,
          params: { productId: 999 },
        },
      ] as any),
    ).rejects.toMatchObject({
      code: 'PUBLIC_CHECKOUT_PRODUCT_NOT_SIMPLIFIED',
    })
    expect(mockedIsSimplified).toHaveBeenCalledWith(999)
  })

  it('allows simplified productId with client totalCost (reprice can run)', async () => {
    mockedIsSimplified.mockResolvedValue(true)
    await expect(
      assertPublicCheckoutItemsHaveSimplifiedProduct([
        {
          type: '22',
          price: 0.01,
          quantity: 100,
          totalCost: 0.01,
          params: {
            productId: 22,
            specifications: {
              material_id: 1,
              print_technology: 'digital',
              print_color_mode: 'color',
              print_sides_mode: 'single',
            },
          },
        },
      ] as any),
    ).resolves.toBeUndefined()
  })
})
