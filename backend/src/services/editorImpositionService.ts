import { getDb } from '../config/database'
import { saveBufferToOrderFiles } from '../config/upload'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * MVP imposition: создаёт PDF-заглушку «лист SRA3» со списком страниц production_pdf.
 * Полная раскладка на SRA3 — отдельная итерация; job не блокирует приём заказа.
 */
export async function runImpositionJobForOrderItem(orderId: number, orderItemId: number): Promise<void> {
  const db = await getDb()
  const item = await db.get<{ params: string | null; quantity: number }>(
    'SELECT params, quantity FROM items WHERE id = ? AND orderId = ?',
    [orderItemId, orderId],
  )
  if (!item?.params) throw new Error('Позиция не найдена')

  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(item.params) as Record<string, unknown>
  } catch {
    throw new Error('Некорректные params')
  }

  const productionFile = await db.get<{ filename: string }>(
    `SELECT filename FROM order_files
     WHERE orderId = ? AND orderItemId = ? AND artifactType = 'production_pdf'
     ORDER BY id DESC LIMIT 1`,
    [orderId, orderItemId],
  )
  if (!productionFile) throw new Error('Нет production_pdf для раскладки')

  const doc = await PDFDocument.create()
  const page = doc.addPage([450, 320])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const group = params.editorLayoutGroup as { groupKey?: string; slots?: unknown[] } | undefined
  const lines = [
    `Imposition SRA3 (MVP)`,
    `Order ${orderId} / item ${orderItemId}`,
    `Quantity: ${item.quantity}`,
    `Group: ${group?.groupKey ?? '—'}`,
    `Slots: ${Array.isArray(group?.slots) ? group.slots.length : 0}`,
    `Source PDF: ${productionFile.filename}`,
    'Полная автоматическая раскладка — в разработке.',
  ]
  lines.forEach((line, i) => {
    page.drawText(line, { x: 24, y: 280 - i * 22, size: 11, font, color: rgb(0.1, 0.1, 0.1) })
  })

  const bytes = await doc.save()
  const saved = saveBufferToOrderFiles(Buffer.from(bytes), `imposition-${orderId}-${orderItemId}.pdf`)
  if (!saved) throw new Error('Не удалось сохранить imposition PDF')

  const versionRow = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM order_files
     WHERE orderId = ? AND orderItemId = ? AND artifactType = 'imposition_pdf'`,
    [orderId, orderItemId],
  )
  const version = Number(versionRow?.n ?? 0) + 1
  await db.run(
    `INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size, artifactType, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      orderItemId,
      saved.filename,
      `imposition-v${version}-item-${orderItemId}.pdf`,
      'application/pdf',
      saved.size,
      'imposition_pdf',
      JSON.stringify({ version, kind: 'sra3_mvp_placeholder' }),
    ],
  )
}
