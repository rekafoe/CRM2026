import { Router } from 'express';
import { getDb } from '../../../db';
import { asyncHandler } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { getTableColumns } from '../../../utils/tableSchemaCache';
import {
  TemplateConfigRow,
  mapTemplateConfig,
  normalizeConfigDataForPersistence,
  ensureProductTemplateConfigsTable,
} from './helpers';

const router = Router();

/** Собирает service_id из finishing размеров (экспорт для использования в schema) */
export function collectServiceIdsFromSizes(sizes: any[]): Set<number> {
  const serviceIds = new Set<number>();
  if (!Array.isArray(sizes)) return serviceIds;
  sizes.forEach((size: any) => {
    if (Array.isArray(size.finishing)) {
      size.finishing.forEach((finish: any) => {
        if (finish.service_id && Number.isFinite(Number(finish.service_id))) {
          serviceIds.add(Number(finish.service_id));
        }
      });
    }
  });
  return serviceIds;
}

/** Синхронизирует операции из simplified (sizes и typeConfigs) в product_operations_link */
export async function syncSimplifiedOperations(db: any, productId: number, configData: any): Promise<void> {
  const simplified = configData?.simplified;
  if (!simplified || typeof simplified !== 'object') {
    return;
  }

  try {
    const serviceIds = new Set<number>();
    // Корневые sizes (legacy / без типов)
    const rootIds = collectServiceIdsFromSizes(simplified.sizes);
    rootIds.forEach((id) => serviceIds.add(id));
    // typeConfigs[typeId].sizes — для продуктов с подтипами (открытки со сложением и т.д.)
    if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
      for (const cfg of Object.values(simplified.typeConfigs) as any[]) {
        const typeIds = collectServiceIdsFromSizes(cfg?.sizes);
        typeIds.forEach((id) => serviceIds.add(id));
      }
    }

    const serviceIdList = Array.from(serviceIds);
    logger.info('[syncSimplifiedOperations] Синхронизация операций', { productId, serviceIdsCount: serviceIds.size });

    const existingLinks = await db.all(
      `SELECT id, operation_id FROM product_operations_link WHERE product_id = ?`,
      [productId]
    );
    const existingOperationIds = new Set(existingLinks.map((link: any) => Number(link.operation_id)));

    const cols = await getTableColumns('product_operations_link');
    const hasIsOptional = cols.has('is_optional');
    const hasLinkedParam = cols.has('linked_parameter_name');

    const activeServices = serviceIdList.length > 0
      ? await db.all(
          `SELECT id, name FROM post_processing_services WHERE id IN (${serviceIdList.map(() => '?').join(', ')}) AND is_active = 1`,
          serviceIdList
        )
      : [];
    const activeServiceMap = new Map<number, { id: number; name: string }>(
      activeServices.map((svc: any) => [Number(svc.id), { id: Number(svc.id), name: svc.name }])
    );

    let sequence = 1;
    let insertedCount = 0;
    let skippedInactiveCount = 0;
    for (const serviceId of serviceIdList) {
      if (!existingOperationIds.has(serviceId)) {
        const service = activeServiceMap.get(serviceId);
        if (service) {
          const insertFields = ['product_id', 'operation_id', 'sequence', 'sort_order', 'is_required', 'is_default', 'price_multiplier'];
          const insertValues: any[] = [productId, serviceId, sequence++, sequence - 1, 0, 0, 1.0];

          if (hasIsOptional) { insertFields.push('is_optional'); insertValues.push(1); }
          if (hasLinkedParam) { insertFields.push('linked_parameter_name'); insertValues.push(null); }

          await db.run(
            `INSERT INTO product_operations_link (${insertFields.join(', ')})
             VALUES (${insertFields.map(() => '?').join(', ')})`,
            insertValues
          );
          insertedCount += 1;
        } else {
          skippedInactiveCount += 1;
        }
      }
    }

    const linksToDelete = existingLinks.filter((link: any) => !serviceIds.has(Number(link.operation_id)));
    if (linksToDelete.length > 0) {
      const deleteIds = linksToDelete.map((link: any) => link.id);
      const chunkSize = 200;
      for (let i = 0; i < deleteIds.length; i += chunkSize) {
        const chunk = deleteIds.slice(i, i + chunkSize);
        await db.run(
          `DELETE FROM product_operations_link WHERE product_id = ? AND id IN (${chunk.map(() => '?').join(', ')})`,
          [productId, ...chunk]
        );
      }
    }

    logger.info('[syncSimplifiedOperations] Завершено', {
      productId, insertedCount, deletedCount: linksToDelete.length, skippedInactiveCount
    });
  } catch (error) {
    logger.warn('[syncSimplifiedOperations] Ошибка', { productId, error: (error as Error).message });
    throw error;
  }
}

