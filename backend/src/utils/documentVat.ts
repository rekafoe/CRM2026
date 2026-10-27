/** НДС в цене. Пустая ставка — «Без НДС», сумма строки уже конечная. */

export type VatLine = {
  amount: number
  vatRate: string
  vatAmount: number
  totalWithVat: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function normalizeVatRate(value: unknown): number | null {
  if (value == null || value === '') return null
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return null
  return round2(rate)
}

/** Ставка берётся из организации. Цена для клиента включает НДС. */
export function applyVatToAmounts<T extends { amount: number }>(
  lines: T[],
  vatRate: number | null,
): Array<T & VatLine> {
  const rate = normalizeVatRate(vatRate)
  if (!rate) {
    return lines.map((line) => ({
      ...line,
      vatRate: 'Без НДС',
      vatAmount: 0,
      totalWithVat: round2(line.amount),
    }))
  }

  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0))
  const vatTotal = round2(total * rate / (100 + rate))
  let assigned = 0
  return lines.map((line, index) => {
    const isLast = index === lines.length - 1
    const vatAmount = isLast
      ? round2(vatTotal - assigned)
      : round2(line.amount * rate / (100 + rate))
    if (!isLast) assigned = round2(assigned + vatAmount)
    return {
      ...line,
      vatRate: `${rate}%`,
      vatAmount,
      totalWithVat: round2(line.amount),
    }
  })
}
