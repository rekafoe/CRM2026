import { Request, Response, NextFunction } from 'express'
import { gzip, deflate } from 'zlib'

function isUploadsOrStaticPath(req: Request): boolean {
  const path = req.path || ''
  const base = (req.originalUrl || '').split('?')[0] || path
  return (
    path.startsWith('/api/uploads') ||
    path.startsWith('/uploads') ||
    base.startsWith('/api/uploads') ||
    base.startsWith('/uploads')
  )
}

function isDesignFontContentPath(req: Request): boolean {
  const path = req.path || ''
  const base = (req.originalUrl || '').split('?')[0] || path
  const re = /\/api\/design-fonts\/(?:public\/)?[0-9]+\/content\/?$/
  return re.test(path) || re.test(base)
}

function matchesPath(req: Request, re: RegExp): boolean {
  const path = req.path || ''
  const base = (req.originalUrl || '').split('?')[0] || path
  return re.test(path) || re.test(base)
}

function isBinaryFileResponsePath(req: Request): boolean {
  // sendFile не идёт через res.send. Content-Encoding на таком ответе
  // заставляет браузер gunzip-ить сырой JPEG/PNG → ERR_CONTENT_DECODING_FAILED.
  const draftFileBinaryRe =
    /\/api\/public-editor\/drafts\/[^/]+\/files\/[0-9]+\/(?:content|thumb)\/?$/
  const templateAssetBinaryRe =
    /\/api\/design-templates\/(?:public\/)?[0-9]+\/assets\/[0-9]+\/(?:content|thumb)\/?$/
  const designAssetBinaryRe =
    /\/api\/design-assets\/(?:public\/)?[0-9]+\/(?:content|thumb)\/?$/
  return (
    isDesignFontContentPath(req) ||
    matchesPath(req, draftFileBinaryRe) ||
    matchesPath(req, templateAssetBinaryRe) ||
    matchesPath(req, designAssetBinaryRe)
  )
}

export function compressionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Исключаем Swagger UI из сжатия, чтобы избежать проблем с отображением
  if (req.path.startsWith('/api-docs')) {
    return next()
  }
  // Не сжимаем изображения и файлы — PNG/JPEG уже сжаты; gzip + бинарники даёт сбои у HTTP/2/прокси
  if (isUploadsOrStaticPath(req)) {
    return next()
  }
  // Бинарники через sendFile (черновики, картинки шаблона, клипарт): без Content-Encoding.
  if (isBinaryFileResponsePath(req)) {
    return next()
  }
  // Не сжимаем скачивание файлов заказов — отдаём бинарные данные как есть
  if (/\/orders\/[^/]+\/files\/[^/]+\/download$/.test(req.path)) {
    return next()
  }
  
  const originalSend = res.send
  const acceptEncoding = req.headers['accept-encoding'] || ''

  // Проверяем, поддерживает ли клиент сжатие
  if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
    return next()
  }

  // Определяем метод сжатия
  const useGzip = acceptEncoding.includes('gzip')
  const compressionMethod = useGzip ? gzip : deflate
  const encoding = useGzip ? 'gzip' : 'deflate'

  // Vary можно ставить заранее. Content-Encoding — только вместе со сжатым телом:
  // sendFile этот send не вызывает и иначе отдаёт сырой файл с gzip-заголовком.
  res.setHeader('Vary', 'Accept-Encoding')

  // Переопределяем метод send для сжатия ответа
  res.send = function(data: any): Response {
    if (res.headersSent) {
      return originalSend.call(this, data)
    }

    // Сжимаем только JSON и текстовые данные
    if (typeof data === 'string' || Buffer.isBuffer(data)) {
      compressionMethod(data, (err, compressed) => {
        if (err || res.headersSent) {
          if (err) console.error('Ошибка сжатия:', err)
          if (!res.headersSent) res.removeHeader('Content-Encoding')
          originalSend.call(this, data)
          return
        }
        res.setHeader('Content-Encoding', encoding)
        res.setHeader('Content-Length', compressed.length)
        originalSend.call(this, compressed)
      })
      return res
    }

    res.removeHeader('Content-Encoding')
    return originalSend.call(this, data)
  }

  next()
}
