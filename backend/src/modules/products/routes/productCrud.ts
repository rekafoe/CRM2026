import { Router } from 'express';
import { getDb } from '../../../db';
import { asyncHandler } from '../../../middleware';
import { ProductServiceLinkService } from '../services/serviceLinkService';
import { logger } from '../../../utils/logger';
import { getTableColumns, hasColumn } from '../../../utils/tableSchemaCache';
import { invalidateCacheByPattern } from '../../../utils/dataCache';
import { uploadMemory, saveBufferToUploads } from '../../../config/upload';
import {
  toServiceLinkResponse,
  attachOperationsFromNorms,
  parseParameterOptions,
  loadPrintTechnologies,
  DEFAULT_COLOR_MODE_OPTIONS,
} from './helpers';

const router = Router();

/**
 * @swagger
 * /api/products/upload-image:
 *   post:
 *     summary: Загрузить изображение продукта
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
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Максимальный размер файла — 5 МБ' });
    }
    const saved = saveBufferToUploads(file.buffer, file.originalname);
    if (!saved) {
      return res.status(400).json({ error: 'Пустой файл' });
    }
    const imageUrl = `/api/uploads/${saved.filename}`;
    res.json({ image_url: imageUrl, filename: saved.filename, size: saved.size });
  } catch (error) {
    logger.error('Error uploading product image', error);
    res.status(500).json({ error: 'Ошибка загрузки изображения' });
  }
});

/**
 * @swagger
 * /api/products/{productId}:
 *   get:
 *     summary: Продукт по ID (с параметрами и услугами)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Детали продукта
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       404: { description: Продукт не найден }
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const db = await getDb();

    const product = await db.get(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.id = ?
    `, [productId]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const parameters = await db.all(`
      SELECT * FROM product_parameters WHERE product_id = ? ORDER BY sort_order
    `, [productId]);
    let postProcessingServices = (await ProductServiceLinkService.list(Number(productId))).map(toServiceLinkResponse);

    if (!postProcessingServices.length) {
      try {
        const legacyServices = await db.all(`
          SELECT pps.* FROM post_processing_services pps
          JOIN product_post_processing ppp ON pps.id = ppp.service_id
          WHERE ppp.product_id = ? AND pps.is_active = 1
          ORDER BY pps.name
        `, [productId]);
        postProcessingServices = legacyServices.map((svc: any) =>
          toServiceLinkResponse({
            id: svc.id,
            productId: Number(productId),
            serviceId: svc.id,
            isRequired: false,
            defaultQuantity: svc.min_quantity ?? null,
            service: {
              name: svc.name ?? '',
              type: svc.operation_type ?? 'generic',
              unit: svc.unit ?? svc.price_unit ?? '',
              rate: Number(svc.price ?? 0),
              isActive: svc.is_active !== undefined ? !!svc.is_active : true,
            },
          }),
        );
      } catch (legacyError: any) {
        if (legacyError?.code === 'SQLITE_ERROR') {
          postProcessingServices = [];
        } else {
          throw legacyError;
        }
      }
    }

    const printTechOptions = await loadPrintTechnologies(db);
    const parsedParameters = parameters.map((p: any) => {
      let parsedOptions = parseParameterOptions(p.options);
      if (p.type === 'select' && p.name === 'print_technology') {
        parsedOptions = printTechOptions || parsedOptions || [];
      }
      if (p.type === 'select' && p.name === 'print_color_mode') {
        parsedOptions = parsedOptions || DEFAULT_COLOR_MODE_OPTIONS;
      }
      return { ...p, options: parsedOptions };
    });

    res.json({
      ...product,
      parameters: parsedParameters,
      post_processing_services: postProcessingServices,
      quantity_discounts: [],
    });
  } catch (error) {
    logger.error('Error fetching product details', { error, stack: (error as Error).stack });
    res.status(500).json({ error: 'Failed to fetch product details', details: (error as Error).message });
  }
});

router.post('/setup', asyncHandler(async (req, res) => {
  const db = await getDb();
  const {
    product: productPayload,
    operations = [],
    autoOperationType,
    materials = [],
    parameters = [],
    template = {},
  } = req.body || {};

  if (!productPayload || !productPayload.name) {
    res.status(400).json({ error: 'Product payload with name is required' });
    return;
  }

  await db.exec('BEGIN TRANSACTION');
  try {
    const setupCols = ['category_id', 'name', 'description', 'icon', 'calculator_type', 'product_type'];
    const setupVals: any[] = [
      productPayload.category_id ?? null,
      productPayload.name,
      productPayload.description ?? null,
      productPayload.icon ?? null,
      productPayload.calculator_type ?? 'product',
      productPayload.product_type ?? null,
    ];
    if (await hasColumn('products', 'image_url')) {
      setupCols.push('image_url');
      setupVals.push(productPayload.image_url ?? null);
    }
    const productInsert = await db.run(
      `INSERT INTO products (${setupCols.join(', ')}) VALUES (${setupCols.map(() => '?').join(', ')})`,
      setupVals
    );

    const productId = productInsert.lastID as number;

    const cols = await getTableColumns('product_operations_link');
    const hasIsOptional = cols.has('is_optional');
    const hasLinkedParam = cols.has('linked_parameter_name');

    let sequenceCounter = 1;
    for (const op of Array.isArray(operations) ? operations : []) {
      if (!op || !op.operation_id) continue;
      const sequence = op.sequence ?? sequenceCounter;

      const insertFields = ['product_id', 'operation_id', 'sequence', 'sort_order', 'is_required', 'is_default', 'price_multiplier', 'default_params', 'conditions'];
      const insertValues: any[] = [
        productId, op.operation_id, sequence, sequence,
        op.is_required === false ? 0 : 1,
        op.is_default === false ? 0 : 1,
        op.price_multiplier ?? 1,
        op.default_params ? JSON.stringify(op.default_params) : null,
        op.conditions ? JSON.stringify(op.conditions) : null,
      ];

      if (hasIsOptional) { insertFields.push('is_optional'); insertValues.push(0); }
      if (hasLinkedParam) { insertFields.push('linked_parameter_name'); insertValues.push(null); }

      await db.run(
        `INSERT INTO product_operations_link (${insertFields.join(', ')})
         VALUES (${insertFields.map(() => '?').join(', ')})`,
        insertValues
      );
      sequenceCounter = Math.max(sequenceCounter, sequence + 1);
    }

    if (!operations.length && autoOperationType) {
      await attachOperationsFromNorms(db, productId, autoOperationType);
    }

    for (const [index, param] of (Array.isArray(parameters) ? parameters : []).entries()) {
      if (!param?.name || !param?.type) continue;
      const optionsValue = param.options === undefined || param.options === null
        ? null
        : typeof param.options === 'string' ? param.options : JSON.stringify(param.options);

      await db.run(
        `INSERT INTO product_parameters (
           product_id, name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, param.name, param.type, param.label ?? param.name, optionsValue,
         param.min_value ?? null, param.max_value ?? null, param.step ?? null,
         param.default_value ?? null, param.is_required ? 1 : 0, param.sort_order ?? index]
      );
    }

    const materialIncludeIds = Array.isArray(materials)
      ? materials.map((m: any) => m?.material_id || m?.id).filter((id: any) => Number.isFinite(Number(id))).map((id: any) => Number(id))
      : [];

    const configData = template.config_data ?? {
      trim_size: template.trim_size ?? {},
      finishing: template.finishing ?? [],
      packaging: template.packaging ?? [],
      print_run: { enabled: template.print_run?.enabled ?? false, min: template.print_run?.min ?? null, max: template.print_run?.max ?? null },
      price_rules: template.price_rules ?? [],
    };

    const printSheet = template.print_sheet ?? {};
    const constraints = template.constraints ?? {
      print_sheet: printSheet.preset ? printSheet.preset : printSheet.width || printSheet.height ? { width: printSheet.width, height: printSheet.height } : null,
      overrides: { include_ids: template.material_include_ids ?? template?.overrides?.includeIds ?? materialIncludeIds },
    };

    const normalizedConstraints = {
      ...constraints,
      overrides: { include_ids: (constraints?.overrides?.include_ids ?? materialIncludeIds) || [] },
    };

    await db.run(
      `INSERT INTO product_template_configs (product_id, name, config_data, constraints, is_active) VALUES (?, ?, ?, ?, 1)`,
      [productId, 'template', JSON.stringify(configData), JSON.stringify(normalizedConstraints)]
    );

    await db.exec('COMMIT');

    res.status(201).json({ success: true, data: { id: productId, name: productPayload.name } });
  } catch (error: any) {
    await db.exec('ROLLBACK');
    logger.error('Error in product setup', error);
    res.status(500).json({ error: error?.message || 'Failed to create product setup' });
  }
}));

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Создать продукт
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               category_id: { type: integer, description: "ID категории" }
 *               name: { type: string }
 *               description: { type: string }
 *               icon: { type: string }
 *               image_url: { type: string }
 *               calculator_type: { type: string, enum: [product, operation, simplified] }
 *               product_type: { type: string, enum: [sheet_single, sheet_item, multi_page, universal] }
 *               operator_percent: { type: number }
 *               auto_attach_operations: { type: boolean }
 *     responses:
 *       200: { description: Продукт создан }
 *       400: { description: Ошибка валидации }
 *       500: { description: Ошибка сервера }
 */
