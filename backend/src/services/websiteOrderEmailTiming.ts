/**
 * Сроки писем по заказам с сайта.
 *
 * «Принят в работу» уходит сразу при смене статуса.
 * О готовности — не в момент статуса, а за сутки до планируемой даты,
 * и только если заказ уже в готовом статусе: выполнен, передан в ПВЗ
 * или получен в ПВЗ. Если это окно уже позади, письмо уходит на ближайшем проходе.
 * «Завершён» не шлётся сменой статуса: только после закрытия долга.
 */

export const WEBSITE_READY_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

const READY_CODES = new Set(['done', 'at_pickup', 'picked_up'])
const READY_NAMES = new Set(['выполнен', 'готов', 'передан в пвз', 'получен в пвз'])

export function normalizeStatusName(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/** Заказ уже готов к выдаче, в том числе когда он получен в ПВЗ. */
export function isReadyNotifyStatus(code?: string | null, name?: string | null): boolean {
  const statusCode = String(code || '').trim()
  if (READY_CODES.has(statusCode)) return true
  return READY_NAMES.has(normalizeStatusName(name))
}

export function isCompletedOrderStatus(code?: string | null, name?: string | null): boolean {
  if (String(code || '').trim() === 'completed') return true
  const statusName = normalizeStatusName(name)
  return statusName === 'завершен' || statusName.startsWith('завершен ')
}

export function shouldDeferWebsiteReadyEmail(
  source?: string | null,
  code?: string | null,
  name?: string | null,
): boolean {
  return source === 'website' && isReadyNotifyStatus(code, name)
}

/** true, когда сейчас уже не раньше чем за сутки до планируемой готовности. */
export function isWebsiteReadyReminderDue(readyAtMs: number | null, nowMs: number): boolean {
  if (readyAtMs == null || !Number.isFinite(readyAtMs) || !Number.isFinite(nowMs)) return false
  return nowMs >= readyAtMs - WEBSITE_READY_REMINDER_LEAD_MS
}
