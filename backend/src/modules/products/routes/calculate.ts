import { Router } from 'express';
import { getDb } from '../../../db';
import { ProductConfiguration } from '../../../types/products';
import { rateLimiter } from '../../../middleware/rateLimiter';
import { logger } from '../../../utils/logger';

const router = Router();

const calculateRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many price calculations, please slow down'
});
const validateRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many size validations, please slow down'
});

router.post('/:productId/calculate', calculateRateLimit, async (req, res) => {
  try {
    const { productId } = req.params;
    const configuration: ProductConfiguration = req.body;

    logger.debug('Calculating price for product', { productId, configuration });

    const { UnifiedPricingService } = await import('../../pricing/services/unifiedPricingService');
    const result = await UnifiedPricingService.calculatePrice(
      parseInt(productId),
      configuration,
      configuration.quantity
    );

    logger.info('Price calculated', { finalPrice: result.finalPrice, method: result.calculationMethod });
    res.json(result);
  } catch (error) {
    logger.error('Error calculating product price', error);
    res.status(500).json({ error: 'Failed to calculate product price' });
  }
});

router.post('/:productId/validate-size', validateRateLimit, async (req, res) => {
  try {
    const { productId } = req.params;
    const { width, height } = req.body;

    logger.debug('Validating size for product', { productId, size: `${width}x${height}mm` });

    const { LayoutCalculationService } = await import('../../pricing/services/layoutCalculationService');

    const db = await getDb();

    const product = await db.get(`
      SELECT p.*, pc.name as category_name
      FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.id = ?
    `, [productId]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productSize = { width: Number(width), height: Number(height) };
    const validation = LayoutCalculationService.validateProductSize(
      (product as any).category_name,
      productSize
    );

    if (!validation.isValid) {
      return res.json({
        isValid: false,
        message: validation.message,
        recommendedSize: validation.recommendedSize
      });
    }

    const layout = LayoutCalculationService.findOptimalSheetSize(productSize);

    res.json({
      isValid: true,
      layout: {
        fitsOnSheet: layout.fitsOnSheet,
        itemsPerSheet: layout.itemsPerSheet,
        wastePercentage: layout.wastePercentage,
        sheetSize: layout.recommendedSheetSize,
        layout: layout.layout
      }
    });
  } catch (error) {
    logger.error('Error validating product size', error);
    res.status(500).json({ error: 'Failed to validate product size' });
  }
});

export default router;