/**
 * @swagger
 * /api/products/{productId}/configs:
 *   get:
 *     summary: Список конфигураций шаблона продукта
 *     description: Конфигурации содержат config_data (в т.ч. simplified с types, typeConfigs, sizes)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Массив конфигураций
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   product_id: { type: integer }
 *                   name: { type: string }
 *                   config_data: { type: object }
 *                   constraints: { type: object }
 *                   is_active: { type: boolean }
 */
router.get('/:productId/configs', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const db = await ensureProductTemplateConfigsTable();
  const rows = await db.all<TemplateConfigRow[]>(
    `SELECT * FROM product_template_configs WHERE product_id = ? ORDER BY id`,
    Number(productId)
  );
  res.json(rows.map(mapTemplateConfig));
}));

/**
 * @swagger
 * /api/products/{productId}/configs:
 *   post:
 *     summary: Создать конфигурацию шаблона (подтипы, схемы)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, default: template }
 *               config_data:
 *                 type: object
 *                 description: "trim_size, simplified (sizes, types, typeConfigs)"
 *               constraints: { type: object }
 *               is_active: { type: boolean }
 *     responses:
 *       201: { description: Конфигурация создана }
 */
router.post('/:productId/configs', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { name, config_data, constraints, is_active } = req.body || {};
  const normalizedConfigData = normalizeConfigDataForPersistence(config_data);
  const db = await ensureProductTemplateConfigsTable();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO product_template_configs (product_id, name, config_data, constraints, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    Number(productId),
    name || 'template',
    normalizedConfigData ? JSON.stringify(normalizedConfigData) : null,
    constraints ? JSON.stringify(constraints) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : 1,
    now, now
  );
  const created = await db.get<TemplateConfigRow>(
    `SELECT * FROM product_template_configs WHERE id = ?`,
    result.lastID
  );

  if (normalizedConfigData?.simplified) {
    try {
      await syncSimplifiedOperations(db, Number(productId), normalizedConfigData);
    } catch (error) {
      logger.warn('[POST configs] Ошибка синхронизации операций', { productId, error: (error as Error).message });
    }
  }

  res.status(201).json(created ? mapTemplateConfig(created) : null);
}));

/**
 * @swagger
 * /api/products/{productId}/configs/{configId}:
 *   put:
 *     summary: Обновить конфигурацию шаблона
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: configId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               config_data: { type: object }
 *               constraints: { type: object }
 *               is_active: { type: boolean }
 *     responses:
 *       200: { description: Конфигурация обновлена }
 *       404: { description: Конфигурация не найдена }
 */
router.put('/:productId/configs/:configId', asyncHandler(async (req, res) => {
  const { productId, configId } = req.params;
  const { name, config_data, constraints, is_active } = req.body || {};
  const normalizedConfigData = normalizeConfigDataForPersistence(config_data);
  const db = await ensureProductTemplateConfigsTable();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE product_template_configs
     SET name = COALESCE(?, name),
         config_data = COALESCE(?, config_data),
         constraints = COALESCE(?, constraints),
         is_active = COALESCE(?, is_active),
         updated_at = ?
     WHERE id = ? AND product_id = ?`,
    name ?? null,
    normalizedConfigData !== undefined ? JSON.stringify(normalizedConfigData) : null,
    constraints !== undefined ? JSON.stringify(constraints) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    now,
    Number(configId), Number(productId)
  );
  const updated = await db.get<TemplateConfigRow>(
    `SELECT * FROM product_template_configs WHERE id = ? AND product_id = ?`,
    Number(configId), Number(productId)
  );
  if (!updated) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }

  if (normalizedConfigData?.simplified) {
    try {
      await syncSimplifiedOperations(db, Number(productId), normalizedConfigData);
    } catch (error) {
      logger.warn('[PUT configs] Ошибка синхронизации операций', { productId, error: (error as Error).message });
    }
  }

  res.json(mapTemplateConfig(updated));
}));

/**
 * @swagger
 * /api/products/{productId}/configs/{configId}:
 *   delete:
 *     summary: Удалить конфигурацию шаблона
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: configId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Конфигурация удалена }
 *       404: { description: Конфигурация не найдена }
 */
router.delete('/:productId/configs/:configId', asyncHandler(async (req, res) => {
  const { productId, configId } = req.params;
  const db = await ensureProductTemplateConfigsTable();
  const result = await db.run(
    `DELETE FROM product_template_configs WHERE id = ? AND product_id = ?`,
    Number(configId), Number(productId)
  );
  if ((result?.changes || 0) === 0) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }
  res.json({ success: true });
}));

export default router;
