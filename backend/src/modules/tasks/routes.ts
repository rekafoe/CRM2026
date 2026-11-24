import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../../middleware'
import { TaskError, TaskService } from './taskService'
import { TaskActor } from './types'

const router = Router()

function actorFrom(req: AuthenticatedRequest): TaskActor {
  if (!req.user?.id) throw new TaskError(401, 'UNAUTHORIZED', 'Unauthorized')
  return { id: Number(req.user.id), role: String(req.user.role || '') }
}

function routeId(value: unknown): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw new TaskError(400, 'VALIDATION_ERROR', 'Некорректный id задачи')
  }
  return id
}

router.get('/', asyncHandler(async (req, res) => {
  actorFrom(req as AuthenticatedRequest)
  res.json({ items: await TaskService.list() })
}))

router.post('/', asyncHandler(async (req, res) => {
  const task = await TaskService.create(actorFrom(req as AuthenticatedRequest), req.body || {})
  res.status(201).json(task)
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const task = await TaskService.update(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
    req.body || {},
  )
  res.json(task)
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await TaskService.delete(routeId(req.params.id), actorFrom(req as AuthenticatedRequest))
  res.status(204).end()
}))

export default router
