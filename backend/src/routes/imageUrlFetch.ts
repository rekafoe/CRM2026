import { Router, Request, Response } from 'express'
import { asyncHandler, authenticate } from '../middleware'
import { fetchImageFromRemoteUrl } from '../services/imageUrlFetchService'

const router = Router()
router.use(authenticate)

/**
 * POST /api/images/from-url
 * Тело: { url: string } — загрузка по HTTPS для редактора (обход CORS, проверка SSRF).
 */
router.post(
  '/from-url',
  asyncHandler(async (req: Request, res: Response) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
    if (!url) {
      res.status(400).json({ error: 'Укажите url' })
      return
    }
    const { buffer, contentType } = await fetchImageFromRemoteUrl(url)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(buffer)
  }),
)

export default router
