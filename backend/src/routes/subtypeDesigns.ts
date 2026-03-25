import { Router, Request, Response } from 'express'
import { asyncHandler, authenticate } from '../middleware'
import {
  getSubtypeDesigns,
  addSubtypeDesign,
  removeSubtypeDesign,
  reorderSubtypeDesigns,
} from '../services/subtypeDesignService'

const router = Router({ mergeParams: true })
router.use(authenticate)

/** GET /api/products/:productId/subtype-designs?typeId=X */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const typeId = parseInt((req.query.typeId as string) ?? '0', 10)
    if (!productId || !typeId) {
      res.status(400).json({ error: 'productId и typeId обязательны' })
      return
    }
    const designs = await getSubtypeDesigns(productId, typeId)
    res.json(designs)
  }),
)

/** POST /api/products/:productId/subtype-designs */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const { typeId, designTemplateId } = req.body as {
      typeId: number
      designTemplateId: number
    }
    if (!productId || !typeId || !designTemplateId) {
      res.status(400).json({ error: 'productId, typeId и designTemplateId обязательны' })
      return
    }
    try {
      const row = await addSubtypeDesign(productId, typeId, designTemplateId)
      res.status(201).json(row)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'Дизайн уже привязан к этому подтипу' })
        return
      }
      throw err
    }
  }),
)

/** DELETE /api/products/:productId/subtype-designs/:linkId */
router.delete(
  '/:linkId',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const linkId = parseInt(req.params.linkId, 10)
    await removeSubtypeDesign(productId, linkId)
    res.status(204).send()
  }),
)

/** PUT /api/products/:productId/subtype-designs/reorder */
router.put(
  '/reorder',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const { typeId, orderedLinkIds } = req.body as {
      typeId: number
      orderedLinkIds: number[]
    }
    if (!productId || !typeId || !Array.isArray(orderedLinkIds)) {
      res.status(400).json({ error: 'productId, typeId и orderedLinkIds обязательны' })
      return
    }
    await reorderSubtypeDesigns(productId, typeId, orderedLinkIds)
    res.json({ ok: true })
  }),
)

export default router
