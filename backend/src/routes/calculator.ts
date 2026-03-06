/**
 * Роуты /api/calculator/* — алиас для калькулятора.
 * POST /api/calculator/calculate — расчёт цены.
 * Поддерживает два формата:
 * 1) productId, quantity, configuration — проксирует в /pricing/calculate
 * 2) productType, productName, quantity, specifications — UniversalCalculator (legacy)
 */
import { Router } from 'express';
import { UniversalCalculatorController } from '../controllers';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /api/calculator/calculate — расчёт цены
router.post('/calculate', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const hasProductId = body.productId != null || body.product_id != null;

  if (hasProductId) {
    // Новый формат: productId + configuration → pricing/calculate
    const { PricingController } = await import('../modules/pricing/controllers/pricingController');
    const adapted = {
      productId: body.productId ?? body.product_id,
      quantity: body.quantity ?? body.qty,
      configuration: body.configuration ?? body.params ?? body.specifications ?? {},
    };
    (req as any).body = adapted;
    return PricingController.calculateProductPrice(req, res);
  }

  // Legacy: productType, productName, quantity, specifications
  const { productType, productName, quantity, specifications = {}, priceType, customerType } = body;
  const options = {
    ...specifications,
    ...(priceType != null ? { priceType } : {}),
    ...(customerType != null ? { customerType } : {}),
  };
  (req as any).body = { productType, productName, quantity, options };
  return UniversalCalculatorController.calculateProductCost(req, res);
}));

export default router;
