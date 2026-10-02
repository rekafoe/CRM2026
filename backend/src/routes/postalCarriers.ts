import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'
import {
  belpostReady,
  europostReady,
  getPostalCarrierSettings,
  maskSecret,
  missingBelpostMessage,
  missingEuropostMessage,
  savePostalCarrierSettings,
  type PostalCarrierSettings,
} from '../services/postalCarrierSettings'
import { probeBelpostAccess } from '../services/belpostGateway'
import { listEuropostOffices, probeEuropostAccess } from '../services/europostGateway'

const router = Router()

function requireUser(req: AuthenticatedRequest, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized' })
    return false
  }
  return true
}

function requireAdmin(req: AuthenticatedRequest, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (!requireUser(req, res)) return false
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Доступы Белпочты и Европочты сохраняет администратор' })
    return false
  }
  return true
}

function publicSettings(settings: PostalCarrierSettings) {
  return {
    belpostReady: belpostReady(settings),
    europostReady: europostReady(settings),
    belpostBaseUrl: settings.belpostBaseUrl,
    belpostTokenHint: maskSecret(settings.belpostJwt),
    europostApiUrl: settings.europostApiUrl,
    europostApiPort: settings.europostApiPort,
    europostServiceHint: maskSecret(settings.europostServiceNumber),
    europostLogin: settings.europostLogin,
    europostPasswordHint: maskSecret(settings.europostPassword),
    europostLoginTypeId: settings.europostLoginTypeId,
    europostGoodsId: settings.europostGoodsId,
    europostWarehouseId: settings.europostWarehouseId,
    europostWeightTypeId: settings.europostWeightTypeId,
    europostDeliveryTypeId: settings.europostDeliveryTypeId,
  }
}

router.get('/europost/offices', asyncHandler(async (req, res) => {
  if (!requireUser(req as AuthenticatedRequest, res)) return
  const settings = await getPostalCarrierSettings()
  if (!europostReady(settings)) {
    res.status(409).json({ message: missingEuropostMessage() })
    return
  }
  try {
    const offices = await listEuropostOffices(settings)
    res.json({ offices })
  } catch (error: any) {
    res.status(error?.status || 502).json({ message: error?.message || 'Европочта не отдала пункты выдачи' })
  }
}))

router.get('/status', asyncHandler(async (req, res) => {
  if (!requireUser(req as AuthenticatedRequest, res)) return
  const settings = await getPostalCarrierSettings()
  res.json({
    belpostReady: belpostReady(settings),
    europostReady: europostReady(settings),
    belpostMessage: belpostReady(settings) ? '' : missingBelpostMessage(),
    europostMessage: europostReady(settings) ? '' : missingEuropostMessage(),
  })
}))

router.get('/settings', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const settings = await getPostalCarrierSettings()
  res.json(publicSettings(settings))
}))

router.put('/settings', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const body = (req.body || {}) as Record<string, unknown>
  const text = (key: string) => (body[key] === undefined ? undefined : String(body[key] ?? ''))
  const db = await getDb()
  await savePostalCarrierSettings(db, {
    belpostJwt: text('belpostJwt'),
    belpostBaseUrl: text('belpostBaseUrl'),
    europostApiUrl: text('europostApiUrl'),
    europostApiPort: text('europostApiPort'),
    europostServiceNumber: text('europostServiceNumber'),
    europostLogin: text('europostLogin'),
    europostPassword: text('europostPassword'),
    europostLoginTypeId: text('europostLoginTypeId'),
    europostGoodsId: text('europostGoodsId'),
    europostWarehouseId: text('europostWarehouseId'),
    europostWeightTypeId: text('europostWeightTypeId'),
    europostDeliveryTypeId: text('europostDeliveryTypeId'),
  })
  res.json(publicSettings(await getPostalCarrierSettings(db)))
}))

router.post('/check', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const settings = await getPostalCarrierSettings()
  const probe = async (ready: boolean, missing: string, run: () => Promise<string>) => {
    if (!ready) return { ok: false, message: missing }
    try {
      return { ok: true, message: await run() }
    } catch (error: any) {
      return { ok: false, message: error?.message || 'Перевозчик не ответил' }
    }
  }
  const [belpost, europost] = await Promise.all([
    probe(belpostReady(settings), missingBelpostMessage(), () => probeBelpostAccess(settings)),
    probe(europostReady(settings), missingEuropostMessage(), () => probeEuropostAccess(settings)),
  ])
  res.json({ belpost, europost })
}))

export default router
