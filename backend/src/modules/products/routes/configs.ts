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

/** Синхронизирует операции из simplified.finishing в product_operations_link */
async function syncSimplifiedOperations(db: any, productId: number, configData: any): Promise<void> {
  if (!configData?.simplified?.sizes || !Array.isArray(configData.simplified.sizes)) {
    return;
  }

  try {
    const simplified = configData.simplified;
    const serviceIds = new Set<number>();
    simplified.sizes.forEach((size: any) => {
      if (Array.isArray(size.finishing)) {
        size.finishing.forEach((finish: any) => {
          if (finish.service_id && Number.isFinite(Number(finish.service_id))) {
            serviceIds.add(Number(finish.service_id));
          }
        });
      }
    });

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

router.get('/:productId/configs', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const db = await ensureProductTemplateConfigsTable();
  const rows = await db.all<TemplateConfigRow[]>(
    `SELECT * FROM product_template_configs WHERE product_id = ? ORDER BY id`,
    Number(productId)
  );
  res.json(rows.map(mapTemplateConfig));
}));

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
