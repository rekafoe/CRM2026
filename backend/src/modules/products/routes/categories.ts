import { Router } from 'express';
import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import { getCachedData, invalidateCacheByPattern } from '../../../utils/dataCache';
import { extractMinUnitPrice } from './helpers';
import { uploadMemory, saveBufferToUploads } from '../../../config/upload';

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
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: withMinPrice
 *         schema: { type: string, enum: ['1'] }
 *         description: "Добавить min_price — минимальная цена за 1 ед. среди всех продуктов категории"
 *     responses:
 *       200:
 *         description: Массив категорий
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ProductCategory' }
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

/**
 * @swagger
 * /api/products/categories:
 *   post:
 *     summary: Создать категорию продуктов
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: "Название категории" }
 *               icon: { type: string, description: "Эмодзи или символ" }
 *               description: { type: string }
 *               sort_order: { type: integer }
 *               image_url: { type: string, description: "URL изображения" }
 *     responses:
 *       200: { description: Категория создана }
 *       500: { description: Ошибка сервера }
 */
router.post('/', async (req, res) => {
  try {
    const { name, icon, description, sort_order, image_url } = req.body;
    const db = await getDb();

    const cols = await db.all("PRAGMA table_info('product_categories')") as any[];
    const hasImageUrl = cols.some((c: any) => c.name === 'image_url');

    const columns = ['name', 'icon', 'description', 'sort_order'];
    const values: any[] = [name, icon, description, sort_order || 0];
    if (hasImageUrl) {
      columns.push('image_url');
      values.push(image_url || null);
    }

    const result = await db.run(
      `INSERT INTO product_categories (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values
    );

    invalidateCacheByPattern('product_categories');
    res.json({ id: result.lastID, name, icon, description, sort_order, image_url });
  } catch (error) {
    logger.error('Error creating product category', error);
    res.status(500).json({ error: 'Failed to create product category' });
  }
});

/**
 * @swagger
 * /api/products/categories/upload-image:
 *   post:
 *     summary: Загрузить изображение категории
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: URL загруженного файла }
 *       400: { description: Файл не передан или неверный формат }
 */
router.post('/upload-image', uploadMemory.single('image'), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'Файл не передан' });
    }

    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedMime.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Допустимы только изображения (JPEG, PNG, WebP, GIF, SVG)' });
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({ error: 'Максимальный размер файла — 5 МБ' });
    }

    const saved = saveBufferToUploads(file.buffer, file.originalname);
    if (!saved) {
      return res.status(400).json({ error: 'Пустой файл' });
    }

    const imageUrl = `/api/uploads/${saved.filename}`;
    res.json({ image_url: imageUrl, filename: saved.filename, size: saved.size });
  } catch (error) {
    logger.error('Error uploading category image', error);
    res.status(500).json({ error: 'Ошибка загрузки изображения' });
  }
});

/**
 * @swagger
 * /api/products/categories/{id}:
 *   put:
 *     summary: Обновить категорию
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               icon: { type: string }
 *               description: { type: string }
 *               sort_order: { type: integer }
 *               is_active: { type: boolean }
 *               image_url: { type: string }
 *     responses:
 *       200: { description: Успешно }
 *       500: { description: Ошибка сервера }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description, sort_order, is_active, image_url } = req.body;
    const db = await getDb();

    const cols = await db.all("PRAGMA table_info('product_categories')") as any[];
    const hasImageUrl = cols.some((c: any) => c.name === 'image_url');

    const setParts = ['name = ?', 'icon = ?', 'description = ?', 'sort_order = ?', 'is_active = ?'];
    const values: any[] = [name, icon, description, sort_order, is_active];
    if (hasImageUrl) {
      setParts.push('image_url = ?');
      values.push(image_url ?? null);
    }
    setParts.push("updated_at = datetime('now')");
    values.push(id);

    await db.run(
      `UPDATE product_categories SET ${setParts.join(', ')} WHERE id = ?`,
      values
    );

    invalidateCacheByPattern('product_categories');
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating product category', error);
    res.status(500).json({ error: 'Failed to update product category' });
  }
});

export default router;
