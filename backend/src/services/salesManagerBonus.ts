/** Премия продажника: 500 руб. за каждые 10 000 руб. оборота закреплённых юрлиц. */
export const SALES_BONUS_STEP = 10_000
export const SALES_BONUS_AMOUNT = 500

export type SalesManagerBonus = {
  turnover: number
  steps: number
  bonus: number
  remainder: number
  untilNext: number
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function salesManagerBonusFromTurnover(turnover: number): SalesManagerBonus {
  const safe = Math.max(0, roundMoney(Number(turnover) || 0))
  const steps = Math.floor((safe + 0.0001) / SALES_BONUS_STEP)
  const covered = roundMoney(steps * SALES_BONUS_STEP)
  const remainder = roundMoney(Math.max(0, safe - covered))
  return {
    turnover: safe,
    steps,
    bonus: roundMoney(steps * SALES_BONUS_AMOUNT),
    remainder,
    untilNext: remainder <= 0.004 ? SALES_BONUS_STEP : roundMoney(SALES_BONUS_STEP - remainder),
  }
}

/** День, на который садится месячная премия в расходе «Зарплата»: последний день месяца. */
export function salesBonusPayrollDate(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const last = new Date(year, month, 0).getDate()
  return `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}`
}
