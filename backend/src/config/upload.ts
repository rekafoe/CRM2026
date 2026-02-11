import path from 'path'
import fs from 'fs'
import multer from 'multer'

export const uploadsDir = path.resolve(__dirname, '../uploads')

// Ensure uploads directory exists
try {
  fs.mkdirSync(uploadsDir, { recursive: true })
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
 * Записать буфер загруженного файла на диск. Используется после uploadMemory.
 * @returns { filename, size, originalName } или null если буфер пустой.
 * originalName — имя для отображения (то, что пришло от клиента, или fallback).
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
