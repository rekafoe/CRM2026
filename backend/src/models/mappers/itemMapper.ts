import { Item } from '../../models/Item'

export type ItemRow = {
  id: number
  orderId: number
  type: string
  params: string | Record<string, unknown>
  price: number
  quantity: number
  printerId: number | null
  sides: number
  sheets: number
  waste: number
  clicks: number
}

export const itemRowSelect = 'id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks'

export function mapItemRowToItem(row: ItemRow): Item {
  let parsedParams: Item['params']
  try {
    const raw = typeof row.params === 'string' ? JSON.parse(row.params) : row.params
    // Сохраняем все поля из raw, включая specifications, materials, services и т.д.
    parsedParams = {
      ...(raw as any),
      description: (raw as any)?.description ?? 'Без описания',
    }
  } catch {
    parsedParams = { description: 'Ошибка данных' }
  }
  return {
    id: row.id,
    orderId: row.orderId,
    type: row.type,
    params: parsedParams,
    price: row.price,
    quantity: row.quantity ?? 1,
    printerId: row.printerId ?? undefined,
    sides: row.sides,
    sheets: row.sheets,
    waste: row.waste,
    clicks: row.clicks,
  }
}


