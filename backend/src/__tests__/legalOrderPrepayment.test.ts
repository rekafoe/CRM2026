import {
  isFullSyncedPrepayment,
  shouldAutoFillCashPrepayment,
  shouldClearDefaultPrepaymentForLegal,
} from '../utils/legalOrderPrepayment'

describe('предоплата юрлица', () => {
  it('не подставляет предоплату для юрлица и для канала счёт', () => {
    expect(
      shouldAutoFillCashPrepayment({
        customerType: 'legal',
        paymentMethod: 'online',
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 120,
      })
    ).toBe(false)
    expect(
      shouldAutoFillCashPrepayment({
        customerType: 'individual',
        paymentChannel: 'invoice',
        paymentMethod: 'online',
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 80,
      })
    ).toBe(false)
  })

  it('для кассы оставляет прежнюю автоподстановку', () => {
    expect(
      shouldAutoFillCashPrepayment({
        customerType: 'individual',
        paymentChannel: 'cash',
        paymentMethod: 'online',
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 50,
      })
    ).toBe(true)
    expect(
      shouldAutoFillCashPrepayment({
        paymentMethod: 'offline',
        prepaymentAmount: 40,
        prepaymentStatus: 'paid',
        oldTotal: 40,
        newTotal: 55,
      })
    ).toBe(true)
    expect(
      shouldAutoFillCashPrepayment({
        paymentMethod: null,
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 50,
      })
    ).toBe(false)
    expect(
      shouldAutoFillCashPrepayment({
        paymentMethod: 'offline',
        prepaymentAmount: 15,
        prepaymentStatus: 'paid',
        oldTotal: 40,
        newTotal: 55,
      })
    ).toBe(false)
    expect(
      shouldAutoFillCashPrepayment({
        paymentMethod: 'online',
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 0,
      })
    ).toBe(false)
  })

  it('при привязке юрлица сбрасывает только полную автопредоплату', () => {
    expect(
      shouldClearDefaultPrepaymentForLegal({
        customerType: 'legal',
        prepaymentAmount: 100,
        orderTotal: 100,
      })
    ).toBe(true)
    expect(isFullSyncedPrepayment(100.004, 100)).toBe(true)
    expect(
      shouldClearDefaultPrepaymentForLegal({
        customerType: 'legal',
        prepaymentAmount: 40,
        orderTotal: 100,
      })
    ).toBe(false)
    expect(
      shouldClearDefaultPrepaymentForLegal({
        customerType: 'legal',
        prepaymentAmount: 0,
        orderTotal: 100,
      })
    ).toBe(false)
    expect(
      shouldClearDefaultPrepaymentForLegal({
        customerType: 'individual',
        prepaymentAmount: 100,
        orderTotal: 100,
      })
    ).toBe(false)
    expect(
      shouldClearDefaultPrepaymentForLegal({
        customerType: null,
        prepaymentAmount: 100,
        orderTotal: 100,
      })
    ).toBe(false)
    expect(
      shouldClearDefaultPrepaymentForLegal({
        customerType: 'legal',
        paymentChannel: 'invoice',
        prepaymentAmount: 100,
        orderTotal: 100,
      })
    ).toBe(false)
  })
})
