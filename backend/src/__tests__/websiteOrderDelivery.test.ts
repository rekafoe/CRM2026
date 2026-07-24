import {
  formatWebsiteDeliverySummary,
  parseWebsiteOrderDelivery,
  parseWebsiteOrderDeliveryJson,
} from '../types/websiteOrderDelivery'

describe('websiteOrderDelivery', () => {
  it('parses valid delivery', () => {
    const d = parseWebsiteOrderDelivery({
      kind: 'pickup',
      providerId: 'pickup-dzerzhinsky-3b',
      label: 'Проспект Дзержинского 3б',
      address: 'г. Минск, пр. Дзержинского 3б',
      cost: 0,
    })
    expect(d?.providerId).toBe('pickup-dzerzhinsky-3b')
    expect(formatWebsiteDeliverySummary(d!)).toContain('Самовывоз')
    expect(formatWebsiteDeliverySummary(d!)).toContain('пр. Дзержинского 3б')
  })

  it('includes courier destination in summary', () => {
    const d = parseWebsiteOrderDelivery({
      kind: 'courier_minsk',
      providerId: 'courier-minsk',
      label: 'Доставка в пределах Минска',
      address: 'ул. Независимости 10',
      costLabel: 'от 10р',
    })
    const summary = formatWebsiteDeliverySummary(d!)
    expect(summary).toContain('Курьер по Минску')
    expect(summary).toContain('ул. Независимости 10')
  })

  it('rejects incomplete delivery', () => {
    expect(parseWebsiteOrderDelivery({ kind: 'pickup' })).toBeNull()
  })

  it('round-trips JSON', () => {
    const raw = {
      kind: 'pickup_point',
      providerId: 'evropochta',
      label: 'Европочта',
      costLabel: 'от 6р',
    }
    const parsed = parseWebsiteOrderDeliveryJson(JSON.stringify(raw))
    expect(parsed?.kind).toBe('pickup_point')
  })
})
