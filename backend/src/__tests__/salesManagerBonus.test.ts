import { salesBonusPayrollDate, salesManagerBonusFromTurnover } from '../services/salesManagerBonus'

describe('премия продажника за юрлица', () => {
  it('даёт 500 за каждые 10 000 и оставляет остаток', () => {
    expect(salesManagerBonusFromTurnover(25_000)).toEqual({
      turnover: 25_000,
      steps: 2,
      bonus: 1_000,
      remainder: 5_000,
      untilNext: 5_000,
    })
  })

  it('не платит, пока оборот не дошёл до 10 000', () => {
    expect(salesManagerBonusFromTurnover(9_999.99).bonus).toBe(0)
    expect(salesManagerBonusFromTurnover(9_999.99).untilNext).toBe(0.01)
  })

  it('после ровных 10 000 следующая премия снова через 10 000', () => {
    const bonus = salesManagerBonusFromTurnover(10_000)
    expect(bonus.bonus).toBe(500)
    expect(bonus.remainder).toBe(0)
    expect(bonus.untilNext).toBe(10_000)
  })

  it('сажает премию месяца на последний день', () => {
    expect(salesBonusPayrollDate('2026-02')).toBe('2026-02-28')
    expect(salesBonusPayrollDate('2024-02')).toBe('2024-02-29')
  })
})
