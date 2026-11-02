/** Имя PNG страницы, которую сайт заливает в draft при «Заказать». */
export const CLIENT_RENDERED_PAGE_FILENAME_RE = /^client-render-page-(\d+)\.png$/i

export function parseClientRenderedPagePartNumber(
  originalName: string | null | undefined,
): number | null {
  if (!originalName) return null
  const match = CLIENT_RENDERED_PAGE_FILENAME_RE.exec(originalName.trim())
  if (!match?.[1]) return null
  const part = Number(match[1])
  return Number.isInteger(part) && part > 0 ? part : null
}

export function isClientRenderedPageFileName(originalName: string | null | undefined): boolean {
  return parseClientRenderedPagePartNumber(originalName) != null
}

export function buildOrderFileFieldsFromDraftFile(
  file: { originalName: string | null },
  pageCount: number,
  partNumberOffset = 0,
): {
  artifactType: string | null
  partNumber: number | null
  metadata: string | null
} {
  const localPart = parseClientRenderedPagePartNumber(file.originalName)
  if (localPart == null) {
    return { artifactType: null, partNumber: null, metadata: null }
  }
  const offset = Number.isFinite(partNumberOffset) && partNumberOffset > 0 ? Math.floor(partNumberOffset) : 0
  const partNumber = localPart + offset
  return {
    artifactType: 'client_rendered_page',
    partNumber,
    metadata: JSON.stringify({
      source: 'client_png',
      pageIndex: partNumber - 1,
      pageCount,
    }),
  }
}

export type PlannedDraftOrderFile<T extends { id: number; originalName: string | null }> = {
  file: T
  fields: {
    artifactType: string | null
    partNumber: number | null
    metadata: string | null
  }
  /** Older re-uploads of the same page in this draft; not inserted again. */
  aliasFileIds: number[]
}

/**
 * Группа открыток — одна позиция и несколько draft, в каждом свой
 * `client-render-page-1.png`. Без сдвига partNumber все страницы
 * схлопываются в page 1 и production PDF оставляет только первый макет.
 * Повторная заливка той же страницы в одном draft не должна плодить страницы:
 * в заказ попадает файл с наибольшим id.
 */
export function planDraftFilesForOrderCopy<T extends { id: number; originalName: string | null }>(
  files: T[],
  partNumberOffset = 0,
): { planned: PlannedDraftOrderFile<T>[]; productionPageCount: number } {
  const offset = Number.isFinite(partNumberOffset) && partNumberOffset > 0 ? Math.floor(partNumberOffset) : 0
  const productionByPart = new Map<number, { kept: T; aliases: number[] }>()
  const other: T[] = []

  const ordered = [...files].sort((a, b) => a.id - b.id)
  for (const file of ordered) {
    const localPart = parseClientRenderedPagePartNumber(file.originalName)
    if (localPart == null) {
      other.push(file)
      continue
    }
    const existing = productionByPart.get(localPart)
    if (!existing) {
      productionByPart.set(localPart, { kept: file, aliases: [] })
      continue
    }
    existing.aliases.push(existing.kept.id)
    existing.kept = file
  }

  const productionCount = productionByPart.size
  const pageCount = offset + productionCount
  const planned: PlannedDraftOrderFile<T>[] = []

  for (const file of other) {
    planned.push({
      file,
      fields: buildOrderFileFieldsFromDraftFile(file, pageCount, offset),
      aliasFileIds: [],
    })
  }

  const parts = Array.from(productionByPart.keys()).sort((a, b) => a - b)
  for (const localPart of parts) {
    const row = productionByPart.get(localPart)
    if (!row) continue
    planned.push({
      file: row.kept,
      fields: buildOrderFileFieldsFromDraftFile(row.kept, pageCount, offset),
      aliasFileIds: row.aliases,
    })
  }

  return { planned, productionPageCount: productionCount }
}
