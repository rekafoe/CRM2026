/**
 * Делит сумму строки так, чтобы у каждой части цена × количество
 * совпадала с суммой до копейки, а части вместе давали исходную сумму.
 */

export type PricedSlice = {
  quantity: number
  price: number
  amount: number
  adjustment?: boolean
}

function toKopecks(value: number): number {
  return Math.round(value * 100)
}

function fromKopecks(value: number): number {
  return value / 100
}

export function pricedSlices(amount: number, quantity: number): PricedSlice[] {
  const totalKopecks = toKopecks(amount)
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) {
    const whole = fromKopecks(totalKopecks)
    return [{ quantity: 1, price: whole, amount: whole }]
  }
  if (totalKopecks === 0) {
    return [{ quantity: qty, price: 0, amount: 0 }]
  }

  const qtyInt = Math.round(qty)
  if (Math.abs(qty - qtyInt) < 1e-6 && qtyInt > 0) {
    const base = Math.floor(totalKopecks / qtyInt)
    const extra = totalKopecks - base * qtyInt
    const slices: PricedSlice[] = []
    const cheapQty = qtyInt - extra
    if (cheapQty > 0) {
      slices.push({
        quantity: cheapQty,
        price: fromKopecks(base),
        amount: fromKopecks(cheapQty * base),
      })
    }
    if (extra > 0) {
      slices.push({
        quantity: extra,
        price: fromKopecks(base + 1),
        amount: fromKopecks(extra * (base + 1)),
      })
    }
    return slices
  }

  for (const digits of [2, 4]) {
    const factor = 10 ** digits
    const price = Math.round((amount / qty) * factor) / factor
    if (toKopecks(price * qty) === totalKopecks) {
      return [{ quantity: qty, price, amount: fromKopecks(totalKopecks) }]
    }
  }

  const price = fromKopecks(Math.round((amount / qty) * 100))
  const extended = toKopecks(price * qty)
  const diff = totalKopecks - extended
  const slices: PricedSlice[] = [
    { quantity: qty, price, amount: fromKopecks(extended) },
  ]
  if (diff !== 0) {
    slices.push({
      quantity: 1,
      price: fromKopecks(diff),
      amount: fromKopecks(diff),
      adjustment: true,
    })
  }
  return slices
}
