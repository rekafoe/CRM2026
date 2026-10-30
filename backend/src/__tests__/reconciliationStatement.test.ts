import {
  buildReconciliationStatement,
  reconciliationBalancePhrase,
  reconciliationSourceFromOrder,
} from '../services/reconciliationStatement'

describe('акт сверки', () => {
  it('ставит в дебет заказ периода, в кредит оплату и оставляет долг', () => {
    const statement = buildReconciliationStatement(
      [
        {
          id: 1,
          number: 'ORD-1',
          orderDate: '2026-03-02',
          total: 100,
          collected: 40,
          paymentDate: '2026-03-10',
        },
      ],
      { from: '2026-03-01', to: '2026-03-31' },
    )
    expect(statement.openingBalance).toBe(0)
    expect(statement.lines.map((line) => [line.document, line.debit, line.credit, line.balance])).toEqual([
      ['Заказ ORD-1', 100, 0, 100],
      ['Оплата по заказу ORD-1', 0, 40, 60],
    ])
    expect(statement.closingBalance).toBe(60)
    expect(reconciliationBalancePhrase(statement.closingBalance)).toBe('Задолженность заказчика 60,00 бел. руб.')
  })

  it('относит ранний заказ в сальдо на начало, а оплату периода проводит отдельно', () => {
    const statement = buildReconciliationStatement(
      [
        {
          id: 2,
          number: 'ORD-2',
          orderDate: '2026-02-01',
          total: 80,
          collected: 80,
          paymentDate: '2026-03-05',
        },
      ],
      { from: '2026-03-01', to: '2026-03-31' },
    )
    expect(statement.openingBalance).toBe(80)
    expect(statement.lines).toEqual([
      expect.objectContaining({ document: 'Оплата по заказу ORD-2', credit: 80, balance: 0 }),
    ])
    expect(statement.closingBalance).toBe(0)
    expect(reconciliationBalancePhrase(0)).toBe('Задолженность отсутствует.')
  })

  it('не показывает заказ и оплату вне периода и фиксирует переплату', () => {
    const statement = buildReconciliationStatement(
      [
        {
          id: 3,
          number: 'ORD-3',
          orderDate: '2026-01-01',
          total: 10,
          collected: 25,
          paymentDate: '2026-01-02',
        },
        {
          id: 4,
          number: 'ORD-4',
          orderDate: '2026-04-01',
          total: 50,
          collected: 0,
          paymentDate: null,
        },
      ],
      { from: '2026-03-01', to: '2026-03-31' },
    )
    expect(statement.lines).toEqual([])
    expect(statement.openingBalance).toBe(-15)
    expect(statement.closingBalance).toBe(-15)
    expect(reconciliationBalancePhrase(-15)).toBe('Переплата заказчика 15,00 бел. руб.')
  })

  it('засчитывает сумму, внесённую в заказ по счёту, даже если оплата осталась online/pending', () => {
    const source = reconciliationSourceFromOrder({
      id: 11,
      number: 'ORD-11',
      created_at: '2026-10-02',
      totalAmount: 200,
      prepaymentAmount: 200,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      paymentChannel: 'invoice',
      prepaymentUpdatedAt: '2026-10-02 12:00:00',
    })
    expect(source.collected).toBe(200)
    expect(source.paymentDate).toBe('2026-10-02')
    const statement = buildReconciliationStatement([source], {})
    expect(statement.closingBalance).toBe(0)
  })

  it('не засчитывает неуспешную оплату по счёту', () => {
    const source = reconciliationSourceFromOrder({
      id: 12,
      number: 'ORD-12',
      created_at: '2026-10-02',
      totalAmount: 80,
      prepaymentAmount: 80,
      prepaymentStatus: 'failed',
      paymentMethod: 'online',
      paymentChannel: 'invoice',
    })
    expect(source.collected).toBe(0)
  })

  it('не считает ожидающую онлайн-оплату полученными деньгами', () => {
    const source = reconciliationSourceFromOrder({
      id: 9,
      number: 'ORD-9',
      created_at: '2026-03-04T12:00:00.000Z',
      totalAmount: 70,
      prepaymentAmount: 70,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      prepaymentUpdatedAt: '2026-03-04 15:00:00',
    })
    expect(source.collected).toBe(0)
    expect(source.paymentDate).toBeNull()
    expect(source.orderDate).toBe('2026-03-04')
  })

  it('ставит поступление менеджера в кредит и уменьшает долг', () => {
    const statement = buildReconciliationStatement(
      [
        {
          id: 5,
          number: 'ORD-5',
          orderDate: '2026-03-02',
          total: 100,
          collected: 0,
          paymentDate: null,
        },
      ],
      { from: '2026-03-01', to: '2026-03-31' },
      [{ id: 7, date: '2026-03-12', amount: 30, document: 'Поступление: платёжка' }],
    )
    expect(statement.lines.map((line) => [line.document, line.debit, line.credit, line.balance])).toEqual([
      ['Заказ ORD-5', 100, 0, 100],
      ['Поступление: платёжка', 0, 30, 70],
    ])
    expect(statement.closingBalance).toBe(70)
  })

  it('относит раннее поступление в сальдо на начало', () => {
    const statement = buildReconciliationStatement(
      [],
      { from: '2026-03-01', to: '2026-03-31' },
      [{ id: 8, date: '2026-02-01', amount: 15, document: 'Поступление' }],
    )
    expect(statement.lines).toEqual([])
    expect(statement.openingBalance).toBe(-15)
    expect(statement.closingBalance).toBe(-15)
  })
})
