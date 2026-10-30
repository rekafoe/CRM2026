/** День заказа для контактёра, который остался после передачи. Не перезаписывается сменой даты оформления. */

export function calendarDay(value: string | null | undefined): string {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text) return ''
  return text.slice(0, 10)
}

/** Первая известная дата оформления. Уже записанный день не затирается переносом created_at. */
export function freezeOpenedOn(
  existingOpenedOn: string | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  const existing = calendarDay(existingOpenedOn)
  if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) return existing
  const created = calendarDay(createdAt)
  return /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : null
}

/**
 * Контактёр, который уже не владелец, видит заказ в дне создания.
 * Владелец смотрит свой день по created_at, этот фрагмент его не дублирует.
 */
export function contactOnlyOnDaySql(options: { alias?: string; hasOpenedOn: boolean }): string {
  const alias = options.alias ?? 'o'
  const opened = options.hasOpenedOn
    ? `date(COALESCE(${alias}.opened_on, ${alias}.created_at, ${alias}.createdAt))`
    : `date(COALESCE(${alias}.created_at, ${alias}.createdAt))`
  return `(${alias}.contact_user_id = ? AND ${alias}.userId IS NOT NULL AND ${alias}.contact_user_id != ${alias}.userId AND ${opened} = date(?))`
}

export function contactOnlyAnyDaySql(alias = 'o'): string {
  return `(${alias}.contact_user_id = ? AND ${alias}.userId IS NOT NULL AND ${alias}.contact_user_id != ${alias}.userId)`
}