router.post('/', async (req, res) => {
  try {
    const { category_id, name, description, icon, calculator_type, product_type, operator_percent, image_url } = req.body;
    const resolvedCalculatorType = product_type === 'multi_page' ? 'simplified' : calculator_type;
    const db = await getDb();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Поле name обязательно' });
      return;
    }

    let resolvedCategoryId: number | null = typeof category_id === 'number' ? category_id : null;

    if (resolvedCategoryId !== null) {
      const exists = await db.get(`SELECT id FROM product_categories WHERE id = ?`, [resolvedCategoryId]);
      if (!exists) { res.status(400).json({ error: 'Категория не найдена' }); return; }
    } else {
      const first = await db.get<{ id: number }>(`SELECT id FROM product_categories ORDER BY sort_order, id LIMIT 1`);
      if (first?.id) {
        resolvedCategoryId = first.id;
      } else {
        const insert = await db.run(
          `INSERT INTO product_categories (name, icon, description, sort_order, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 0, 1, datetime('now'), datetime('now'))`,
          ['Без категории', '📦', 'Системная категория по умолчанию']
        );
        resolvedCategoryId = insert.lastID ?? null;
        invalidateCacheByPattern('product_categories');
      }
    }

    if (resolvedCategoryId === null) {
      res.status(500).json({ error: 'Не удалось определить категорию продукта' });
      return;
    }

    const normalizedOperatorPercent = Number.isFinite(Number(operator_percent)) ? Number(operator_percent) : 0;
    const hasOperatorPercentCol = await hasColumn('products', 'operator_percent');
    const hasImageUrlCol = await hasColumn('products', 'image_url');
    const insertColumns = ['category_id', 'name', 'description', 'icon', 'calculator_type', 'product_type'];
    const insertValues: any[] = [resolvedCategoryId, name.trim(), description ?? null, icon ?? null, resolvedCalculatorType || 'product', product_type || 'sheet_single'];

    if (hasImageUrlCol) {
      insertColumns.push('image_url');
      insertValues.push(image_url ?? null);
    }
    if (hasOperatorPercentCol) {
      insertColumns.push('operator_percent');
      insertValues.push(normalizedOperatorPercent);
    }

    const placeholders = insertColumns.map(() => '?').join(', ');
    const result = await db.run(`INSERT INTO products (${insertColumns.join(', ')}) VALUES (${placeholders})`, insertValues);

    if (product_type && req.body?.auto_attach_operations) {
      const operationsAdded = await attachOperationsFromNorms(db, result.lastID!, product_type);
      logger.info('Operations auto-attached', { productId: result.lastID, operationsAdded });
    }

    res.json({
      id: result.lastID,
      category_id: resolvedCategoryId,
      name: name.trim(),
      description, icon,
      calculator_type: resolvedCalculatorType || 'product',
      product_type: product_type || 'sheet_single',
      operator_percent: normalizedOperatorPercent,
    });
  } catch (error: any) {
    logger.error('Error creating product', { message: error?.message, code: error?.code, stack: error?.stack });
    res.status(500).json({ error: error?.message || 'Failed to create product' });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Обновить продукт
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
 *               category_id: { type: integer }
 *               name: { type: string }
 *               description: { type: string }
 *               icon: { type: string }
 *               image_url: { type: string }
 *               is_active: { type: boolean }
 *               product_type: { type: string }
 *               calculator_type: { type: string }
 *               print_settings: { type: object }
 *               operator_percent: { type: number }
 *     responses:
 *       200: { description: Успешно }
 *       400: { description: Нет полей для обновления }
 *       500: { description: Ошибка сервера }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates?.product_type === 'multi_page') updates.calculator_type = 'simplified';
    const db = await getDb();

    const hasOperatorPercentCol = await hasColumn('products', 'operator_percent');
    const hasImageUrlCol = await hasColumn('products', 'image_url');
    const allowedFields = [
      'category_id', 'name', 'description', 'icon', 'is_active',
      'product_type', 'calculator_type', 'setup_status', 'print_settings',
      ...(hasImageUrlCol ? ['image_url'] : []),
      ...(hasOperatorPercentCol ? ['operator_percent'] : []),
    ];
    const setFields: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setFields.push(`${field} = ?`);
        values.push(field === 'print_settings' && typeof updates[field] === 'object' ? JSON.stringify(updates[field]) : updates[field]);
      }
    }

    if (setFields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    setFields.push(`updated_at = datetime('now')`);
    values.push(id);

    await db.run(`UPDATE products SET ${setFields.join(', ')} WHERE id = ?`, values);
    logger.info('Product updated', { productId: id, fields: Object.keys(updates) });
    res.json({ success: true, updated: 1 });
  } catch (error) {
    logger.error('Error updating product', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Удалить продукт
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Продукт удалён }
 *       404: { description: Продукт не найден }
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const product = await db.get('SELECT id, name FROM products WHERE id = ?', [id]);
  if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

  await db.run('DELETE FROM product_materials WHERE product_id = ?', [id]);
  await db.run('DELETE FROM product_parameters WHERE product_id = ?', [id]);
  await db.run('DELETE FROM product_operations_link WHERE product_id = ?', [id]);
  await db.run('DELETE FROM product_template_configs WHERE product_id = ?', [id]);
  await db.run('DELETE FROM products WHERE id = ?', [id]);

  logger.info('Product deleted', { productId: id, productName: product.name });
  res.json({ success: true });
}));

export default router;
