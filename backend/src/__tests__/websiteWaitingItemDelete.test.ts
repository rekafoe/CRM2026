import {
  WEBSITE_WAITING_ISSUE_BLOCK,
  WEBSITE_WAITING_PAYMENT_BLOCK,
  websiteWaitingDeleteReason,
} from '../modules/orders/services/websiteWaitingItemDeletePolicy'

describe('websiteWaitingDeleteReason', () => {
  it('не трогает заказ не с сайта и не в статусе «Ожидает»', () => {
    expect(websiteWaitingDeleteReason({
      source: 'crm',
      waiting: true,
      prepaymentAmount: 40,
      prepaymentStatus: 'paid',
      paymentMethod: 'offline',
      issued: true,
    })).toBeNull()
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: false,
      prepaymentAmount: 40,
      prepaymentStatus: 'paid',
      paymentMethod: 'online',
      issued: false,
    })).toBeNull()
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

  it('запрещает удаление, если оплата уже проведена', () => {
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 18.5,
      prepaymentStatus: 'successful',
      paymentMethod: 'online',
      issued: false,
    })).toBe(WEBSITE_WAITING_PAYMENT_BLOCK)
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

  it('запрещает удаление после выдачи или проведённого документа', () => {
    expect(websiteWaitingDeleteReason({
      source: 'website',
      waiting: true,
      prepaymentAmount: 0,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      issued: true,
    })).toBe(WEBSITE_WAITING_ISSUE_BLOCK)
  })
})
