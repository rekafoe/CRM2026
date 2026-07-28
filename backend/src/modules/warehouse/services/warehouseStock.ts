import { getDb } from '../../config/database'

/** Склад по умолчанию для точки (или глобальный default). */
export async function getDefaultWarehouseId(departmentId?: number | null): Promise<number | null> {
  const db = await getDb()
  if (departmentId != null && Number.isFinite(departmentId)) {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM warehouses WHERE department_id = ? AND is_default = 1 LIMIT 1`,
      [departmentId]
    )
    if (row) return row.id
    const any = await db.get<{ id: number }>(
      `SELECT id FROM warehouses WHERE department_id = ? ORDER BY id ASC LIMIT 1`,
      [departmentId]
    )
    if (any) return any.id
  }
  const fallback = await db.get<{ id: number }>(
    `SELECT id FROM warehouses WHERE is_default = 1 ORDER BY id ASC LIMIT 1`
  )
  return fallback?.id ?? null
}

/** Остаток материала: material_stock если есть, иначе materials.quantity. */
export async function getMaterialQuantity(materialId: number, warehouseId?: number | null): Promise<number> {
  const db = await getDb()
  const wid = warehouseId ?? (await getDefaultWarehouseId())
  if (wid != null) {
    const stock = await db.get<{ quantity: number }>(
      `SELECT quantity FROM material_stock WHERE material_id = ? AND warehouse_id = ?`,
      [materialId, wid]
    )
    if (stock) return Number(stock.quantity) || 0
  }
  const mat = await db.get<{ quantity: number }>(`SELECT quantity FROM materials WHERE id = ?`, [materialId])
  return Number(mat?.quantity) || 0
}

/**
 * Изменить остаток: пишет в material_stock + синхронизирует materials.quantity
 * как сумму по всем складам (обратная совместимость UI).
 */
export async function adjustMaterialStock(args: {
  materialId: number
  delta: number
  warehouseId?: number | null
}): Promise<number> {
  const db = await getDb()
  const wid = args.warehouseId ?? (await getDefaultWarehouseId())
  if (wid == null) {
    await db.run(`UPDATE materials SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?`, [
      args.delta,
      args.materialId,
    ])
    const row = await db.get<{ quantity: number }>(`SELECT quantity FROM materials WHERE id = ?`, [args.materialId])
    return Number(row?.quantity) || 0
  }

  await db.run(
    `INSERT INTO material_stock (material_id, warehouse_id, quantity)
     VALUES (?, ?, ?)
     ON CONFLICT(material_id, warehouse_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
    [args.materialId, wid, args.delta]
  )

  const sum = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(quantity), 0) as total FROM material_stock WHERE material_id = ?`,
    [args.materialId]
  )
  const total = Number(sum?.total) || 0
  await db.run(`UPDATE materials SET quantity = ?, updated_at = datetime('now') WHERE id = ?`, [
    total,
    args.materialId,
  ])
  return total
}
