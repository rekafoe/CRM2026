/**
 * Node (setHeader) принимает только latin1 в значении заголовка.
 * filename="Макет.pdf" с кириллицей бросает ERR_INVALID_CHAR → 500.
 */
export function buildAttachmentContentDisposition(displayName: string): string {
  const raw = String(displayName || '').replace(/[\r\n\0]+/g, ' ').trim() || 'download'
  const asciiFallback = raw
    .replace(/"/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'download'
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(raw)}`
}
