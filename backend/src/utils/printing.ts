export function computeClicks(sheets: number, sides: number): number {
  const safeSheets = Math.max(0, Number(sheets) || 0)
  const safeSides = Math.max(1, Number(sides) || 1)
  return safeSheets * (safeSides * 2)
}

export function ceilRequiredQuantity(perItem: number, quantity: number): number {
  const per = Math.max(0, Number(perItem) || 0)
  const qty = Math.max(1, Number(quantity) || 1)
  return Math.ceil(per * qty)
}


