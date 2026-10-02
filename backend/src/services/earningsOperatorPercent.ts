/** Доля оператора с произвольного калькулятора. Живое значение: рекальк не смотрит на старый снимок в params. */
export const CUSTOM_CALCULATOR_OPERATOR_PERCENT = 20

export function isArbitraryCalculatorItem(
  params: unknown,
  itemType?: string | null,
): boolean {
  const record =
    params != null && typeof params === 'object' && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {}
  if (record.customProduct === true || record.customProduct === 1 || record.customProduct === 'true') {
    return true
  }
  if (String(record.productType ?? '').trim().toLowerCase() === 'custom') return true
  if (String(itemType ?? '').trim().toLowerCase() === 'custom') return true
  const productId = Number(record.productId)
  return productId === -1000
}

/**
 * Процент оператора по позиции.
 * Произвольный калькулятор всегда получает текущие {@link CUSTOM_CALCULATOR_OPERATOR_PERCENT},
 * даже если в params лежит старый operator_percent или чужой productId.
 */
export function resolveEarningsOperatorPercent(input: {
  params: any
  itemType?: string | null
  productPercentMap: Map<number, number>
  operationPercentMap: Map<number, number>
}): number {
  const params = input.params ?? {}
  if (isArbitraryCalculatorItem(params, input.itemType)) {
    return CUSTOM_CALCULATOR_OPERATOR_PERCENT
  }

  let percent = 0
  if (params?.services && Array.isArray(params.services) && params.services.length > 0) {
    const firstOpId = Number(params.services[0]?.operationId)
    if (Number.isFinite(firstOpId)) {
      percent = input.operationPercentMap.get(firstOpId) ?? 0
    }
  }
  if (
    percent === 0 &&
    params?.postprintOperations &&
    Array.isArray(params.postprintOperations) &&
    params.postprintOperations.length > 0
  ) {
    for (const op of params.postprintOperations) {
      const sid = Number(op?.serviceId ?? op?.id)
      if (!Number.isFinite(sid)) continue
      const p = input.operationPercentMap.get(sid) ?? 0
      percent = p
      if (p > 0) break
    }
  }
  if (percent === 0) {
    const opId = Number(params?.operationId)
    if (Number.isFinite(opId)) {
      percent = input.operationPercentMap.get(opId) ?? 0
    }
  }
  if (percent === 0) {
    let productId = Number(params?.productId)
    if (!Number.isFinite(productId) && input.itemType != null) {
      const fromType = Number(String(input.itemType).trim())
      if (Number.isFinite(fromType) && fromType > 0) productId = fromType
    }
    if (Number.isFinite(productId)) {
      percent = input.productPercentMap.get(productId) ?? 0
    }
  }
  if (percent === 0) {
    const rawPercent = Number(params?.operator_percent ?? params?.operatorPercent ?? NaN)
    if (Number.isFinite(rawPercent)) percent = rawPercent
  }
  return percent
}
