/** Доля календарного месяца, которая уже прошла. Закрытый месяц — 1, будущий — 0. */
export function getMonthProgress(month: string, now = new Date()): number {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return 1;

  const selectedStart = new Date(year, monthIndex - 1, 1);
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();

  if (selectedStart < currentStart) return 1;
  if (selectedStart > currentStart) return 0;

  return Math.max(1 / daysInMonth, Math.min(1, now.getDate() / daysInMonth));
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return currentMonthKey(new Date(year, monthIndex - 1 + delta, 1));
}
