import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'
import { SupportError } from '../modules/support/supportErrors'
import { StaffActor, SupportService } from '../modules/support/supportService'

const router = Router()

function publicId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value || '')) {
    throw new SupportError(404, 'Чат не найден')
  }
  return value
}

function record(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SupportError(400, 'Некорректный запрос')
  }
  return body as Record<string, unknown>
}

async function staff(req: AuthenticatedRequest): Promise<StaffActor> {
  if (!req.user) throw new SupportError(401, 'Нужна авторизация')
  const db = await getDb()
  const row = await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', req.user.id)
  return {
    id: req.user.id,
    role: req.user.role || 'user',
    name: row?.name || 'Сотрудник',
  }
}

router.get('/attention', asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json(await SupportService.countAttention(await staff(req)))
}))

router.get('/conversations', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const actor = await staff(req)
  res.json(await SupportService.listForOperator(actor, req.query.filter || 'open'))
}))

router.get('/conversations/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const actor = await staff(req)
  res.json(await SupportService.getForOperator(actor, publicId(String(req.params.id))))
}))

router.post('/conversations/:id/claim', asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json(await SupportService.claim(await staff(req), publicId(String(req.params.id))))
}))

router.post('/conversations/:id/transfer', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const body = record(req.body)
  res.json(await SupportService.transfer(await staff(req), publicId(String(req.params.id)), body.userId))
}))

router.post('/conversations/:id/release', asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json(await SupportService.release(await staff(req), publicId(String(req.params.id))))
}))

router.post('/conversations/:id/close', asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json(await SupportService.close(await staff(req), publicId(String(req.params.id))))
}))

router.post('/conversations/:id/messages', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const body = record(req.body)
  res.status(201).json(await SupportService.addOperatorMessage(
    await staff(req),
    publicId(String(req.params.id)),
    body.text,
  ))
}))

router.get('/operators', asyncHandler(async (req: AuthenticatedRequest, res) => {
  await staff(req)
  res.json(await SupportService.listOperators())
}))

router.get('/scripts', asyncHandler(async (req: AuthenticatedRequest, res) => {
  await staff(req)
  res.json(await SupportService.listScripts())
}))

router.post('/scripts', asyncHandler(async (req: AuthenticatedRequest, res) => {
  await staff(req)
  const body = record(req.body)
  res.status(201).json(await SupportService.createScript({ title: body.title, body: body.body }))
}))

router.patch('/scripts/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  await staff(req)
  const body = record(req.body)
  res.json(await SupportService.updateScript(req.params.id, { title: body.title, body: body.body }))
}))

router.delete('/scripts/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  await staff(req)
  res.json(await SupportService.hideScript(req.params.id))
}))

export default router
