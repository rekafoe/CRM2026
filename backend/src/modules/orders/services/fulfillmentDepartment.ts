import { getDb } from '../../../config/database'
import {
  pickupDepartmentLookupCodes,
  resolveSitePickupDepartmentCode,
} from '../../../config/sitePickupPoints'
import type { WebsiteOrderDelivery } from '../../../types/websiteOrderDelivery'

/** Резолв точки исполнения по delivery с сайта (kind=pickup + providerId = departments.code). */
export async function resolveFulfillmentDepartmentId(
  delivery: WebsiteOrderDelivery | null | undefined
): Promise<number | null> {
  if (!delivery || delivery.kind !== 'pickup') return null
  const codes = pickupDepartmentLookupCodes(delivery.providerId)
  if (codes.length === 0) return null
  const canonical = resolveSitePickupDepartmentCode(delivery.providerId)
  const db = await getDb()
  const placeholders = codes.map(() => '?').join(', ')
  const row = await db.get<{ id: number }>(
    `SELECT id FROM departments
     WHERE code IN (${placeholders}) AND COALESCE(is_active, 1) = 1
     ORDER BY CASE code WHEN ? THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [...codes, canonical]
  )
  return row?.id ?? null
}
