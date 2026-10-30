type DayOrder = {
  userId?: number | null
  contact_user_id?: number | null
  opened_on?: string | null
  created_at?: string | null
  createdAt?: string | null
  is_cancelled?: number | boolean | null
}

export function orderCalendarDay(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

export function isCancelledOrderFlag(order: { is_cancelled?: number | boolean | null }): boolean {
  return Number(order.is_cancelled) === 1
}

/** Контактёр после передачи: заказ виден в день создания, не в день нового владельца. */
export function isContactOnlyOnDay(order: DayOrder, viewerId: number | null, day: string): boolean {
  if (viewerId == null || isCancelledOrderFlag(order)) return false
  const contactId = Number(order.contact_user_id)
  if (!Number.isFinite(contactId) || contactId !== viewerId) return false
  const ownerId = order.userId == null ? null : Number(order.userId)
  if (ownerId == null || !Number.isFinite(ownerId) || ownerId === viewerId) return false
  const opened = orderCalendarDay(order.opened_on) || orderCalendarDay(order.created_at ?? order.createdAt)
  return opened === day.slice(0, 10)
}

/** День, в который заказ должен лежать у владельца или оставшегося контактёра. */
export function ownerOrContactDay(order: DayOrder, viewerId: number): string | null {
  if (isCancelledOrderFlag(order)) return null
  const ownerId = order.userId == null ? null : Number(order.userId)
  if (ownerId === viewerId) return orderCalendarDay(order.created_at ?? order.createdAt)
  const contactId = Number(order.contact_user_id)
  if (
    ownerId != null
    && Number.isFinite(ownerId)
    && Number.isFinite(contactId)
    && contactId === viewerId
    && ownerId !== viewerId
  ) {
    return orderCalendarDay(order.opened_on) || orderCalendarDay(order.created_at ?? order.createdAt)
  }
  return null
}
