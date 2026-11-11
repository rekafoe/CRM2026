/**
 * Выбор послепечати в заказ: поиск, группы, недавние, чипы.
 * Файл совпадает с backend/src/modules/pricing/services/postprintPickerModel.ts
 */

export const POSTPRINT_GROUP_OPEN_LIMIT = 5
export const POSTPRINT_RECENT_VISIBLE = 5
export const POSTPRINT_RECENT_CANDIDATE_LIMIT = 40

const UNCATEGORIZED_GROUP = 'Без категории'
const PINNED_GROUPS = ['Ламинация', 'Резка', 'Скругление']

const NAME_GROUP_RULES: Array<{ title: string; parts: string[] }> = [
  { title: 'Ламинация', parts: ['ламинац'] },
  { title: 'Резка', parts: ['резк', 'плоттер'] },
  { title: 'Скругление', parts: ['скругл'] },
]

export interface PostprintPickerServiceRef {
  serviceId: number
  name: string
  categoryName?: string | null
  minQuantity?: number
  variants: Array<{ key: string; parentVariantId?: number | null }>
  parentVariants?: Array<{ id: number }>
}

export interface PostprintPickerGroup<T> {
  categoryName: string
  services: T[]
  totalInGroup: number
}

export interface RecentPostprintRow {
  itemId: number
  orderId: number
  params: unknown
}

export function foldPostprintSearch(value: string): string {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .trim()
}

export function postprintNameMatches(name: string, query: string): boolean {
  const foldedQuery = foldPostprintSearch(query)
  if (!foldedQuery) return true
  return foldPostprintSearch(name).includes(foldedQuery)
}

export function postprintGroupTitle(service: { name: string; categoryName?: string | null }): string {
  const category = String(service.categoryName ?? '').trim()
  if (category && foldPostprintSearch(category) !== foldPostprintSearch(UNCATEGORIZED_GROUP)) {
    return category
  }
  const foldedName = foldPostprintSearch(service.name)
  for (const rule of NAME_GROUP_RULES) {
    if (rule.parts.some((part) => foldedName.includes(part))) return rule.title
  }
  return category || UNCATEGORIZED_GROUP
}

export function postprintGroupStartsCollapsed(totalInGroup: number): boolean {
  return totalInGroup > POSTPRINT_GROUP_OPEN_LIMIT
}

export function servicesCountLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} услуга`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} услуги`
  return `${count} услуг`
}

function pinnedGroupIndex(name: string): number {
  const folded = foldPostprintSearch(name)
  return PINNED_GROUPS.findIndex((title) => foldPostprintSearch(title) === folded)
}

export function groupPostprintServices<T extends { name: string; categoryName?: string | null }>(
  services: T[],
  query: string,
): PostprintPickerGroup<T>[] {
  const buckets = new Map<string, T[]>()
  const seenOrder: string[] = []
  for (const service of services) {
    const title = postprintGroupTitle(service)
    if (!buckets.has(title)) {
      buckets.set(title, [])
      seenOrder.push(title)
    }
    buckets.get(title)!.push(service)
  }

  const foldedQuery = foldPostprintSearch(query)
  const groups = seenOrder
    .map((categoryName) => {
      const all = buckets.get(categoryName) ?? []
      const visible = foldedQuery
        ? all.filter((service) => postprintNameMatches(service.name, foldedQuery))
        : all
      return {
        categoryName,
        services: [...visible].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
        totalInGroup: all.length,
      }
    })
    .filter((group) => group.services.length > 0)

  const uncategorized = foldPostprintSearch(UNCATEGORIZED_GROUP)
  return groups.sort((a, b) => {
    const aUncategorized = foldPostprintSearch(a.categoryName) === uncategorized
    const bUncategorized = foldPostprintSearch(b.categoryName) === uncategorized
    if (aUncategorized !== bUncategorized) return aUncategorized ? 1 : -1
    const aPin = pinnedGroupIndex(a.categoryName)
    const bPin = pinnedGroupIndex(b.categoryName)
    if (aPin !== -1 || bPin !== -1) {
      if (aPin === -1) return 1
      if (bPin === -1) return -1
      return aPin - bPin
    }
    return 0
  })
}

export function pickRecentServices<T extends { serviceId: number; name: string }>(
  services: T[],
  recentIds: number[],
  query: string,
  limit = POSTPRINT_RECENT_VISIBLE,
): T[] {
  const byId = new Map(services.map((service) => [service.serviceId, service]))
  const picked: T[] = []
  for (const id of recentIds) {
    const service = byId.get(id)
    if (!service || !postprintNameMatches(service.name, query)) continue
    picked.push(service)
    if (picked.length >= limit) break
  }
  return picked
}

export function selectionKeysForService(serviceId: number, selections: Record<string, number>): string[] {
  const id = String(serviceId)
  const prefix = `${id}:`
  return Object.keys(selections).filter((key) => key === id || key.startsWith(prefix))
}

