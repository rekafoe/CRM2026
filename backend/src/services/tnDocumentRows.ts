import { applyVatToAmounts } from '../utils/documentVat'
import { discountedItemAmounts, type ItemLike } from '../utils/orderAmounts'

export class TnDocumentError extends Error {
  status = 400
}

export type TnSourceItem = {
  orderId: number
  price: number
  quantity: number
  params: unknown
  name?: string
  type?: string
}

export type TnDocumentRow = {
  number: number
  name: string
  unit: string
  quantity: number
  price: number
  amount: number
  vatRate: string
  vatAmount: number
  totalWithVat: number
}

const DESIGN_MARK = /макет|дизайн|в[её]рстк|\bdesign\b/i

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function readParams(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '{}')
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

/** Тираж в штуках. Листы печати в накладную не подставляем. */
export function tnPieceQuantity(item: TnSourceItem): number {
  const qty = Number(item.quantity)
  if (Number.isFinite(qty) && qty > 0) return qty
  const params = readParams(item.params)
  const specs = (params.specifications && typeof params.specifications === 'object'
    ? params.specifications
    : {}) as Record<string, unknown>
  const fromSpecs = Number(specs.quantity)
  if (Number.isFinite(fromSpecs) && fromSpecs > 0) return fromSpecs
  return 1
}

/** Название готового изделия, без раскладки на печать и операции. */
export function tnGoodsName(item: TnSourceItem): string {
  const params = readParams(item.params)
  const candidates = [params.productName, params.customName, item.name, item.type]
  for (const value of candidates) {
    const text = String(value ?? '').trim()
    if (text && text.toLowerCase() !== 'custom') return text
  }
  return 'Товар'
}

/**
 * Макет и дизайн без изделия. Позиция с тиражом или материалом остаётся товаром,
 * даже если в названии есть слово «дизайн».
 */
export function isDesignOnlyItem(item: TnSourceItem): boolean {
  const params = readParams(item.params)
  const specs = (params.specifications && typeof params.specifications === 'object'
    ? params.specifications
    : {}) as Record<string, unknown>
  const layout = (params.layout && typeof params.layout === 'object'
    ? params.layout
    : specs.layout && typeof specs.layout === 'object'
      ? specs.layout
      : {}) as Record<string, unknown>
  const type = String(item.type || params.productType || specs.productType || '').trim()
  const name = [params.productName, params.customName, item.name, type]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const marked = DESIGN_MARK.test(name) || type.toLowerCase() === 'design'
  if (!marked) return false
  const sheets = Number(params.sheetsNeeded ?? specs.sheetsNeeded ?? layout.sheetsNeeded) || 0
  const materials = Array.isArray(params.materials) ? params.materials.length : 0
  return sheets <= 0 && materials <= 0
}

/**
 * Одна товарная строка на позицию. Сумма строки — итог позиции после скидки.
 * У заказа только из изделий итог совпадает с актом и счётом.
 * Макет и дизайн в строки не входят.
 */
export function buildTnDocumentRows(
  items: TnSourceItem[],
  getDiscountPercent: (orderId: number) => number,
  vatRate: number | null = null,
): {
  orderItems: TnDocumentRow[]
  totalAmount: number
  totalQuantity: number
  /** Сумма товара по заказу. Заказ только из макета сюда не входит. */
  orderTotals: Map<number, number>
} {
  const byOrder = new Map<number, TnSourceItem[]>()
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? []
    list.push(item)
    byOrder.set(item.orderId, list)
  }

  const raw: Array<Omit<TnDocumentRow, 'number' | 'vatRate' | 'vatAmount' | 'totalWithVat'>> = []
  const orderTotals = new Map<number, number>()
  for (const [orderId, orderItems] of byOrder) {
    const amounts = discountedItemAmounts(orderItems as ItemLike[], getDiscountPercent(orderId))
    orderItems.forEach((item, index) => {
      if (isDesignOnlyItem(item)) return
      const amount = round2(amounts[index] ?? 0)
      const quantity = tnPieceQuantity(item)
      raw.push({
        name: tnGoodsName(item),
        unit: 'шт.',
        quantity,
        price: quantity > 0 ? round2(amount / quantity) : amount,
        amount,
      })
      orderTotals.set(orderId, round2((orderTotals.get(orderId) ?? 0) + amount))
    })
  }

  if (raw.length === 0) {
    throw new TnDocumentError(
      'В выбранных заказах нет товара для накладной. Макет и дизайн остаются в акте и счёте.',
    )
  }

  const numbered = raw.map((row, index) => ({
    number: index + 1,
    ...row,
    vatRate: 'Без НДС',
    vatAmount: 0,
    totalWithVat: row.amount,
  }))
  const orderItems = applyVatToAmounts(numbered, vatRate)
  const totalAmount = round2(orderItems.reduce((sum, row) => sum + row.amount, 0))
  const totalQuantity = orderItems.reduce((sum, row) => sum + row.quantity, 0)
  return { orderItems, totalAmount, totalQuantity, orderTotals }
}
