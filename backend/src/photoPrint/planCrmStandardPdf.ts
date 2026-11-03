import { groupPhotoOrdersByProduction } from './photoProductionGroups'
import type { SavedOrder } from './photoPrintTypes'
import { crmMarkedPdfFilename } from './crmPhotoPdfFilename'

/** Сколько отпечатков держать в одном SRA3 PDF. Совпадает с сайтом. */
export const STANDARD_SRA3_PDF_MAX_SLOTS = 80

export type CrmStandardPdfPart = {
  filename: string
  orders: SavedOrder[]
  partNumber?: number
}

export function isStandardPhotoOrder(order: SavedOrder): boolean {
  if (order.orderType !== 'photo') return false
  if (order.printType != null) return order.printType === 'digital'
  return Boolean(order.orderName?.includes('Стандарт -'))
}

function hasPhotoMockup(order: SavedOrder): boolean {
  return order.items.some((item) => Boolean(item.mockupId))
}

function photoSlotCount(quantity: unknown): number {
  const parsed = Math.floor(Number(quantity ?? 1))
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return parsed
}

function splitSavedOrdersByPhotoSlots(orders: SavedOrder[], maxSlots: number): SavedOrder[][] {
  const limit = Math.max(1, Math.floor(maxSlots))
  const chunks: SavedOrder[][] = []
  let current: SavedOrder[] = []
  let used = 0

  const flush = () => {
    if (current.length === 0) return
    chunks.push(current)
    current = []
    used = 0
  }

  for (const order of orders) {
    for (const item of order.items) {
      if (!item.mockupId) continue
      let left = photoSlotCount(item.quantity)
      while (left > 0) {
        if (used >= limit) flush()
        const take = Math.min(left, limit - used)
        let bucket = current.find((candidate) => candidate.orderId === order.orderId)
        if (!bucket) {
          bucket = { ...order, items: [] }
          current.push(bucket)
        }
        bucket.items.push({ ...item, quantity: take })
        used += take
        left -= take
      }
    }
  }

  flush()
  return chunks
}

function standardSra3PartFilename(baseName: string, index: number, total: number): string {
  if (total <= 1 || index === 0) return baseName
  return baseName.replace(/\.pdf$/i, `_part_${String(index + 1).padStart(2, '0')}.pdf`)
}

export function planCrmStandardPdfParts(orders: SavedOrder[]): CrmStandardPdfPart[] {
  const standard = orders.filter((order) => isStandardPhotoOrder(order) && hasPhotoMockup(order))
  const parts: CrmStandardPdfPart[] = []
  for (const group of groupPhotoOrdersByProduction(standard)) {
    const chunks = splitSavedOrdersByPhotoSlots(group.orders, STANDARD_SRA3_PDF_MAX_SLOTS)
    chunks.forEach((chunk, index) => {
      const siteName = standardSra3PartFilename(group.filename, index, chunks.length)
      const multiple = chunks.length > 1
      parts.push({
        filename: crmMarkedPdfFilename(siteName),
        orders: chunk,
        ...(multiple ? { partNumber: index + 1 } : {}),
      })
    })
  }
  return parts
}
