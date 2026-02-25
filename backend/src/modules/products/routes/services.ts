import { Router } from 'express';
import { asyncHandler } from '../../../middleware';
import { ProductServiceLinkService } from '../services/serviceLinkService';
import { toServiceLinkResponse } from './helpers';

const router = Router();

router.get('/:productId/services', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const links = await ProductServiceLinkService.list(Number(productId));
  res.json(links.map(toServiceLinkResponse));
}));

router.post('/:productId/services', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { service_id, serviceId, is_required, isRequired, default_quantity, defaultQuantity } = req.body || {};
  const targetServiceId = Number(service_id ?? serviceId);
  if (!targetServiceId) {
    res.status(400).json({ error: 'service_id is required' });
    return;
  }
  try {
    const { link, alreadyLinked } = await ProductServiceLinkService.create(Number(productId), {
      serviceId: targetServiceId,
      isRequired: is_required !== undefined ? !!is_required : isRequired,
      defaultQuantity: default_quantity ?? defaultQuantity,
    });

    if (alreadyLinked) {
      res.status(200).json({ alreadyLinked: true, data: toServiceLinkResponse(link) });
      return;
    }

    res.status(201).json(toServiceLinkResponse(link));
  } catch (error: any) {
    if (error?.code === 'SERVICE_NOT_FOUND') {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    throw error;
  }
}));

router.delete('/:productId/services/:serviceId', asyncHandler(async (req, res) => {
  const { productId, serviceId } = req.params;
  const removed = await ProductServiceLinkService.delete(Number(productId), Number(serviceId));
  res.json({ success: true, removed });
}));

export default router;
