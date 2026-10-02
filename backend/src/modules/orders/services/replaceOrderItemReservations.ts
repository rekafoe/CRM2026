export type ReservationStatusRow = { id: number; status: string }

/**
 * replaceParams не должен сначала отменять холды, а потом при shortage
 * коммитить позицию без резервов. Fulfilled трогать нельзя — склад уже списан.
 */
export function planReplaceComponentReservations(rows: ReservationStatusRow[]): {
  action: 'rereserve' | 'reject_fulfilled'
  activeIds: number[]
  fulfilledIds: number[]
} {
  const fulfilledIds: number[] = []
  const activeIds: number[] = []
  for (const row of rows || []) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const status = String(row.status || '')
    if (status === 'fulfilled') fulfilledIds.push(id)
    else if (status === 'active' || status === 'reserved') activeIds.push(id)
  }
  if (fulfilledIds.length > 0) {
    return { action: 'reject_fulfilled', activeIds, fulfilledIds }
  }
  return { action: 'rereserve', activeIds, fulfilledIds }
}
