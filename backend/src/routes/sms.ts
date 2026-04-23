import { Router } from 'express'
import { asyncHandler } from '../middleware'
import type { AuthenticatedRequest } from '../middleware/auth'
import { getDb } from '../config/database'
import { isSmsEnabled, getSmsDebounceSeconds } from '../config/sms'

const router = Router()

function requireAdmin(req: AuthenticatedRequest, res: import('express').Response): boolean {
  const user = req.user
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return false
  }
  return true
}

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) {
      return
    }
    res.json({
      enabled: isSmsEnabled(),
      debounceSeconds: getSmsDebounceSeconds(),
    })
  })
)

router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) {
      return
    }
    const db = await getDb()
    const rows = await db.all(
      `SELECT id, slug, name, body_template, is_active, created_at FROM sms_templates ORDER BY id`
    )
    res.json({ templates: rows })
  })
)

router.get(
  '/order-rules',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) {
      return
    }
    const db = await getDb()
    const rules = await db.all(
      `SELECT r.id, r.to_status_id, r.sms_template_id, r.is_active, s.name as status_name, t.slug as template_slug
       FROM order_sms_rules r
       LEFT JOIN order_statuses s ON s.id = r.to_status_id
       LEFT JOIN sms_templates t ON t.id = r.sms_template_id
       ORDER BY r.to_status_id`
    )
    res.json({ rules })
  })
)

router.patch(
  '/order-rules/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) {
      return
    }
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const isActive = (req.body as { is_active?: boolean })?.is_active
    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'is_active (boolean) required' })
      return
    }
    const db = await getDb()
    const r = await db.run('UPDATE order_sms_rules SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id])
    if (!r.changes) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }
    res.json({ ok: true, id, is_active: isActive })
  })
)

export default router
