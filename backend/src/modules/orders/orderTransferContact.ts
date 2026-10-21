type ContactCarrier = {
  contact_user_id?: number | null
  responsible_user_id?: number | null
  userId?: number | null
}

function positiveUserId(value: unknown): number | null {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/** Галочка «передать контактёра» срабатывает только при явном да. Пустое и false контактёра не двигают. */
export function shouldTransferContact(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/**
 * Кого оставить контактёром, если галочка снята.
 * Сначала уже записанный контактёр, иначе текущий ответственный или владелец заказа:
 * иначе смена userId при передаче забирает роль у менеджера, у которого отдельный contact_user_id ещё пуст.
 */
export function contactToKeep(existing: ContactCarrier): number | null {
  return (
    positiveUserId(existing.contact_user_id)
    ?? positiveUserId(existing.responsible_user_id)
    ?? positiveUserId(existing.userId)
  )
}

export function resolveColleagueContactUserId(
  transferContact: unknown,
  targetUserId: number,
  existing: ContactCarrier,
): number | null {
  if (shouldTransferContact(transferContact)) return targetUserId
  return contactToKeep(existing)
}
