type FabricObjectRecord = Record<string, unknown>

const STABLE_ID_FIELDS = [
  'id',
  'objectId',
  'objectID',
  'stableId',
  'customId',
  'uuid',
  'uid',
] as const

export type ProductionTextLayoutSnapshot = {
  path: number[]
  type: string
  stableKeys: string[]
  clientAdded: boolean
  left?: number
  top?: number
  originX?: string
  originY?: string
  width?: number
}

type FabricObjectEntry = {
  object: FabricObjectRecord
  path: number[]
  type: string
  stableKeys: string[]
}

function asObject(value: unknown): FabricObjectRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as FabricObjectRecord
    : null
}

function normalizeTextType(value: unknown): string {
  const type = String(value ?? '').trim().toLowerCase()
  return type === 'itext' ? 'i-text' : type
}

function isTextType(value: unknown): boolean {
  const type = normalizeTextType(value)
  return type === 'text' || type === 'i-text' || type === 'textbox'
}

function readStableKeys(object: FabricObjectRecord): string[] {
  const keys = new Set<string>()
  for (const field of STABLE_ID_FIELDS) {
    const value = object[field]
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const normalized = String(value).trim()
    if (normalized) keys.add(`${field}:${normalized}`)
  }
  return [...keys]
}

function readChildren(object: FabricObjectRecord): FabricObjectRecord[] {
  const getObjects = object.getObjects
  if (typeof getObjects === 'function') {
    try {
      const children = getObjects.call(object)
      if (Array.isArray(children)) return children.map(asObject).filter(Boolean) as FabricObjectRecord[]
    } catch {
      // Plain JSON fallback below.
    }
  }
  const children = Array.isArray(object.objects)
    ? object.objects
    : Array.isArray(object._objects)
      ? object._objects
      : []
  return children.map(asObject).filter(Boolean) as FabricObjectRecord[]
}

function walkObjects(
  objects: unknown[],
  visit: (entry: FabricObjectEntry) => void,
  parentPath: number[] = [],
): void {
  objects.forEach((value, index) => {
    const object = asObject(value)
    if (!object) return
    const path = [...parentPath, index]
    visit({
      object,
      path,
      type: normalizeTextType(object.type),
      stableKeys: readStableKeys(object),
    })
    const children = readChildren(object)
    if (children.length > 0) walkObjects(children, visit, path)
  })
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/**
 * Снимает только геометрию текста. Вызывать после production JSON prepare,
 * чтобы расширенная ширина обычного текста стала частью сохраняемого layout.
 */
export function captureProductionTextLayoutSnapshots(
  fabricJSON: unknown,
): ProductionTextLayoutSnapshot[] {
  const root = asObject(fabricJSON)
  const objects = Array.isArray(root?.objects) ? root.objects : []
  const snapshots: ProductionTextLayoutSnapshot[] = []
  walkObjects(objects, (entry) => {
    if (!isTextType(entry.type)) return
    const width = finiteNumber(entry.object.width)
    snapshots.push({
      path: entry.path,
      type: entry.type,
      stableKeys: entry.stableKeys,
      clientAdded:
        entry.object.textFieldClientAdded === true
        || entry.object.clientAdded === true,
      left: finiteNumber(entry.object.left),
      top: finiteNumber(entry.object.top),
      originX: nonEmptyString(entry.object.originX),
      originY: nonEmptyString(entry.object.originY),
      width: width != null && width > 0 ? width : undefined,
    })
  })
  return snapshots
}

/**
 * Возвращает layout после Fabric font initDimensions. Сначала сопоставляет по
 * стабильным идентификаторам, затем использует только безопасный exact-path fallback.
 */
export function restoreProductionTextLayoutSnapshots(
  rootObjects: unknown[],
  snapshots: ProductionTextLayoutSnapshot[],
): number {
  if (!Array.isArray(rootObjects) || !Array.isArray(snapshots) || snapshots.length === 0) return 0

  const entries: FabricObjectEntry[] = []
  walkObjects(rootObjects, (entry) => {
    if (isTextType(entry.type)) entries.push(entry)
  })

  const entriesByStableKey = new Map<string, FabricObjectEntry[]>()
  const snapshotStableKeyCounts = new Map<string, number>()
  const entriesByPath = new Map<string, FabricObjectEntry>()
  for (const entry of entries) {
    entriesByPath.set(entry.path.join('.'), entry)
    for (const key of entry.stableKeys) {
      const matches = entriesByStableKey.get(key) ?? []
      matches.push(entry)
      entriesByStableKey.set(key, matches)
    }
  }
  for (const snapshot of snapshots) {
    for (const key of snapshot.stableKeys) {
      snapshotStableKeyCounts.set(key, (snapshotStableKeyCounts.get(key) ?? 0) + 1)
    }
  }

  const claimed = new Set<FabricObjectRecord>()
  let restored = 0
  for (const snapshot of snapshots) {
    let matched: FabricObjectEntry | undefined
    for (const key of snapshot.stableKeys) {
      if (snapshotStableKeyCounts.get(key) !== 1) continue
      const candidates = entriesByStableKey.get(key)
      if (candidates?.length === 1 && !claimed.has(candidates[0].object)) {
        matched = candidates[0]
        break
      }
    }

    if (!matched) {
      const byPath = entriesByPath.get(snapshot.path.join('.'))
      if (byPath && !claimed.has(byPath.object) && byPath.type === snapshot.type) {
        const snapshotHasIds = snapshot.stableKeys.length > 0
        const objectHasIds = byPath.stableKeys.length > 0
        const hasConflictingIds = snapshotHasIds
          && objectHasIds
          && !snapshot.stableKeys.some((key) => byPath.stableKeys.includes(key))
        if (!hasConflictingIds) matched = byPath
      }
    }
    if (!matched) continue

    const patch: FabricObjectRecord = {}
    const currentWidth = finiteNumber(matched.object.width)
    const keepOrdinaryTextExpansion = !snapshot.clientAdded
      && snapshot.width != null
      && currentWidth != null
      && currentWidth > snapshot.width + 0.5
    if (!keepOrdinaryTextExpansion && snapshot.left != null && Number.isFinite(snapshot.left)) {
      patch.left = snapshot.left
    }
    if (snapshot.top != null && Number.isFinite(snapshot.top)) patch.top = snapshot.top
    if (snapshot.originX) patch.originX = snapshot.originX
    if (snapshot.originY) patch.originY = snapshot.originY
    if (
      !keepOrdinaryTextExpansion
      && snapshot.width != null
      && Number.isFinite(snapshot.width)
      && snapshot.width > 0
    ) {
      patch.width = snapshot.width
    }

    const set = matched.object.set
    if (typeof set === 'function') set.call(matched.object, patch)
    else Object.assign(matched.object, patch)
    const setCoords = matched.object.setCoords
    if (typeof setCoords === 'function') setCoords.call(matched.object)
    claimed.add(matched.object)
    restored += 1
  }
  return restored
}
