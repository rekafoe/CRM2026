import { Router } from 'express';
import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import { getCachedData, invalidateCacheByPattern } from '../../../utils/dataCache';
import { extractMinUnitPrice } from './helpers';

const router = Router();

/**
 * @swagger
 * /api/products/categories:
 *   get:
 *     summary: Список категорий продуктов
 *     tags: [Products, Website Catalog]
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - in: query
 *         name: withMinPrice
 *         schema:
 *           type: string
 *           enum: ['1']
 *         description: "Добавить min_price — минимальная цена за 1 ед. среди всех продуктов категории"
 */
router.get('/', async (req, res) => {
  try {
    logger.debug('Fetching product categories');
    const db = await getDb();
    const { activeOnly, withMinPrice } = req.query;
    const wantMinPrice = withMinPrice === '1';
    const cacheKey = `product_categories_${activeOnly === 'true' ? 'active' : 'all'}${wantMinPrice ? '_mp' : ''}`;

    const categories = await getCachedData(
      cacheKey,
      async () => {
        const whereClause = activeOnly === 'true' ? 'WHERE is_active = 1' : 'WHERE 1=1';
        const rows = await db.all(`
          SELECT * FROM product_categories 
          ${whereClause}
          ORDER BY sort_order, name
        `);

        if (!wantMinPrice) return rows;

        const configs = await db.all(`
          SELECT ptc.product_id, p.category_id, ptc.config_data
          FROM product_template_configs ptc
          JOIN products p ON p.id = ptc.product_id AND p.is_active = 1
          WHERE ptc.name = 'template' AND ptc.is_active = 1
        `) as any[];

        const minByCategory = new Map<number, number>();
        for (const c of configs) {
          const price = extractMinUnitPrice(c.config_data);
          if (price == null) continue;
          const prev = minByCategory.get(c.category_id);
          if (prev === undefined || price < prev) minByCategory.set(c.category_id, price);
        }

        return rows.map((cat: any) => ({
          ...cat,
          min_price: minByCategory.get(cat.id) ?? null,
        }));
      },
      10 * 60 * 1000
    );

    logger.debug('Found categories', { count: categories.length });
    res.json(categories);
  } catch (error) {
    logger.error('Error fetching product categories', { error });
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, icon, description, sort_order, image_url } = req.body;
    const db = await getDb();

    const result = await db.run(`
      INSERT INTO product_categories (name, icon, description, sort_order, image_url)
      VALUES (?, ?, ?, ?, ?)
    `, [name, icon, description, sort_order || 0, image_url || null]);

    invalidateCacheByPattern('product_categories');
    res.json({ id: result.lastID, name, icon, description, sort_order, image_url });
  } catch (error) {
    logger.error('Error creating product category', error);
    res.status(500).json({ error: 'Failed to create product category' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description, sort_order, is_active, image_url } = req.body;
    const db = await getDb();

    await db.run(`
      UPDATE product_categories 
      SET name = ?, icon = ?, description = ?, sort_order = ?, is_active = ?, image_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [name, icon, description, sort_order, is_active, image_url ?? null, id]);

    invalidateCacheByPattern('product_categories');
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating product category', error);
    res.status(500).json({ error: 'Failed to update product category' });
  }
});

export default router;
