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
): {
  artifactType: string | null
  partNumber: number | null
  metadata: string | null
} {
  const partNumber = parseClientRenderedPagePartNumber(file.originalName)
  if (partNumber == null) {
    return { artifactType: null, partNumber: null, metadata: null }
  }
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
