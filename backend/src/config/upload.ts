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

const MAX_UPLOAD_FILE_SIZE_BYTES = Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 25 * 1024 * 1024)
const MAX_UPLOAD_FIELDS = Number(process.env.UPLOAD_MAX_FIELDS || 50)
const SAFE_STORED_FILENAME_RE = /^[a-zA-Z0-9._-]+$/
const allowedUploadMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

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

function defaultFileFilter(_req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void): void {
  const mime = String(file?.mimetype || '').toLowerCase()
  const ext = path.extname(String(file?.originalname || '')).toLowerCase()
  const extAllowed = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.pdf', '.doc', '.docx', '.xls', '.xlsx']
  const accepted = allowedUploadMimes.has(mime) && extAllowed.includes(ext)
  if (!accepted) {
    cb(new Error('Unsupported file type'), false)
    return
  }
  cb(null, true)
}

const multerCommonOptions = {
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
    fields: MAX_UPLOAD_FIELDS,
  },
  fileFilter: defaultFileFilter,
}

export const upload = multer({ storage, ...multerCommonOptions })

/** Multer в памяти — тело не пишется на диск до явной записи. Исправляет случай, когда файлы сохранялись 0 КБ (stream уже прочитан до multer). */
export const uploadMemory = multer({ storage: multer.memoryStorage(), ...multerCommonOptions })

export function isSafeStoredFilename(filename: string): boolean {
  if (!filename) return false
  if (!SAFE_STORED_FILENAME_RE.test(filename)) return false
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false
  return true
}

export function resolveSafeFilePath(baseDir: string, filename: string): string | null {
  if (!isSafeStoredFilename(filename)) return null
  const resolvedBase = path.resolve(baseDir)
  const resolvedPath = path.resolve(baseDir, filename)
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    return null
  }
  return resolvedPath
}

export function resolveSafeExistingPath(baseDirs: string[], filename: string): string | null {
  for (const dir of baseDirs) {
    const candidate = resolveSafeFilePath(dir, filename)
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** Преобразует название подтипа в slug для имени файла (латиница, дефисы). */
function toSlug(name: string): string {
  const cyr: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z',
    И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
    С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch',
    Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
  }
  let s = (name || '').trim()
  s = s.split('').map((c) => cyr[c] ?? (c.match(/[a-zA-Z0-9]/) ? c : c === ' ' ? '-' : '')).join('')
  s = s.replace(/-+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').replace(/^-|-$/g, '').toLowerCase()
  return s.slice(0, 60) || 'image'
}

/** Короткий уникальный суффикс (буквы/цифры, без 0/O, 1/l). */
function shortId(len = 4): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * Записать буфер на диск (публичные картинки — продукты, категории, подтипы).
 * @param prefix — название подтипа/подкатегории для имени файла (напр. "Визитки стандартные" → vizitki-standartnye-x7k2.png)
 */
export function saveBufferToUploads(
  buffer: Buffer | undefined,
  originalName?: string,
  prefix?: string
): { filename: string; size: number; originalName: string } | null {
  if (!buffer || buffer.length === 0) return null
  const raw = (originalName || '').trim()
  const ext = path.extname(raw) || '.png'
  const base = prefix ? toSlug(prefix) : ''
  const unique = base ? `${base}-${shortId(4)}${ext}` : `${shortId(6)}${ext}`
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
