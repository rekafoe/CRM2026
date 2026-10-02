/** Доля оператора с произвольного калькулятора, если в настройках ещё нет своего числа. */
export const DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT = 17.5
export const CUSTOM_CALCULATOR_PERCENT_KEY = 'custom_calculator_operator_percent'

/** @deprecated Используйте DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT или значение из crm_settings. */
export const CUSTOM_CALCULATOR_OPERATOR_PERCENT = DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT

export function normalizeCustomCalculatorPercent(raw: unknown): number | null {
  const text = typeof raw === 'string' ? raw.trim().replace(',', '.') : raw
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return Math.round(value * 100) / 100
}

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
 * Произвольный калькулятор получает живой процент из настроек,
 * даже если в params лежит старый operator_percent или чужой productId.
 */
export function resolveEarningsOperatorPercent(input: {
  params: any
  itemType?: string | null
  productPercentMap: Map<number, number>
  operationPercentMap: Map<number, number>
  customCalculatorPercent?: number | null
}): number {
  const params = input.params ?? {}
  if (isArbitraryCalculatorItem(params, input.itemType)) {
    return (
      normalizeCustomCalculatorPercent(input.customCalculatorPercent) ??
      DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT
    )
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
