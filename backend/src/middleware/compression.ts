import { Request, Response, NextFunction } from 'express'
import { gzip, deflate } from 'zlib'

export function compressionMiddleware(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send
  const acceptEncoding = req.headers['accept-encoding'] || ''

  // Проверяем, поддерживает ли клиент сжатие
  if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
    return next()
  }

  // Определяем метод сжатия
  const useGzip = acceptEncoding.includes('gzip')
  const compressionMethod = useGzip ? gzip : deflate

  // Устанавливаем заголовки
  res.setHeader('Content-Encoding', useGzip ? 'gzip' : 'deflate')
  res.setHeader('Vary', 'Accept-Encoding')

  // Переопределяем метод send для сжатия ответа
  res.send = function(data: any): Response {
    if (res.headersSent) {
      return originalSend.call(this, data)
    }

    // Сжимаем только JSON и текстовые данные
    if (typeof data === 'string' || Buffer.isBuffer(data)) {
      compressionMethod(data, (err, compressed) => {
        if (err) {
          console.error('Ошибка сжатия:', err)
          originalSend.call(this, data)
        } else {
          res.setHeader('Content-Length', compressed.length)
          originalSend.call(this, compressed)
        }
      })
      return res
    } else {
      return originalSend.call(this, data)
    }
  }

  next()
}
