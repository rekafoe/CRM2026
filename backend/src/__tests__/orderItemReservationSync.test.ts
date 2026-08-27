import {
  computeRequiredQuantityForReservation,
  syncItemReservationsForQuantity,
} from '../modules/orders/services/orderItemReservationSync'

type MemRow = Record<string, unknown>

function createMemDb(seed: {
  materials: Array<{ id: number; name: string; quantity: number; unit?: string | null }>
  reservations?: Array<{
    id: number
    material_id: number
    order_id: number
    quantity_reserved: number
    status: string
    expires_at: string | null
  }>
}) {
  let nextReservationId =
    Math.max(0, ...(seed.reservations ?? []).map((r) => r.id)) + 1
  const materials = seed.materials.map((m) => ({ ...m }))
  const reservations = (seed.reservations ?? []).map((r) => ({ ...r }))

  const db = {
    async get<T = MemRow>(sql: string, params?: unknown[] | unknown): Promise<T | undefined> {
      const args = Array.isArray(params) ? params : params === undefined ? [] : [params]
      if (sql.includes('FROM materials WHERE id = ?')) {
        const id = Number(args[0])
        return materials.find((m) => m.id === id) as T | undefined
      }
      if (sql.includes('SUM(quantity_reserved)')) {
        const materialId = Number(args[0])
        const nowIso = String(args[1])
        const reserved = reservations
          .filter(
            (r) =>
              r.material_id === materialId &&
              r.status === 'active' &&
              (r.expires_at == null || r.expires_at > nowIso),
          )
          .reduce((sum, r) => sum + Number(r.quantity_reserved), 0)
        return { reserved } as T
      }
      return undefined
    },
    async all<T = MemRow>(sql: string, params?: unknown[] | unknown): Promise<T[]> {
      const args = Array.isArray(params) ? params : params === undefined ? [] : [params]
      if (sql.includes('FROM materials WHERE id IN')) {
        const ids = new Set(args.map(Number))
        return materials.filter((m) => ids.has(m.id)) as T[]
      }
      return []
    },
    async run(sql: string, ...params: unknown[]) {
      if (sql.includes('SET status = \'cancelled\'')) {
        const ids = new Set(params.map(Number))
        for (const row of reservations) {
          if (ids.has(row.id)) row.status = 'cancelled'
        }
        return { changes: ids.size }
      }
      if (sql.includes('INSERT INTO material_reservations')) {
        const [material_id, order_id, quantity_reserved, , expires_at] = params
        const id = nextReservationId++
        reservations.push({
          id,
          material_id: Number(material_id),
          order_id: Number(order_id),
          quantity_reserved: Number(quantity_reserved),
          status: 'active',
          expires_at: expires_at == null ? null : String(expires_at),
        })
        return { lastID: id, changes: 1 }
      }
      return { changes: 0 }
    },
    _reservations: reservations,
  }

  return db
}

describe('orderItemReservationSync', () => {
  it('computeRequiredQuantityForReservation rounds meters, ceils sheets', () => {
    expect(computeRequiredQuantityForReservation(1.25, 2, 'пог.м')).toBe(2.5)
    expect(computeRequiredQuantityForReservation(1.2, 3, 'лист')).toBe(4)
  })

  it('qty decrease cancels old hold and reserves remaining quantity', async () => {
    const db = createMemDb({
      materials: [{ id: 10, name: 'Бумага', quantity: 1000, unit: 'лист' }],
      reservations: [
        {
          id: 50,
          material_id: 10,
          order_id: 7,
          quantity_reserved: 100,
          status: 'active',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      ],
    })

    const next = await syncItemReservationsForQuantity(db as any, {
      orderId: 7,
      components: [{ materialId: 10, qtyPerItem: 1, reservationId: 50 }],
      newQuantity: 40,
      reason: 'order update qty -',
    })

    expect(db._reservations.find((r) => r.id === 50)?.status).toBe('cancelled')
    expect(next).toHaveLength(1)
    expect(next[0].reservationId).toBeGreaterThan(50)
    const active = db._reservations.find((r) => r.id === next[0].reservationId)
    expect(active?.status).toBe('active')
    expect(active?.quantity_reserved).toBe(40)
  })

  it('qty increase replaces hold with full new quantity (not delta-only orphan)', async () => {
    const db = createMemDb({
      materials: [{ id: 10, name: 'Бумага', quantity: 1000, unit: 'лист' }],
      reservations: [
        {
          id: 50,
          material_id: 10,
          order_id: 7,
          quantity_reserved: 100,
          status: 'active',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      ],
    })

    const next = await syncItemReservationsForQuantity(db as any, {
      orderId: 7,
      components: [{ materialId: 10, qtyPerItem: 1, reservationId: 50 }],
      newQuantity: 150,
      reason: 'order update qty +',
    })

    expect(db._reservations.find((r) => r.id === 50)?.status).toBe('cancelled')
    const active = db._reservations.find((r) => r.id === next[0].reservationId)
    expect(active?.quantity_reserved).toBe(150)
  })
})
