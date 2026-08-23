import {
  parseWebsiteOrderDelivery,
  serializeWebsiteOrderDelivery,
} from '../types/websiteOrderDelivery'
import { pickupDepartmentLookupCodes } from '../config/sitePickupPoints'

describe('fulfillmentDepartment resolve', () => {
  it('pickup delivery serializes with providerId for department code match', () => {
    const d = parseWebsiteOrderDelivery({
      kind: 'pickup',
      providerId: 'pickup-dzerzhinskogo-3b',
      label: 'Проспект Дзержинского 3Б',
      address: 'г. Минск, пр. Дзержинского 3Б',
      cost: 0,
    })
    expect(d?.kind).toBe('pickup')
    expect(d?.providerId).toBe('pickup-dzerzhinskogo-3b')
    const json = serializeWebsiteOrderDelivery(d!)
    expect(json).toContain('pickup-dzerzhinskogo-3b')
  })

  it('legacy pickup-gikalo still maps to the 3Б department codes', () => {
    expect(pickupDepartmentLookupCodes('pickup-gikalo')).toContain('pickup-dzerzhinskogo-3b')
  })
})
