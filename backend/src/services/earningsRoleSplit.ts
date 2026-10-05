/** Доли контактёра и ответственного с базы позиции, если в настройках ещё нет своих чисел. */
export const DEFAULT_CONTACT_ORDER_PERCENT = 1
export const DEFAULT_RESPONSIBLE_ORDER_PERCENT = 5

export const CONTACT_ORDER_PERCENT_KEY = 'contact_order_percent'
export const RESPONSIBLE_ORDER_PERCENT_KEY = 'responsible_order_percent'

export type EarningsRole = 'contact' | 'responsible' | 'operator'

export type RoleEarning = {
  role: EarningsRole
  userId: number
  percent: number
  amount: number
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(100, value)
}

/** База после платы за макет и прямых расходов. Ниже нуля не уходит. */
export function earningsBase(lineTotal: number, designFee: number, directCost: number): number {
  const revenue = Number(lineTotal) || 0
  const fee = Math.max(0, Number(designFee) || 0)
  const cost = Math.max(0, Number(directCost) || 0)
  return roundMoney(Math.max(0, revenue - fee - cost))
}

/**
 * Контактёр и ответственный всегда берут свои пункты.
 * Исполнитель получает остаток процента позиции, даже если роль не назначена:
 * неназначенная доля остаётся у компании и ставку исполнителя не увеличивает.
 */
export function splitPositionPercents(input: {
  positionPercent: number
  contactPercent: number
  responsiblePercent: number
}): { contact: number; responsible: number; executor: number } {
  const contact = clampPercent(input.contactPercent)
  const responsible = clampPercent(input.responsiblePercent)
  const position = clampPercent(input.positionPercent)
  const executor = roundMoney(Math.max(0, position - contact - responsible))
  return {
    contact: roundMoney(contact),
    responsible: roundMoney(responsible),
    executor,
  }
}

export function roleEarnings(input: {
  base: number
  positionPercent: number
  contactPercent: number
  responsiblePercent: number
  contactUserId?: number | null
  responsibleUserId?: number | null
  executorUserId?: number | null
}): RoleEarning[] {
  const rates = splitPositionPercents(input)
  const base = Math.max(0, Number(input.base) || 0)
  const rows: RoleEarning[] = []
  const push = (role: EarningsRole, userId: number | null | undefined, percent: number) => {
    const id = Number(userId)
    if (!Number.isFinite(id) || id <= 0 || percent <= 0 || base <= 0) return
    rows.push({
      role,
      userId: id,
      percent,
      amount: roundMoney((base * percent) / 100),
    })
  }
  push('contact', input.contactUserId, rates.contact)
  push('responsible', input.responsibleUserId, rates.responsible)
  push('operator', input.executorUserId, rates.executor)
  return rows.filter((row) => row.amount > 0)
}
