import {
  pickupDepartmentLookupCodes,
  resolveSitePickupDepartmentCode,
  SITE_PICKUP_POINTS,
} from '../config/sitePickupPoints'

describe('sitePickupPoints', () => {
  it('keeps website branch ids as department codes', () => {
    expect(SITE_PICKUP_POINTS.map((point) => point.code)).toEqual([
      'pickup-dzerzhinskogo-3b',
      'pickup-dzerzhinskogo-104',
    ])
  })

  it('maps legacy cart ids to Дзержинского 3Б', () => {
    expect(resolveSitePickupDepartmentCode('pickup-gikalo')).toBe('pickup-dzerzhinskogo-3b')
    expect(resolveSitePickupDepartmentCode('pickup-dzerzhinsky-3b')).toBe('pickup-dzerzhinskogo-3b')
    expect(resolveSitePickupDepartmentCode('pickup-dzerzhinskogo-3b')).toBe('pickup-dzerzhinskogo-3b')
    expect(resolveSitePickupDepartmentCode('pickup-dzerzhinskogo-104')).toBe('pickup-dzerzhinskogo-104')
  })

  it('looks up 3Б by both old and new codes so pre-migration CRM still matches', () => {
    expect(pickupDepartmentLookupCodes('pickup-dzerzhinskogo-3b')).toEqual(
      expect.arrayContaining(['pickup-dzerzhinskogo-3b', 'pickup-gikalo', 'pickup-dzerzhinsky-3b'])
    )
    expect(pickupDepartmentLookupCodes('pickup-gikalo')).toEqual(
      pickupDepartmentLookupCodes('pickup-dzerzhinskogo-3b')
    )
  })
})
