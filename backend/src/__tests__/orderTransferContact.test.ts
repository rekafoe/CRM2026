import {
  contactToKeep,
  resolveColleagueContactUserId,
  shouldTransferContact,
} from '../modules/orders/orderTransferContact'

describe('передача заказа не забирает контактёра без явной галочки', () => {
  it('считает передачу только при явном да', () => {
    expect(shouldTransferContact(true)).toBe(true)
    expect(shouldTransferContact('true')).toBe(true)
    expect(shouldTransferContact(1)).toBe(true)
    expect(shouldTransferContact(false)).toBe(false)
    expect(shouldTransferContact('false')).toBe(false)
    expect(shouldTransferContact(undefined)).toBe(false)
    expect(shouldTransferContact(null)).toBe(false)
  })

  it('без галочки оставляет текущего контактёра, а не исполнителя', () => {
    expect(resolveColleagueContactUserId(false, 9, {
      contact_user_id: 4,
      responsible_user_id: 4,
      userId: 4,
    })).toBe(4)
    expect(resolveColleagueContactUserId(undefined, 9, {
      contact_user_id: null,
      responsible_user_id: null,
      userId: 4,
    })).toBe(4)
  })

  it('с галочкой назначает контактёром получателя', () => {
    expect(resolveColleagueContactUserId(true, 9, { contact_user_id: 4, userId: 4 })).toBe(9)
  })

  it('в павильоне без явного контактёра сохраняет прежнего владельца', () => {
    expect(contactToKeep({ contact_user_id: null, responsible_user_id: 4, userId: 4 })).toBe(4)
    expect(contactToKeep({ contact_user_id: 3, responsible_user_id: 4, userId: 4 })).toBe(3)
  })
})
