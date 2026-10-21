import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { readSupportCustomer } from '../modules/support/supportCustomerAuth'
import { SupportError } from '../modules/support/supportErrors'
import { SupportService } from '../modules/support/supportService'

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

router.get('/conversations', asyncHandler(async (req, res) => {
  const customer = readSupportCustomer(req)
  res.json(await SupportService.listForCustomer(customer))
}))

router.post('/conversations', asyncHandler(async (req, res) => {
  const customer = readSupportCustomer(req)
  const body = record(req.body)
  res.status(201).json(await SupportService.createForCustomer(customer, {
    topic: body.topic,
    text: body.text,
    orderId: body.orderId,
  }))
}))

router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const customer = readSupportCustomer(req)
  res.json(await SupportService.listMessagesForCustomer(customer, publicId(String(req.params.id))))
}))

router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const customer = readSupportCustomer(req)
  const body = record(req.body)
  res.status(201).json(await SupportService.addCustomerMessage(
    customer,
    publicId(String(req.params.id)),
    body.text,
  ))
}))

export default router
