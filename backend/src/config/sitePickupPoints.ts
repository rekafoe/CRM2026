/**
 * Точки самовывоза с сайта (`lib/site/branches.ts` → `pickupId`).
 * `code` = `departments.code` = `delivery.providerId` при kind=pickup.
 */
export type SitePickupPoint = {
  code: string
  name: string
  address: string
  description: string
  sortOrder: number
  /** Старые id корзины / swagger, которые должны резолвиться в эту точку */
  aliases: readonly string[]
}

export const SITE_PICKUP_POINTS: readonly SitePickupPoint[] = [
  {
    code: 'pickup-dzerzhinskogo-3b',
    name: 'Проспект Дзержинского 3Б',
    address: 'г. Минск, пр. Дзержинского 3Б',
    description: 'Точка самовывоза · Грушевка',
    sortOrder: 0,
    aliases: ['pickup-gikalo', 'pickup-dzerzhinsky-3b'],
  },
  {
    code: 'pickup-dzerzhinskogo-104',
    name: 'Проспект Дзержинского 104',
    address: 'г. Минск, пр. Дзержинского 104',
    description: 'Точка самовывоза · Петровщина',
    sortOrder: 1,
    aliases: [],
  },
]

export function findSitePickupPoint(providerId: string): SitePickupPoint | undefined {
  const raw = String(providerId ?? '').trim()
  if (!raw) return undefined
  return SITE_PICKUP_POINTS.find(
    (point) => point.code === raw || point.aliases.includes(raw)
  )
}

/** Канонический departments.code для providerId с сайта (или исходная строка). */
export function resolveSitePickupDepartmentCode(providerId: string): string {
  const raw = String(providerId ?? '').trim()
  return findSitePickupPoint(raw)?.code ?? raw
}

/**
 * Все коды, по которым можно найти департамент: канон + алиасы.
 * Нужно, пока в БД ещё `pickup-gikalo`, а сайт уже шлёт `pickup-dzerzhinskogo-3b`.
 */
export function pickupDepartmentLookupCodes(providerId: string): string[] {
  const raw = String(providerId ?? '').trim()
  if (!raw) return []
  const point = findSitePickupPoint(raw)
  if (!point) return [raw]
  return Array.from(new Set([point.code, ...point.aliases]))
}
