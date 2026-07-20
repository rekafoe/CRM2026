import { Request, Response, NextFunction } from 'express'
import { config } from '../config/app'

interface ApiError extends Error {
  status?: number
  code?: string
  details?: any
}

export const errorHandler = (err: ApiError, req: Request, res: Response, _next: NextFunction) => {
  const showStack = (config.nodeEnv !== 'production') && config.showErrorStack
  const isProduction = config.nodeEnv === 'production'
  const timestamp = new Date().toISOString()
  
  // Определяем тип ошибки и статус
  let status = err.status || 500
  let message = err.message || 'Internal Server Error'
  let code = err.code || 'INTERNAL_ERROR'

  // Multer (multipart): без этого LIMIT_* уходит в 500
  const multerCode = String((err as any).code || '')
  if (err.name === 'MulterError' || multerCode.startsWith('LIMIT_')) {
    if (multerCode === 'LIMIT_FILE_SIZE') {
      status = 413
      code = 'FILE_TOO_LARGE'
      message = 'Файл превышает допустимый размер (см. UPLOAD_MAX_FILE_SIZE_BYTES)'
    } else if (multerCode === 'LIMIT_FILE_COUNT' || multerCode === 'LIMIT_UNEXPECTED_FILE') {
      status = 400
      code = 'TOO_MANY_FILES'
      message = 'Слишком много файлов в одном запросе (макс. 500 шрифтов за раз)'
    } else if (multerCode === 'LIMIT_FIELD_KEY' || multerCode === 'LIMIT_FIELD_VALUE' || multerCode === 'LIMIT_FIELD_COUNT') {
      status = 400
      code = 'MULTIPART_FIELDS_LIMIT'
      message = 'Превышен лимит полей формы (см. UPLOAD_MAX_FIELDS)'
    } else if (multerCode === 'LIMIT_PART_COUNT') {
      status = 400
      code = 'MULTIPART_PARTS_LIMIT'
      message = 'Слишком много частей multipart-запроса'
    } else {
      status = 400
      code = 'MULTIPART_ERROR'
      message = err.message || 'Ошибка загрузки файла'
    }
  }

  if (multerCode === 'SQLITE_BUSY' || multerCode === 'SQLITE_LOCKED') {
    status = 503
    code = 'DATABASE_BUSY'
    message = 'База занята, повторите запрос через несколько секунд'
  }
  
  // Обработка специфических ошибок
  if (err.name === 'ValidationError') {
    status = 400
    code = 'VALIDATION_ERROR'
  } else if (err.name === 'UnauthorizedError') {
    status = 401
    code = 'UNAUTHORIZED'
  } else if (err.name === 'ForbiddenError') {
    status = 403
    code = 'FORBIDDEN'
  } else if (err.name === 'NotFoundError') {
    status = 404
    code = 'NOT_FOUND'
  } else if (err.name === 'ConflictError') {
    status = 409
    code = 'CONFLICT'
  }
  // Только «голый» 500 скрываем; 503 (занятость БД и т.п.) оставляем понятным текстом для ретраев на клиенте
  if (isProduction && status === 500) {
    message = 'Internal Server Error'
    code = 'INTERNAL_ERROR'
  }
  
  const payload: any = { 
    error: message,
    code,
    timestamp,
    path: req.path,
    method: req.method
  }
  
  if (showStack) {
    payload.stack = err.stack
    payload.details = err.details
  }
  
  // Структурированное логирование
  const logData = {
    level: 'error',
    message,
    code,
    status,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    stack: showStack ? err.stack : undefined,
    details: err.details,
    timestamp
  }
  
  try { 
    console.error(JSON.stringify(logData)) 
  } catch (logError) {
    console.error('Failed to log error:', logError)
  }
  
  res.status(status).json(payload)
}
