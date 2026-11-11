export function datesInMonth(month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return []
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDay = new Date(year, monthIndex, 0).getDate()
  const dates: string[] = []
  for (let day = 1; day <= lastDay; day += 1) {
    dates.push(`${month}-${String(day).padStart(2, '0')}`)
  }
  return dates
}

export function previousCalendarDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1)
  date.setDate(date.getDate() - 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
