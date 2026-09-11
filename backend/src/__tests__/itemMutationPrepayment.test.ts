import {
  planAddItemPrepaymentUpdate,
  planDeleteItemPrepaymentUpdate,
  planDiscountPrepaymentUpdate,
  planUpdateItemPrepaymentUpdate,
} from '../utils/itemMutationPrepayment'

describe('itemMutationPrepayment', () => {
  describe('planAddItemPrepaymentUpdate', () => {
    it('does not invent paid/offline for DEFAULT online unpaid CRM order', () => {
      const plan = planAddItemPrepaymentUpdate({
        paymentMethod: 'online',
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 120,
      })
      expect(plan).toEqual({ action: 'none' })
    })

    it('does not invent payment when paymentMethod is null', () => {
      const plan = planAddItemPrepaymentUpdate({
        paymentMethod: null,
        prepaymentAmount: 0,
        oldTotal: 0,
        newTotal: 80,
      })
      expect(plan).toEqual({ action: 'none' })
    })

    it('resizes offline fully-prepaid amount without requiring a stamp rewrite', () => {
      const plan = planAddItemPrepaymentUpdate({
        paymentMethod: 'offline',
        prepaymentAmount: 100,
        oldTotal: 100,
        newTotal: 150,
      })
      expect(plan).toEqual({
        action: 'resize_offline_amount',
        nextAmount: 150,
        preservePrepaymentUpdatedAt: true,
      })
    })

    it('does not resize when offline prepayment is only a partial deposit', () => {
      const plan = planAddItemPrepaymentUpdate({
        paymentMethod: 'offline',
        prepaymentAmount: 40,
        oldTotal: 100,
        newTotal: 150,
      })
      expect(plan).toEqual({ action: 'none' })
    })
  })

  describe('planUpdateItemPrepaymentUpdate', () => {
    it('matches addItem offline in-sync resize semantics', () => {
      expect(
        planUpdateItemPrepaymentUpdate({
          paymentMethod: 'offline',
          prepaymentAmount: 200,
          oldTotal: 200,
          newTotal: 180,
        }),
      ).toEqual({
        action: 'resize_offline_amount',
        nextAmount: 180,
        preservePrepaymentUpdatedAt: true,
      })
    })
  })

  describe('planDeleteItemPrepaymentUpdate', () => {
    it('shrinks offline prepayment when it exceeds the new total', () => {
      expect(
        planDeleteItemPrepaymentUpdate({
          paymentMethod: 'offline',
          prepaymentAmount: 200,
          newTotal: 150,
        }),
      ).toEqual({
        action: 'resize_offline_amount',
        nextAmount: 150,
        preservePrepaymentUpdatedAt: true,
      })
    })

    it('leaves online / unpaid alone', () => {
      expect(
        planDeleteItemPrepaymentUpdate({
          paymentMethod: 'online',
          prepaymentAmount: 200,
          newTotal: 100,
        }),
      ).toEqual({ action: 'none' })
    })
  })

  describe('planDiscountPrepaymentUpdate', () => {
    it('resizes offline in-sync prepaid after discount', () => {
      expect(
        planDiscountPrepaymentUpdate({
          paymentMethod: 'offline',
          prepaymentAmount: 100,
          oldTotal: 100,
          newTotal: 90,
        }),
      ).toEqual({
        action: 'resize_offline_amount',
        nextAmount: 90,
        preservePrepaymentUpdatedAt: true,
      })
    })
  })
})
