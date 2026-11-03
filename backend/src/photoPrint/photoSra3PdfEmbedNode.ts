import type { PDFDocument, PDFImage } from 'pdf-lib';
import sharp from 'sharp';
import { isHeicLikeRaster } from './heicDetect';
import { convertHeicToPngBytes } from './heicConvertServer';

/**
 * Серверная встройка растра: для JPEG/PNG сначала пробуем встроить исходные байты без перекодирования.
 * HEIC/HEIF декодируем в PNG, чтобы PDF был совместимым без повторного lossy-сжатия фото.
 * Fallback через sharp нужен для неверного Content-Type, EXIF-normalize и остальных экзотических форматов.
 */
export async function embedRasterInPdfNode(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
  mimeHint: string
): Promise<PDFImage | null> {
  const mime = mimeHint.split(';')[0]?.trim().toLowerCase() || '';
  const isJpeg = mime === 'image/jpeg' || mime === 'image/jpg';
  const isPng = mime === 'image/png';

  if (isJpeg || isPng) {
    try {
      return isJpeg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
    } catch {
      // Например, Content-Type говорит PNG, а на диске JPEG. Ниже нормализуем через sharp.
    }
  }

  if (isHeicLikeRaster(bytes, mime)) {
    try {
      const png = await convertHeicToPngBytes(bytes);
      return await pdfDoc.embedPng(png);
    } catch {
      // Если HEIC уже поддержан системным libvips, пробуем общий sharp-fallback ниже.
    }
  }

  try {
    const jpeg = await sharp(Buffer.from(bytes), { failOn: 'none' })
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    return await pdfDoc.embedJpg(jpeg);
  } catch (error) {
    console.warn('[photoSra3PdfEmbedNode] sharp fallback failed', {
      mime,
      size: bytes.byteLength,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
