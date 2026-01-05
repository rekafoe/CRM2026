import { Router } from 'express';
import { ProductSetupService } from '../services/productSetupService';
import { asyncHandler } from '../../../middleware/asyncHandler';

const router = Router();

/**
 * GET /api/products/:id/setup-status
 * Получить состояние настройки продукта
 */
router.get('/:id/setup-status', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  
  const state = await ProductSetupService.getSetupState(productId);
  
  res.json({
    success: true,
    data: state
  });
}));

/**
 * POST /api/products/:id/complete-step
 * Отметить этап настройки как выполненный
 */
router.post('/:id/complete-step', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const { step, validatedBy, notes } = req.body;

  if (!step) {
    res.status(400).json({
      success: false,
      error: 'step is required'
    });
    return;
  }

  await ProductSetupService.completeStep(productId, step, validatedBy, notes);
  
  const updatedState = await ProductSetupService.getSetupState(productId);
  
  res.json({
    success: true,
    data: updatedState
  });
}));

/**
 * POST /api/products/:id/activate
 * Попытка активировать продукт
 */
router.post('/:id/activate', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  
  const result = await ProductSetupService.activateProduct(productId);
  
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.message
    });
    return;
  }

  res.json({
    success: true,
    message: result.message
  });
}));

/**
 * POST /api/products/:id/update-setup-status
 * Обновить статус настройки на основе текущей конфигурации
 */
router.post('/:id/update-setup-status', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  
  const newStatus = await ProductSetupService.updateSetupStatus(productId);
  const state = await ProductSetupService.getSetupState(productId);
  
  res.json({
    success: true,
    data: {
      status: newStatus,
      state
    }
  });
}));

export default router;

