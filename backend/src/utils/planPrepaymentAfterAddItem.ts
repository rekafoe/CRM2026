/**
 * Решение: авто-выставлять/синхронизировать предоплату при addItem.
 * Только явный paymentMethod=offline. SQLite DEFAULT 'online' и online/pending
 * не должны превращать первую позицию в «оплачено офлайн» на всю сумму.
 */
export function planPrepaymentAfterAddItem(input: {
  paymentMethod: string | null | undefined
  prepaymentAmount: number
  prepaymentStatus: string | null | undefined
  oldTotal: number
  newTotal: number
}): { shouldSet: boolean; amount: number } {
  const method = String(input.paymentMethod ?? '').toLowerCase()
  if (method !== 'offline') {
    return { shouldSet: false, amount: input.prepaymentAmount }
  }
  if (!(input.newTotal > 0)) {
    return { shouldSet: false, amount: input.prepaymentAmount }
  }
  const status = String(input.prepaymentStatus ?? '').trim()
  const hasPrepayment = input.prepaymentAmount > 0 || status.length > 0
  const inSync = Math.abs(input.prepaymentAmount - input.oldTotal) < 0.005
  if (!hasPrepayment || inSync) {
    return { shouldSet: true, amount: input.newTotal }
  }
  return { shouldSet: false, amount: input.prepaymentAmount }
}
