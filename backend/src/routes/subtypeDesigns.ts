import { Router, Request, Response } from 'express'
import { asyncHandler, authenticate, type AuthenticatedRequest } from '../middleware'
import { canEditDesign, canUseDesignCatalog, type DesignActor } from '../services/designTemplateAccess'
import { getDesignTemplate } from '../services/designTemplateService'
import {
  getSubtypeDesigns,
  getSubtypeDesignTemplateId,
  addSubtypeDesign,
  removeSubtypeDesign,
  reorderSubtypeDesigns,
} from '../services/subtypeDesignService'

function catalogActor(req: Request): DesignActor | null {
  const user = (req as AuthenticatedRequest).user
  if (!user?.id || !canUseDesignCatalog(user.role)) return null
  return { id: user.id, role: user.role }
}

async function assertCanPublishTemplate(req: Request, res: Response, templateId: number): Promise<boolean> {
  const actor = catalogActor(req)
  if (!actor) {
    res.status(403).json({ error: 'Привязка дизайнов доступна сотрудникам CRM' })
    return false
  }
  const template = await getDesignTemplate(templateId)
  if (!template) {
    res.status(404).json({ error: 'Шаблон не найден' })
    return false
  }
  if (!canEditDesign(actor, template)) {
    res.status(403).json({ error: 'Привязать или отвязать можно только свой дизайн' })
    return false
  }
  return true
}

const router = Router({ mergeParams: true })
router.use(authenticate)

/** GET /api/products/:productId/subtype-designs?typeId=X&sizeId=Y */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const typeId = Number(req.query.typeId)
    const sizeIdRaw = req.query.sizeId != null ? String(req.query.sizeId).trim() : ''
    if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(typeId) || typeId <= 0) {
      res.status(400).json({ error: 'productId и typeId обязательны' })
      return
    }
    // Без sizeId — все макеты подтипа (для идемпотентного ensure пустого сувенирного шаблона).
    const designs = await getSubtypeDesigns(
      productId,
      typeId,
      sizeIdRaw ? sizeIdRaw : undefined,
    )
    res.json(designs)
  }),
)

/** POST /api/products/:productId/subtype-designs */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const { typeId, designTemplateId, sizeId } = req.body as {
      typeId: number
      designTemplateId: number
      sizeId: string
    }
    if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(Number(typeId)) || Number(typeId) <= 0 || !designTemplateId) {
      res.status(400).json({ error: 'productId, typeId и designTemplateId обязательны' })
      return
    }
    if (!(await assertCanPublishTemplate(req, res, Number(designTemplateId)))) return
    try {
      const row = await addSubtypeDesign(productId, typeId, designTemplateId, sizeId)
      res.status(201).json(row)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'Дизайн уже привязан к этому размеру подтипа' })
        return
      }
      if (msg.includes('sizeId обязателен')) {
        res.status(400).json({ error: msg })
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
    const templateId = await getSubtypeDesignTemplateId(productId, linkId)
    if (!templateId) {
      res.status(404).json({ error: 'Привязка не найдена' })
      return
    }
    if (!(await assertCanPublishTemplate(req, res, templateId))) return
    await removeSubtypeDesign(productId, linkId)
    res.status(204).send()
  }),
)

/** PUT /api/products/:productId/subtype-designs/reorder */
router.put(
  '/reorder',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId, 10)
    const { typeId, sizeId, orderedLinkIds } = req.body as {
      typeId: number
      sizeId: string
      orderedLinkIds: number[]
    }
    if (!productId || !typeId || !Array.isArray(orderedLinkIds)) {
      res.status(400).json({ error: 'productId, typeId и orderedLinkIds обязательны' })
      return
    }
    for (const linkId of orderedLinkIds) {
      const templateId = await getSubtypeDesignTemplateId(productId, Number(linkId))
      if (!templateId) {
        res.status(404).json({ error: 'Привязка не найдена' })
        return
      }
      if (!(await assertCanPublishTemplate(req, res, templateId))) return
    }
    await reorderSubtypeDesigns(productId, typeId, sizeId, orderedLinkIds)
    res.json({ ok: true })
  }),
)

export default router
