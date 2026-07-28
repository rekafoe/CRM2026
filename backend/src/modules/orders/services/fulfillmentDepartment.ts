import { getDb } from '../../../config/database'
import type { WebsiteOrderDelivery } from '../../../types/websiteOrderDelivery'

/** Резолв точки исполнения по delivery с сайта (kind=pickup + providerId = departments.code). */
export async function resolveFulfillmentDepartmentId(
  delivery: WebsiteOrderDelivery | null | undefined
): Promise<number | null> {
  if (!delivery || delivery.kind !== 'pickup') return null
  const code = String(delivery.providerId ?? '').trim()
  if (!code) return null
  const db = await getDb()
  const row = await db.get<{ id: number }>(
    `SELECT id FROM departments
     WHERE code = ? AND COALESCE(is_active, 1) = 1
     LIMIT 1`,
    [code]
  )
  return row?.id ?? null
}
