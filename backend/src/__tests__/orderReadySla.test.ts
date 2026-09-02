import {
  buildDefaultReadyDateIso,
  extractPriceTypeKey,
  getItemReadyLabel,
  getItemReadyOffsetMs,
  getOrderGoverningSla,
  HOUR_SLA_MS,
  resolveItemReadyMs,
  resolveOrderReadyAtMs,
  TWO_DAY_SLA_MS,
} from '../utils/orderReadySla'

const HOUR = 60 * 60 * 1000
const created = '2026-09-02T08:00:00.000Z'
const createdMs = Date.parse(created)

describe('orderReadySla', () => {
  it('reads nested specifications.priceType', () => {
    expect(
      extractPriceTypeKey({
        params: { specifications: { priceType: 'urgent' } },
      })
    ).toBe('urgent')
  })

  it('maps rush to urgent', () => {
    expect(extractPriceTypeKey({ priceType: 'rush' })).toBe('urgent')
  })

  it('treats website standard as 1–3 hour SLA', () => {
    const item = { params: { priceType: 'standard' } }
    expect(getItemReadyOffsetMs(item, 'website')).toBe(HOUR_SLA_MS)
    expect(getItemReadyLabel(item, 'website')).toBe('1–3 часа')
  })

  it('keeps CRM standard as 24 hours', () => {
    const item = { params: { priceType: 'standard' } }
    expect(getItemReadyOffsetMs(item, 'crm')).toBe(24 * HOUR)
    expect(getItemReadyLabel(item, 'crm')).toBe('24 часа')
  })

  it('defaults missing website priceType to 48h, not 3h', () => {
    expect(getItemReadyOffsetMs({ params: {} }, 'website')).toBe(TWO_DAY_SLA_MS)
  })

  it('treats website online/promo as 48 hours', () => {
    expect(getItemReadyOffsetMs({ params: { priceType: 'online' } }, 'website')).toBe(
      TWO_DAY_SLA_MS
    )
    expect(getItemReadyLabel({ params: { priceType: 'promo' } }, 'mini_app')).toBe('48 часов')
  })

  it('overrides stored +1 day readyDate for website Срочно', () => {
    const item = {
      params: {
        priceType: 'standard',
        readyDate: '2026-09-03T08:00:00.000Z',
      },
    }
    const readyMs = resolveItemReadyMs(item, createdMs, 'website')
    expect(readyMs).toBe(createdMs + HOUR_SLA_MS)
  })

  it('keeps stored readyDate when it already matches hour SLA', () => {
    const stored = new Date(createdMs + 2 * HOUR).toISOString()
    const item = { params: { priceType: 'urgent', readyDate: stored } }
    expect(resolveItemReadyMs(item, createdMs, 'website')).toBe(Date.parse(stored))
  })

  it('uses the slowest item SLA for mixed carts', () => {
    const sla = getOrderGoverningSla(
      [
        { params: { priceType: 'standard' } },
        { params: { priceType: 'online' } },
      ],
      'website'
    )
    expect(sla.offsetMs).toBe(TWO_DAY_SLA_MS)
    expect(sla.label).toBe('48 часов')
  })

  it('maps polaroid premium to 1–3 hours even with priceType standard', () => {
    const item = {
      type: 'Печать полароид',
      params: {
        priceType: 'standard',
        specifications: { productType: 'polaroid', printType: 'premium' },
      },
    }
    expect(getItemReadyOffsetMs(item, 'website')).toBe(HOUR_SLA_MS)
  })

  it('maps classic photo / polaroid digital to 48 hours', () => {
    expect(
      getItemReadyOffsetMs(
        {
          params: {
            priceType: 'standard',
            specifications: { printType: 'digital', productType: 'polaroid' },
          },
        },
        'website'
      )
    ).toBe(TWO_DAY_SLA_MS)
    expect(
      getItemReadyOffsetMs(
        {
          params: {
            priceType: 'standard',
            specifications: { withWhiteBorders: false, paperType: 'glossy' },
          },
        },
        'website'
      )
    ).toBe(TWO_DAY_SLA_MS)
  })

  it('writes default readyDate as created + 3h for website standard', () => {
    const iso = buildDefaultReadyDateIso(
      created,
      { params: { priceType: 'standard' } },
      'website'
    )
    expect(iso).toBe(new Date(createdMs + HOUR_SLA_MS).toISOString())
  })

  it('resolves order readyAt from items', () => {
    const ready = resolveOrderReadyAtMs({
      created_at: created,
      source: 'website',
      items: [{ params: { priceType: 'urgent' } }],
    })
    expect(ready).toBe(createdMs + HOUR_SLA_MS)
  })
})
