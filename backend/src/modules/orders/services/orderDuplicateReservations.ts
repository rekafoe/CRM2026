import type { Database } from 'sqlite'

export type DuplicateItemComponent = {
  materialId: number
  qtyPerItem: number
  reservationId?: number
}

function isMeterUnit(unitRaw: unknown): boolean {
  const unit = String(unitRaw || '').trim().toLowerCase()
  return unit === 'м' || unit === 'пог.м' || unit === 'пог. м' || unit.includes('метр')
}

function computeRequiredQuantity(
  qtyPerItemRaw: unknown,
  orderQtyRaw: unknown,
  unitRaw?: unknown,
): number {
  const qtyPerItem = Math.max(0, Number(qtyPerItemRaw) || 0)
  const orderQty = Math.max(1, Number(orderQtyRaw) || 1)
  const total = qtyPerItem * orderQty
  if (isMeterUnit(unitRaw)) {
    return Math.round(total * 100) / 100
  }
  return Math.ceil(total)
}

function parseParams(paramsRaw: unknown): Record<string, unknown> {
  if (paramsRaw && typeof paramsRaw === 'object' && !Array.isArray(paramsRaw)) {
    return { ...(paramsRaw as Record<string, unknown>) }
  }
  if (typeof paramsRaw === 'string' && paramsRaw.trim()) {
    try {
      const parsed = JSON.parse(paramsRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) }
      }
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Из params позиции достаём состав для нового холда.
 * CRM хранит `components` (+ reservationId оригинала); website/miniapp — `_miniappComponents`.
 */
export function extractDuplicateComponents(
  paramsRaw: unknown,
): DuplicateItemComponent[] {
  const params = parseParams(paramsRaw)
  const fromComponents = Array.isArray(params.components) ? params.components : []
  const fromMiniapp = Array.isArray(params._miniappComponents)
    ? params._miniappComponents
    : []
  const source = fromComponents.length > 0 ? fromComponents : fromMiniapp

  return source
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const materialId = Number((row as { materialId?: unknown }).materialId)
      const qtyPerItem = Number((row as { qtyPerItem?: unknown }).qtyPerItem)
      if (!Number.isFinite(materialId) || materialId <= 0 || !Number.isFinite(qtyPerItem)) {
        return null
      }
      return { materialId, qtyPerItem }
    })
    .filter((row): row is DuplicateItemComponent => row != null)
}

/**
 * При дублировании заказа старые reservationId указывают на холды оригинала
 * (часто уже fulfilled). confirmReservations идёт по order_id копии → пусто →
 * «Принят в работу» ничего не списывает.
 *
 * Создаём свежие active-холды на новый orderId и переписываем params.components.
 * Вызывать внутри уже открытой транзакции (без вложенного BEGIN).
 */
export async function rebindDuplicatedItemReservations(
  db: Database,
  args: {
    orderId: number
    paramsRaw: unknown
    quantity: number
    reason?: string
  },
): Promise<string> {
  const params = parseParams(args.paramsRaw)
  const components = extractDuplicateComponents(params)

  // Даже без материалов снимаем чужие reservationId, чтобы delete/update
  // копии не трогал холды оригинала.
  if (Array.isArray(params.components)) {
    params.components = (params.components as Array<Record<string, unknown>>).map((c) => {
      const next = { ...c }
      delete next.reservationId
      return next
    })
  }

  if (components.length === 0) {
    return JSON.stringify(params)
  }

  const materialIds = [...new Set(components.map((c) => c.materialId))]
  const unitByMaterial = new Map<number, string | null>()
  if (materialIds.length > 0) {
    const unitRows = (await db.all(
      `SELECT id, unit FROM materials WHERE id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds,
    )) as Array<{ id: number; unit?: string | null }>
    for (const row of unitRows ?? []) {
      unitByMaterial.set(Number(row.id), row.unit ?? null)
    }
  }

  const nextComponents: DuplicateItemComponent[] = []
  const nowIso = new Date().toISOString()
  const reason = args.reason || 'reserve for duplicated order'

  for (const component of components) {
    const quantity = computeRequiredQuantity(
      component.qtyPerItem,
      args.quantity,
      unitByMaterial.get(component.materialId),
    )
    if (!(quantity > 0)) {
      nextComponents.push({
        materialId: component.materialId,
        qtyPerItem: component.qtyPerItem,
      })
      continue
    }

    const material = await db.get<{ quantity: number; name: string }>(
      'SELECT quantity, name FROM materials WHERE id = ?',
      [component.materialId],
    )
    if (!material) {
      throw new Error(`Материал с ID ${component.materialId} не найден`)
    }

    const existing = await db.get<{ reserved: number }>(
      `SELECT COALESCE(SUM(quantity_reserved), 0) as reserved
       FROM material_reservations
       WHERE material_id = ? AND status = 'active'
         AND (expires_at IS NULL OR expires_at > ?)`,
      [component.materialId, nowIso],
    )
    const reserved = Number(existing?.reserved || 0)
    const available = Number(material.quantity) - reserved
    if (available < quantity) {
      throw new Error(
        `Недостаточно материала "${material.name}". Доступно: ${available}, требуется: ${quantity}`,
      )
    }

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    const result = await db.run(
      `INSERT INTO material_reservations
         (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      component.materialId,
      args.orderId,
      quantity,
      reason,
      expiresAt.toISOString(),
    )

    nextComponents.push({
      materialId: component.materialId,
      qtyPerItem: component.qtyPerItem,
      reservationId: Number(result.lastID) || undefined,
    })
  }

  params.components = nextComponents
  return JSON.stringify(params)
}
