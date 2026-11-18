import {
  WEBSITE_WAITING_ISSUE_BLOCK,
  WEBSITE_WAITING_PAYMENT_BLOCK,
  shouldShrinkPrepaymentOnItemDelete,
  websiteWaitingDeleteReason,
} from '../modules/orders/services/websiteWaitingItemDeletePolicy'

describe('websiteWaitingDeleteReason', () => {
  it('не трогает заказ не с сайта', () => {
    expect(websiteWaitingDeleteReason({
      source: 'crm',
      waiting: true,
      prepaymentAmount: 40,
      prepaymentStatus: 'paid',
      paymentMethod: 'offline',
      issued: true,
    })).toBeNull()
  })

  it('разрешает BePaid paid/successful и вне статуса «Ожидает», платёж не подрезает', () => {
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 18.5,
      prepaymentStatus: 'successful',
      paymentMethod: 'online',
      issued: false,
    })).toBeNull()
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: false,
      prepaymentAmount: 40,
      prepaymentStatus: 'paid',
      paymentMethod: 'online',
      issued: false,
    })).toBeNull()
    expect(shouldShrinkPrepaymentOnItemDelete({
      paymentMethod: 'online',
      prepaymentStatus: 'successful',
      prepaymentAmount: 40,
      newTotal: 15,
    })).toBe(false)
    expect(shouldShrinkPrepaymentOnItemDelete({
      paymentMethod: 'offline',
      prepaymentStatus: 'paid',
      prepaymentAmount: 40,
      newTotal: 15,
    })).toBe(true)
  })

  it('разрешает неоплаченный онлайн-заказ в «Ожидает», в том числе с ожидающей ссылкой', () => {
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 0,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      issued: false,
    })).toBeNull()
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 25,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      issued: false,
    })).toBeNull()
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 0,
      prepaymentStatus: null,
      paymentMethod: 'offline',
      issued: false,
    })).toBeNull()
  })

  it('запрещает удаление кассы и платёжки bank в «Ожидает»', () => {
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 10,
      prepaymentStatus: 'bank',
      paymentMethod: 'online',
      issued: false,
    })).toBe(WEBSITE_WAITING_PAYMENT_BLOCK)
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 10,
      prepaymentStatus: 'paid',
      paymentMethod: 'offline',
      issued: false,
    })).toBe(WEBSITE_WAITING_PAYMENT_BLOCK)
  })

  it('запрещает удаление после выдачи или проведённого документа, даже если BePaid уже оплачен', () => {
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 0,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      issued: true,
    })).toBe(WEBSITE_WAITING_ISSUE_BLOCK)
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: false,
      prepaymentAmount: 40,
      prepaymentStatus: 'successful',
      paymentMethod: 'online',
      issued: true,
    })).toBe(WEBSITE_WAITING_ISSUE_BLOCK)
  })
})
