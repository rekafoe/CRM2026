import path from 'path'
import fs from 'fs'
import multer from 'multer'

// Загружаем .env до чтения UPLOADS_DIR (на Railway env уже заданы платформой)
try { require('dotenv').config() } catch {}

/** Путь к uploads: UPLOADS_DIR (volume на Railway) или dist/uploads. Без UPLOADS_DIR файлы теряются при редеплое. */
export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../uploads')

// Файлы заказов (макеты клиентов) — в отдельной папке, НЕ отдаются через /api/uploads (безопасность)
export const orderFilesDir = path.join(uploadsDir, 'orders')

// Ensure directories exist
try {
  fs.mkdirSync(uploadsDir, { recursive: true })
  fs.mkdirSync(orderFilesDir, { recursive: true })
} catch {}

export const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: (err: any, dest: string) => void) => cb(null, uploadsDir),
  filename: (_req: any, file: any, cb: (err: any, filename: string) => void) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const ext = path.extname(file.originalname || '')
    cb(null, unique + ext)
  }
})

export const upload = multer({ storage })

/** Multer в памяти — тело не пишется на диск до явной записи. Исправляет случай, когда файлы сохранялись 0 КБ (stream уже прочитан до multer). */
export const uploadMemory = multer({ storage: multer.memoryStorage() })

/**
 * Записать буфер на диск (публичные картинки — продукты, категории, подтипы).
 * @returns { filename, size, originalName } или null если буфер пустой.
 */
export function saveBufferToUploads(
  buffer: Buffer | undefined,
  originalName?: string
): { filename: string; size: number; originalName: string } | null {
  if (!buffer || buffer.length === 0) return null
  const raw = (originalName || '').trim()
  const ext = path.extname(raw) || ''
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
  const filePath = path.join(uploadsDir, unique)
  fs.writeFileSync(filePath, buffer)
  const displayName = raw || (ext ? `document${ext}` : `file-${unique}`)
  return { filename: unique, size: buffer.length, originalName: displayName }
}

/**
 * Записать файл заказа (макет клиента) в защищённую папку orders/.
 * НЕ отдаётся через /api/uploads — только через GET /api/orders/:id/files/:fileId/download (с авторизацией).
 */
export function saveBufferToOrderFiles(
  buffer: Buffer | undefined,
  originalName?: string
): { filename: string; size: number; originalName: string } | null {
  if (!buffer || buffer.length === 0) return null
  const raw = (originalName || '').trim()
  const ext = path.extname(raw) || ''
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
  const filePath = path.join(orderFilesDir, unique)
  fs.writeFileSync(filePath, buffer)
  const displayName = raw || (ext ? `document${ext}` : `file-${unique}`)
  return { filename: unique, size: buffer.length, originalName: displayName }
}
