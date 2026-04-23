/**
 * Тихие часы SMS в визуальном времени Europe/Minsk (смещение +3, без DST).
 * Окно: [startMinutes, endMinutes) внутри суток.
 */

const MINSK_OFFSET_H = 3

/** wall-clock в Минске → Date в UTC */
export function minskWallToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  min: number,
  sec: number
): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - MINSK_OFFSET_H, min, sec))
}

function parseMinskParts(date: Date): { y: number; mo: number; d: number; h: number; min: number; sec: number } {
  const s = date.toLocaleString('sv-SE', { timeZone: 'Europe/Minsk' })
  const [dp, tp] = s.split(' ')
  const [y, mo, d] = dp.split('-').map((x) => parseInt(x, 10))
  const tpp = (tp || '0:0:0').split(':')
  const h = parseInt(tpp[0], 10)
  const min = parseInt(tpp[1], 10)
  const sec = parseInt(tpp[2] || '0', 10)
  return { y, mo, d, h, min, sec }
}

function addCalendarDaysMinsk(y: number, mo: number, d: number, delta: number): { y: number; mo: number; d: number } {
  const t = minskWallToUtc(y, mo, d, 12, 0, 0)
  t.setUTCDate(t.getUTCDate() + delta)
  return parseMinskParts(t)
}

function minutesOfDay(h: number, min: number): number {
  return h * 60 + min
}

/**
 * true если время в Minsk внутри [startMin, endMin) (например 8:30 — 20:00).
 */
export function isMinskInSendWindow(
  date: Date,
  startMin: number,
  endMin: number
): boolean {
  const p = parseMinskParts(date)
  const t = minutesOfDay(p.h, p.min)
  return t >= startMin && t < endMin
}

/**
 * Возвращает Date UTC: не раньше `candidate` и в допустимом окне (или следующий старт 8:30 Minsk).
 */
export function nextAllowedSendUtc(
  candidate: Date,
  startMin: number,
  endMin: number
): Date {
  const c = new Date(Math.max(Date.now(), candidate.getTime()))
  if (isMinskInSendWindow(c, startMin, endMin)) {
    return c
  }
  const p = parseMinskParts(c)
  const t = minutesOfDay(p.h, p.min)
  if (t < startMin) {
    return minskWallToUtc(p.y, p.mo, p.d, Math.floor(startMin / 60), startMin % 60, 0)
  }
  if (t >= endMin) {
    const next = addCalendarDaysMinsk(p.y, p.mo, p.d, 1)
    return minskWallToUtc(next.y, next.mo, next.d, Math.floor(startMin / 60), startMin % 60, 0)
  }
  return c
}
