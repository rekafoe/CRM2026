/**
 * Минимальная проверка для SMTP: отсекает «123», телефоны без @, пустые строки.
 */
export function isValidEmailAddress(raw: string): boolean {
  const s = String(raw || '').trim();
  if (s.length < 5 || s.length > 320) return false;
  if (/\s/.test(s)) return false;
  const at = s.indexOf('@');
  if (at < 1) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  const lastDot = domain.lastIndexOf('.');
  if (lastDot < 1 || lastDot >= domain.length - 1) return false;
  return true;
}
