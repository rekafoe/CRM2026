import { Router } from 'express';
import { getDb } from '../../../db';
import { asyncHandler } from '../../../middleware';
import { ParameterPresetService } from '../services/parameterPresetService';
import { logger } from '../../../utils/logger';
import { extractMinUnitPrice } from './helpers';

const router = Router();

router.get('/debug', async (req, res) => {
  try {
    const db = await getDb();
    const tables = await db.all(`
      SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%product%'
    `);
    const categories = await db.all(`SELECT * FROM product_categories`);
    const products = await db.all(`SELECT * FROM products`);

    res.json({
      tables: tables.map((t: any) => t.name),
      categories,
      products,
      categoriesCount: categories.length,
      productsCount: products.length,
    });
  } catch (error) {
    logger.error('Debug error', { error });
    res.status(500).json({ error: (error as any).message });
  }
});

router.get('/parameter-presets', asyncHandler(async (req, res) => {
  const { productType, productName } = req.query;
  if (!productType || typeof productType !== 'string') {
    res.status(400).json({ error: 'productType query parameter is required' });
    return;
  }
  const presets = await ParameterPresetService.getPresets(
    productType,
    typeof productName === 'string' ? productName : undefined
  );
  res.json(presets);
}));

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Список продуктов
 *     tags: [Products, Website Catalog]
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { activeOnly, search, withMinPrice } = req.query;
    const wantMinPrice = withMinPrice === '1';
    const searchValue = typeof search === 'string' ? search.trim() : '';

    const conditions: string[] = [];
    const params: any[] = [];
    if (activeOnly === 'true') {
      conditions.push('p.is_active = 1');
      if (!searchValue) conditions.push('pc.is_active = 1');
    }
    if (searchValue) {
      const lowerSearch = searchValue.toLowerCase();
      const cappedSearch = lowerSearch.charAt(0).toUpperCase() + lowerSearch.slice(1);
      const patternLower = `%${lowerSearch}%`;
      const patternCapped = `%${cappedSearch}%`;
      conditions.push(`(
        p.name LIKE ? OR p.name LIKE ? OR
        COALESCE(p.description, '') LIKE ? OR COALESCE(p.description, '') LIKE ? OR
        COALESCE(pc.name, '') LIKE ? OR COALESCE(pc.name, '') LIKE ?
      )`);
      params.push(patternLower, patternCapped, patternLower, patternCapped, patternLower, patternCapped);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1';

    const products = await db.all(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      ${whereClause}
      ORDER BY pc.sort_order, p.name
    `, params);

    if (wantMinPrice) {
      const productIds = products.map((p: any) => p.id);
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        const configs = await db.all(
          `SELECT product_id, config_data FROM product_template_configs
           WHERE product_id IN (${placeholders}) AND name = 'template' AND is_active = 1`,
          productIds
        ) as any[];
        const priceMap = new Map<number, number>();
        for (const c of configs) {
          const price = extractMinUnitPrice(c.config_data);
          if (price != null) priceMap.set(c.product_id, price);
        }
        for (const p of products) {
          (p as any).min_price = priceMap.get((p as any).id) ?? null;
        }
      }
    }

    res.json(products);
  } catch (error) {
    logger.error('Error fetching products', { error });
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * @swagger
 * /api/products/category/{categoryId}:
 *   get:
 *     summary: Продукты по категории
 *     tags: [Products, Website Catalog]
 */
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { activeOnly } = req.query;
    const db = await getDb();
    const whereClause = activeOnly === 'true' ? 'AND p.is_active = 1 AND pc.is_active = 1' : '';

    const products = await db.all(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.category_id = ? ${whereClause}
      ORDER BY p.name
    `, [categoryId]);
    res.json(products);
  } catch (error) {
    logger.error('Error fetching products by category', error);
    res.status(500).json({ error: 'Failed to fetch products by category' });
  }
});

export default router;
