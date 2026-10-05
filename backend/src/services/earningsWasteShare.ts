export type WasteShare = { userId: number; amount: number }

/** Делит сумму поровну до копейки. Остаток копеек получает исполнитель с меньшим id. */
export function splitEqualMoney(total: number, userIds: number[]): WasteShare[] {
  const ids = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))].sort((a, b) => a - b)
  const cents = Math.round(Math.max(0, Number(total) || 0) * 100)
  if (ids.length === 0 || cents <= 0) return []
  const base = Math.floor(cents / ids.length)
  let remainder = cents - base * ids.length
  return ids
    .map((userId) => {
      const extra = remainder > 0 ? 1 : 0
      if (remainder > 0) remainder -= 1
      return { userId, amount: (base + extra) / 100 }
    })
    .filter((row) => row.amount > 0)
}
