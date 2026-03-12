import { Item } from '../../models/Item'

export type ItemRow = {
  id: number
  orderId: number
  type: string
  params: string | Record<string, unknown>
  price: number
  quantity: number
  printerId?: number | null
  printer_id?: number | null
  sides: number
  sheets: number
  waste: number
  clicks: number
  executor_user_id?: number | null
}

export const itemRowSelect = 'id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks, executor_user_id'

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
  // Сначала из колонки (с учётом разного регистра), затем из params — на проде колонка может не возвращаться
  const rawRow = row as Record<string, unknown>
  let rowPrinterId: unknown = rawRow.printerId ?? rawRow.printer_id ?? rawRow.PRINTERID
  if (rowPrinterId == null) {
    const key = Object.keys(rawRow).find((k) => k.toLowerCase() === 'printerid')
    if (key) rowPrinterId = rawRow[key]
  }
  if (rowPrinterId == null && parsedParams && typeof (parsedParams as any).printerId === 'number') {
    rowPrinterId = (parsedParams as any).printerId
  }
  const printerId =
    rowPrinterId != null && Number.isFinite(Number(rowPrinterId)) ? Number(rowPrinterId) : undefined
  return {
    id: row.id,
    orderId: row.orderId,
    type: row.type,
    params: parsedParams,
    price: row.price,
    quantity: row.quantity ?? 1,
    printerId,
    sides: row.sides,
    sheets: row.sheets,
    waste: row.waste,
    clicks: row.clicks,
    executor_user_id: row.executor_user_id ?? undefined,
  }
}


