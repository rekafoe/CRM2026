import fs from 'fs'
import { getDb } from '../config/database'
import { orderFilesDir, uploadsDir, resolveSafeExistingPath } from '../config/upload'
import { hasColumn } from '../utils/tableSchemaCache'

/**
 * Скачивание вложения заказа Mini App: тот же chat_id, что в orders.telegram_chat_id.
 */
export async function getMiniappOrderFileForDownload(
  telegramChatId: string,
  orderId: number,
  fileId: number
): Promise<
  | { ok: true; buffer: Buffer; displayName: string; mime: string | null }
  | { ok: false; status: number; message: string }
> {
  if (!Number.isFinite(orderId) || orderId < 1) {
    return { ok: false, status: 400, message: 'Invalid orderId' }
  }
  if (!Number.isFinite(fileId) || fileId < 1) {
    return { ok: false, status: 400, message: 'Invalid fileId' }
  }
  if (!(await hasColumn('orders', 'telegram_chat_id'))) {
    return { ok: false, status: 503, message: 'telegram_chat_id column missing' }
  }
  const db = await getDb()
  const order = (await db.get('SELECT id, telegram_chat_id FROM orders WHERE id = ?', [orderId])) as
    | { id: number; telegram_chat_id?: string | null }
    | undefined
  if (!order) {
    return { ok: false, status: 404, message: 'Заказ не найден' }
  }
  if (String(order.telegram_chat_id || '') !== String(telegramChatId)) {
    return { ok: false, status: 403, message: 'Нет доступа к этому заказу' }
  }
  const row = (await db.get(
    'SELECT id, orderId, filename, originalName, mime FROM order_files WHERE id = ? AND orderId = ?',
    [fileId, orderId]
  )) as { filename: string; originalName: string | null; mime: string | null } | undefined
  if (!row || !row.filename) {
    return { ok: false, status: 404, message: 'Файл не найден' }
  }
  const filePath = resolveSafeExistingPath([orderFilesDir, uploadsDir], String(row.filename))
  if (!filePath) {
    return { ok: false, status: 404, message: 'Файл не найден на диске' }
  }
  let buffer: Buffer
  try {
    buffer = fs.readFileSync(filePath)
  } catch {
    return { ok: false, status: 404, message: 'Не удалось прочитать файл' }
  }
  const displayName = (row.originalName || row.filename).trim() || row.filename
  return { ok: true, buffer, displayName, mime: row.mime }
}
