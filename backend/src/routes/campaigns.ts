import { Router } from 'express'
import { asyncHandler } from '../middleware'
import type { AuthenticatedRequest } from '../middleware/auth'
import { CampaignDispatchService } from '../modules/campaigns/services/campaignDispatchService'
import { CampaignSegmentService } from '../modules/campaigns/services/campaignSegmentService'
import { CampaignService } from '../modules/campaigns/services/campaignService'
import { CampaignTemplateService } from '../modules/campaigns/services/campaignTemplateService'

const router = Router()

function requireAdmin(req: AuthenticatedRequest, res: import('express').Response): boolean {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return false
  }
  return true
}

router.get('/templates', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const channel = String((req.query as { channel?: string }).channel || '').trim() || undefined
  res.json({ templates: await CampaignTemplateService.list(channel) })
}))

router.post('/templates', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  res.status(201).json(await CampaignTemplateService.create(req.body))
}))

router.patch('/templates/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  res.json(await CampaignTemplateService.update(id, req.body))
}))

router.get('/segments', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  res.json({ segments: await CampaignSegmentService.list() })
}))

router.post('/segments', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  res.status(201).json(await CampaignSegmentService.create(req.body))
}))

router.patch('/segments/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  res.json(await CampaignSegmentService.update(id, req.body))
}))

router.post('/segments/:id/estimate', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  const channel = String((req.body as { channel?: string }).channel || '')
  if (!Number.isFinite(id) || !channel) {
    return void res.status(400).json({ error: 'segment id and channel required' })
  }
  const count = await CampaignSegmentService.estimate(id, channel as any)
  res.json({ count })
}))

router.get('/runs', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const campaignId = Number((req.query as { campaignId?: string }).campaignId)
  const runs = await CampaignService.listRuns(Number.isFinite(campaignId) ? campaignId : undefined)
  const withStats = await Promise.all(
    runs.map(async (run) => ({
      ...run,
      stats: await CampaignDispatchService.recalculateRunStats(run.id),
    }))
  )
  res.json({ runs: withStats })
}))

router.get('/runs/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  const run = await CampaignService.getRunById(id)
  if (!run) return void res.status(404).json({ error: 'Run not found' })
  const stats = await CampaignDispatchService.recalculateRunStats(id)
  res.json({ ...run, stats })
}))

router.get('/runs/:id/recipients', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  res.json({ recipients: await CampaignDispatchService.getRunRecipients(id) })
}))

router.post('/runs/:id/cancel', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  await CampaignDispatchService.cancelRun(id)
  res.json({ ok: true })
}))

router.get('/', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const query = req.query as { channel?: string; status?: string }
  res.json({ campaigns: await CampaignService.list(query) })
}))

router.post('/', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const user = (req as AuthenticatedRequest).user
  res.status(201).json(await CampaignService.create(req.body, user?.id ?? null))
}))

router.get('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  const campaign = await CampaignService.getById(id)
  if (!campaign) return void res.status(404).json({ error: 'Campaign not found' })
  const runs = await CampaignService.listRuns(id)
  const withStats = await Promise.all(
    runs.map(async (run) => ({
      ...run,
      stats: await CampaignDispatchService.recalculateRunStats(run.id),
    }))
  )
  res.json({ ...campaign, runs: withStats })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  res.json(await CampaignService.update(id, req.body))
}))

router.post('/:id/estimate', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  const campaign = await CampaignService.getById(id)
  if (!campaign) return void res.status(404).json({ error: 'Campaign not found' })
  const count = await CampaignSegmentService.estimate(Number(campaign.segment_id), campaign.channel)
  res.json({ count })
}))

router.post('/:id/test', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  const campaign = await CampaignService.getById(id)
  if (!campaign) return void res.status(404).json({ error: 'Campaign not found' })
  const destinations = Array.isArray((req.body as { destinations?: string[] }).destinations)
    ? (req.body as { destinations?: string[] }).destinations
    : []
  if (destinations.length === 0) {
    return void res.status(400).json({ error: 'destinations required for test run' })
  }
  const run = await CampaignService.createRun(id, 'test', (req as AuthenticatedRequest).user?.id ?? null)
  void CampaignDispatchService.dispatchRun(run.id, {
    testDestinations: destinations,
    testMessage: String((req.body as { message?: string }).message || '').trim() || undefined,
  })
  res.status(202).json({ ok: true, runId: run.id })
}))

router.post('/:id/run', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return void res.status(400).json({ error: 'Invalid id' })
  const campaign = await CampaignService.getById(id)
  if (!campaign) return void res.status(404).json({ error: 'Campaign not found' })
  if (campaign.scheduled_at) {
    await CampaignService.setCampaignStatus(id, 'scheduled')
    return void res.status(202).json({ ok: true, status: 'scheduled' })
  }
  const run = await CampaignService.createRun(id, 'live', (req as AuthenticatedRequest).user?.id ?? null)
  void CampaignDispatchService.dispatchRun(run.id)
  res.status(202).json({ ok: true, runId: run.id })
}))

export default router
