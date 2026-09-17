/** Soft-cancelled orders must not enter act/invoice/contract totals. */
export function isCancelledOrderForLegalDocuments(
  row: { is_cancelled?: number | null } | null | undefined,
): boolean {
  return Number(row?.is_cancelled) === 1
}

/**
 * Preserve caller orderId order; drop missing and soft-cancelled rows.
 */
export function selectActiveOrdersForLegalDocuments<T extends { is_cancelled?: number | null }>(
  orderedIds: number[],
  orderMap: Map<number, T>,
): T[] {
  return orderedIds
    .map((id) => orderMap.get(id))
    .filter((o): o is T => Boolean(o) && !isCancelledOrderForLegalDocuments(o))
}
