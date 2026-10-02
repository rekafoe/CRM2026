/**
 * Сроки писем по заказам с сайта.
 *
 * «Принят в работу» уходит сразу при смене статуса.
 * О готовности встаёт в очередь только на «Получен в ПВЗ» и ждёт за сутки
 * до планируемой даты. Если статус сменили раньше отправки, письмо из очереди снимается.
 * «Завершён» не шлётся сменой статуса: только после закрытия долга.
 */

export const WEBSITE_READY_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

const WEBSITE_SILENT_READY_CODES = new Set(['done', 'at_pickup', 'picked_up'])
const WEBSITE_SILENT_READY_NAMES = new Set(['выполнен', 'готов', 'передан в пвз', 'получен в пвз'])

export function normalizeStatusName(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/** Письмо о готовности ставится в очередь только из этого статуса. */
export function isPickedUpNotifyStatus(code?: string | null, name?: string | null): boolean {
  if (String(code || '').trim() === 'picked_up') return true
  return normalizeStatusName(name) === 'получен в пвз'
}

/**
 * Для сайта «выполнен», «передан в ПВЗ» и «получен в ПВЗ» не шлют мгновенное письмо по правилу.
 * Отложенная готовность живёт отдельно и только для «получен в ПВЗ».
 */
export function shouldSkipImmediateWebsiteReadyEmail(
  source?: string | null,
  code?: string | null,
  name?: string | null,
): boolean {
  if (source !== 'website') return false
  if (WEBSITE_SILENT_READY_CODES.has(String(code || '').trim())) return true
  return WEBSITE_SILENT_READY_NAMES.has(normalizeStatusName(name))
}

export function isCompletedOrderStatus(code?: string | null, name?: string | null): boolean {
  if (String(code || '').trim() === 'completed') return true
  const statusName = normalizeStatusName(name)
  return statusName === 'завершен' || statusName.startsWith('завершен ')
}

/** Момент постановки в отправку: не раньше чем за сутки до готовности, иначе сразу. */
export function websiteReadyReminderSendAtMs(readyAtMs: number | null, nowMs: number): number | null {
  if (readyAtMs == null || !Number.isFinite(readyAtMs) || !Number.isFinite(nowMs)) return null
  return Math.max(nowMs, readyAtMs - WEBSITE_READY_REMINDER_LEAD_MS)
}
