import { getCashRegisterDay } from './cashRegisterDayService'
import { getDepartmentCashActual } from './departmentCashActualService'
import { datesInMonth, previousCalendarDate } from '../utils/calendarMonth'

export type MonthCashCounterDaily = {
  /** `cash_in_today` из getCashRegisterDay на каждый день месяца. */
  cash_in_today_by_date: Record<string, number>
  /**
   * Факт терминала по точке. Ключ дня до начала месяца — вчера для 1-го числа.
   * Без точки поле пустое: факт хранится только по department_id.
   */
  cash_actual_by_date: Record<string, number | null>
  previous_cash_actual: number | null
}

/**
 * Дневные источники кассы на каждый день месяца.
 * Не месячная формула: для каждого дня вызываются getCashRegisterDay и getDepartmentCashActual.
 */
export async function loadMonthCashCounterDaily(
  month: string,
  departmentId: number | undefined,
): Promise<MonthCashCounterDaily> {
  const dates = datesInMonth(month)
  const cash_in_today_by_date: Record<string, number> = {}
  for (const date of dates) {
    const day = await getCashRegisterDay(date, departmentId)
    cash_in_today_by_date[date] = Number(day.cash_in_today ?? 0)
  }

  if (departmentId == null) {
    return {
      cash_in_today_by_date,
      cash_actual_by_date: {},
      previous_cash_actual: null,
    }
  }

  const previousDate = dates[0] ? previousCalendarDate(dates[0]) : ''
  const previous_cash_actual = previousDate
    ? await getDepartmentCashActual(previousDate, departmentId)
    : null
  const cash_actual_by_date: Record<string, number | null> = {}
  if (previousDate) cash_actual_by_date[previousDate] = previous_cash_actual
  for (const date of dates) {
    cash_actual_by_date[date] = await getDepartmentCashActual(date, departmentId)
  }
  return { cash_in_today_by_date, cash_actual_by_date, previous_cash_actual }
}
