import {
  extractDuplicateComponents,
  rebindDuplicatedItemReservations,
} from '../modules/orders/services/orderDuplicateReservations'

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

describe('orderDuplicateReservations', () => {
  it('extractDuplicateComponents prefers CRM components over _miniappComponents', () => {
    expect(
      extractDuplicateComponents({
        components: [{ materialId: 1, qtyPerItem: 2, reservationId: 99 }],
        _miniappComponents: [{ materialId: 2, qtyPerItem: 5 }],
      }),
    ).toEqual([{ materialId: 1, qtyPerItem: 2 }])
  })

  it('extractDuplicateComponents falls back to _miniappComponents', () => {
    expect(
      extractDuplicateComponents({
        _miniappComponents: [{ materialId: 7, qtyPerItem: 1.5 }],
      }),
    ).toEqual([{ materialId: 7, qtyPerItem: 1.5 }])
  })

  it('rebind creates fresh holds for the copy and drops original reservationId', async () => {
    const db = createMemDb({
      materials: [{ id: 10, name: 'Бумага', quantity: 1000, unit: 'лист' }],
      reservations: [
        {
          id: 50,
          material_id: 10,
          order_id: 1,
          quantity_reserved: 100,
          status: 'fulfilled',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      ],
    })

    const paramsJson = await rebindDuplicatedItemReservations(db as any, {
      orderId: 99,
      quantity: 40,
      paramsRaw: {
        description: 'Визитки',
        components: [{ materialId: 10, qtyPerItem: 1, reservationId: 50 }],
      },
      reason: 'reserve for duplicated order',
    })

    const params = JSON.parse(paramsJson) as {
      components: Array<{ materialId: number; qtyPerItem: number; reservationId?: number }>
    }
    expect(params.components).toHaveLength(1)
    expect(params.components[0].reservationId).toBeGreaterThan(50)
    expect(params.components[0].reservationId).not.toBe(50)

    const original = db._reservations.find((r) => r.id === 50)
    expect(original?.status).toBe('fulfilled')
    expect(original?.order_id).toBe(1)

    const copyHold = db._reservations.find((r) => r.id === params.components[0].reservationId)
    expect(copyHold?.order_id).toBe(99)
    expect(copyHold?.status).toBe('active')
    expect(copyHold?.quantity_reserved).toBe(40)
  })

  it('rebind from _miniappComponents creates CRM components holds for accept→confirm', async () => {
    const db = createMemDb({
      materials: [{ id: 3, name: 'Плёнка', quantity: 50, unit: 'пог.м' }],
    })

    const paramsJson = await rebindDuplicatedItemReservations(db as any, {
      orderId: 12,
      quantity: 2,
      paramsRaw: {
        _miniappComponents: [{ materialId: 3, qtyPerItem: 1.25 }],
      },
    })

    const params = JSON.parse(paramsJson) as {
      components: Array<{ materialId: number; qtyPerItem: number; reservationId?: number }>
    }
    expect(params.components[0].materialId).toBe(3)
    expect(params.components[0].reservationId).toBeGreaterThan(0)
    const hold = db._reservations.find((r) => r.id === params.components[0].reservationId)
    expect(hold?.quantity_reserved).toBe(2.5)
    expect(hold?.order_id).toBe(12)
  })
})
