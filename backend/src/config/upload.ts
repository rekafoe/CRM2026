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
