import type { PDFDocument, PDFImage } from 'pdf-lib'

/** Серверная встройка. На CRM нет браузерного canvas, поэтому rasterEmbed=node. */
export async function embedMockupRasterInPdf(
  pdfDoc: PDFDocument,
  blob: Blob,
  rasterEmbed: 'browser' | 'node'
): Promise<PDFImage | null> {
  const mime = blob.type || 'image/jpeg'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (rasterEmbed === 'browser') {
    if (mime.includes('png')) return pdfDoc.embedPng(bytes)
    if (mime.includes('jpeg') || mime.includes('jpg')) return pdfDoc.embedJpg(bytes)
    return null
  }
  const { embedRasterInPdfNode } = await import('./photoSra3PdfEmbedNode')
  return embedRasterInPdfNode(pdfDoc, bytes, mime)
}
