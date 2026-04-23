/**
 * Минимальная нормализация телефона для BY (и общая подстановка цифр + длина).
 */
export function normalizePhoneForSms(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).replace(/[\s()-]/g, '')
  if (!s) return null
  if (s.startsWith('+')) {
    return s.length >= 10 ? s : null
  }
  if (s.startsWith('80') && s.length === 11) {
    return `+375${s.slice(2)}`
  }
  if (s.startsWith('375')) {
    return `+${s}`
  }
  if (s.length >= 9) {
    if (s.startsWith('8') && s.length === 11) {
      return `+375${s.slice(1)}`
    }
  }
  return s.length >= 9 ? s : null
}