export function isPostprintServiceSelected(serviceId: number, selections: Record<string, number>): boolean {
  return selectionKeysForService(serviceId, selections).some((key) => Number(selections[key]) > 0)
}

export function postprintServiceQuantity(serviceId: number, selections: Record<string, number>): number {
  return selectionKeysForService(serviceId, selections).reduce(
    (sum, key) => sum + (Number(selections[key]) || 0),
    0,
  )
}

export function clearPostprintServiceSelection(
  selections: Record<string, number>,
  serviceId: number,
): Record<string, number> {
  const next = { ...selections }
  for (const key of selectionKeysForService(serviceId, selections)) delete next[key]
  return next
}

export function defaultPostprintSelectionKey(service: PostprintPickerServiceRef): string {
  const parents = service.parentVariants ?? []
  if (parents.length > 0) {
    const parentId = Number(parents[0]?.id)
    const child = service.variants.find((variant) => Number(variant.parentVariantId) === parentId)
    if (child?.key) return child.key
  }
  if (service.variants[0]?.key) return service.variants[0].key
  return String(service.serviceId)
}

export function selectPostprintService(
  selections: Record<string, number>,
  service: PostprintPickerServiceRef,
): Record<string, number> {
  const next = clearPostprintServiceSelection(selections, service.serviceId)
  const min = Number(service.minQuantity)
  const quantity = Number.isFinite(min) && min > 0 ? min : 1
  next[defaultPostprintSelectionKey(service)] = quantity
  return next
}

function parseParams(params: unknown): Record<string, unknown> | null {
  let value = params
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readOperationType(record: Record<string, unknown>): string {
  return String(record.operationType ?? record.operation_type ?? '')
    .toLowerCase()
    .trim()
}

function isPrintOperation(record: Record<string, unknown>): boolean {
  const type = readOperationType(record)
  if (!type) return false
  if (type.includes('postprint') || type.includes('post_print') || type.includes('post-print')) return false
  return type === 'print' || type.includes('print')
}

function pushPositiveId(target: number[], value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isInteger(numeric) || numeric <= 0) return
  target.push(numeric)
}

function walkOperations(
  list: unknown,
  keys: string[],
  target: number[],
  skipPrint: boolean,
) {
  if (!Array.isArray(list)) return
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (skipPrint && isPrintOperation(record)) continue
    for (const key of keys) {
      if (record[key] != null && record[key] !== '') {
        pushPositiveId(target, record[key])
        break
      }
    }
  }
}

export function extractPostprintServiceIds(params: unknown): { strong: number[]; weak: number[] } {
  const obj = parseParams(params)
  if (!obj) return { strong: [], weak: [] }
  const strong: number[] = []
  const weak: number[] = []
  walkOperations(obj.postprintOperations, ['serviceId', 'service_id', 'id'], strong, false)
  walkOperations(obj.selectedOperations, ['operationId', 'operation_id', 'serviceId', 'service_id'], strong, false)
  if (Array.isArray(obj.services)) {
    for (const entry of obj.services) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const record = entry as Record<string, unknown>
      if (isPrintOperation(record)) continue
      const bucket = readOperationType(record) ? strong : weak
      for (const key of ['operationId', 'operation_id', 'serviceId', 'service_id']) {
        if (record[key] != null && record[key] !== '') {
          pushPositiveId(bucket, record[key])
          break
        }
      }
    }
  }
  return { strong, weak }
}

function byNewestItem(rows: RecentPostprintRow[]): RecentPostprintRow[] {
  return [...rows].sort((a, b) => b.itemId - a.itemId)
}

export function rankRecentPostprintServiceIds(
  currentOrderRows: RecentPostprintRow[],
  managerRows: RecentPostprintRow[],
  limit = POSTPRINT_RECENT_CANDIDATE_LIMIT,
): number[] {
  const rows = [...byNewestItem(currentOrderRows), ...byNewestItem(managerRows)]
  const strong: number[] = []
  const weak: number[] = []
  for (const row of rows) {
    const extracted = extractPostprintServiceIds(row.params)
    strong.push(...extracted.strong)
    weak.push(...extracted.weak)
  }
  const seen = new Set<number>()
  const result: number[] = []
  for (const id of [...strong, ...weak]) {
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
    if (result.length >= limit) break
  }
  return result
}

export function recentServiceIdsFromOrderItems(
  items: Array<{ id: number; params?: unknown }>,
  limit = POSTPRINT_RECENT_CANDIDATE_LIMIT,
): number[] {
  const rows: RecentPostprintRow[] = (items ?? []).map((item) => ({
    itemId: Number(item.id) || 0,
    orderId: 0,
    params: item.params,
  }))
  return rankRecentPostprintServiceIds(rows, [], limit)
}
