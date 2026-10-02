const PRESERVE_IF_MISSING = ['printerId', 'createdDate', 'readyDate', 'components'] as const
const DESIGN_KEYS = ['designState', 'editorDraftToken', 'designTemplateId', 'designUsageFee', 'usage_fee'] as const

/** В макете уже есть объекты на страницах — пустой черновик калькулятора его не затирает. */
export function designStateHasArtwork(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false
  const pages = (state as { pages?: unknown }).pages
  if (!Array.isArray(pages)) return false
  return pages.some((page) => {
    if (!page || typeof page !== 'object') return false
    const objects = (page as { fabricJSON?: { objects?: unknown } }).fabricJSON?.objects
    return Array.isArray(objects) && objects.length > 0
  })
}

/**
 * Полный снимок калькулятора заменяет params.
 * Поля, которые калькулятор не присылает (даты, принтер, резервы, живой макет), остаются.
 */
export function buildReplacedItemParams(input: {
  existing: Record<string, unknown>
  incoming: Record<string, unknown>
  components?: unknown
}): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input.incoming)) {
    if (value === undefined || typeof value === 'function') continue
    next[key] = value
  }
  const explicitComponents = Array.isArray(input.components)
  for (const key of PRESERVE_IF_MISSING) {
    if (key === 'components' && explicitComponents) continue
    if (next[key] == null && input.existing[key] != null) {
      next[key] = input.existing[key]
    }
  }
  if (explicitComponents) {
    next.components = input.components
  }
  if (!designStateHasArtwork(next.designState) && designStateHasArtwork(input.existing.designState)) {
    for (const key of DESIGN_KEYS) {
      if (input.existing[key] != null) next[key] = input.existing[key]
    }
  }
  return next
}
