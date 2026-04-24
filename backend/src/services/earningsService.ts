import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { hasColumn } from '../utils/tableSchemaCache';
import { effectiveEarningsUserId, type EarningsOrderItemRow } from './earningsEffectiveUserId';

export interface EarningsSchedulerConfig {
  enabled: boolean;
  intervalMinutes: number;
}

type EarningsRow = EarningsOrderItemRow & {
  itemId: number;
  orderId: number;
  price: number;
  quantity: number;
  params: string;
  /** `items.type` — часто id продукта (сайт / Mini App), пока `params.productId` пуст */
  itemType: string | null;
};

export class EarningsService {
  private static config: EarningsSchedulerConfig = {
    enabled: true,
    intervalMinutes: 60,
  };

  private static interval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  static initialize(config?: Partial<EarningsSchedulerConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    logger.info('EarningsService initialized', this.config);

    if (this.config.enabled) {
      this.start();
    }
  }

  static start() {
    if (this.isRunning) {
      logger.warn('EarningsService already running');
      return;
    }
    this.isRunning = true;
    this.interval = setInterval(async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await this.recalculateForDate(today);
      } catch (error) {
        logger.error('EarningsService periodic recalculation failed', { error });
      }
    }, this.config.intervalMinutes * 60 * 1000);

    const today = new Date().toISOString().slice(0, 10);
    this.recalculateForDate(today).catch((error) => {
      logger.error('EarningsService initial recalculation failed', {
        error,
        message: (error as Error)?.message,
        code: (error as { code?: string })?.code,
      });
    });
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  /** Пересчитать order_item_earnings за дни, затронутые заказом (смена created_at, ответственного и т.д.). */
  static async recalculateEarningsForOrderDays(options: { orderId: number; orderCreatedDateBeforeUpdate?: string | null }): Promise<void> {
    const db = await getDb();
    const [earningsExists, ordersExists] = await Promise.all([
      db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_item_earnings'`),
      db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`),
    ]);
    if (!earningsExists || !ordersExists) return;
    const after = await db.get<{ d: string }>(
      `SELECT date(COALESCE(createdAt, created_at)) as d FROM orders WHERE id = ?`,
      [options.orderId]
    );
    const afterDay = after?.d ? String(after.d).slice(0, 10) : null;
    const set = new Set<string>();
    const before = options.orderCreatedDateBeforeUpdate != null
      ? String(options.orderCreatedDateBeforeUpdate).slice(0, 10)
      : null;
    if (before) set.add(before);
    if (afterDay) set.add(afterDay);
    for (const d of set) {
      if (d) await this.recalculateForDate(d);
    }
  }

  static async recalculateForDate(date: string) {
    const db = await getDb();

    const [earningsExists, itemsExists, ordersExists] = await Promise.all([
      db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_item_earnings'`),
      db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='items'`),
      db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`),
    ]);
    if (!earningsExists || !itemsExists || !ordersExists) {
      logger.warn('EarningsService: required tables missing, skipping recalculation', {
        order_item_earnings: !!earningsExists,
        items: !!itemsExists,
        orders: !!ordersExists,
      });
      return;
    }

    try {
      await this.doRecalculateForDate(db, date);
    } catch (error) {
      logger.error('EarningsService recalculateForDate failed', {
        date,
        message: (error as Error)?.message,
        code: (error as { code?: string })?.code,
      });
      throw error;
    }
  }

  private static async doRecalculateForDate(db: Awaited<ReturnType<typeof getDb>>, date: string) {
    let hasExecutorUserId = false;
    let hasResponsibleUserId = false;
    let hasIsInternal = false;
    let hasPaymentChannel = false;
    let hasIsCancelled = false;
    let hasOrderSource = false;
    try {
      hasExecutorUserId = await hasColumn('items', 'executor_user_id');
      hasResponsibleUserId = await hasColumn('orders', 'responsible_user_id');
      hasIsInternal = await hasColumn('orders', 'is_internal');
      hasPaymentChannel = await hasColumn('orders', 'payment_channel');
      hasIsCancelled = await hasColumn('orders', 'is_cancelled');
      hasOrderSource = await hasColumn('orders', 'source');
    } catch { /* ignore */ }

    const executorSel = hasExecutorUserId ? 'i.executor_user_id as executorUserId' : 'NULL as executorUserId';
    const responsibleSel = hasResponsibleUserId ? 'o.responsible_user_id as responsibleUserId' : 'NULL as responsibleUserId';
    const sourceSel = hasOrderSource ? "COALESCE(o.source, '') as orderSource" : "'' as orderSource";
    const excludeInternal = hasIsInternal
      ? 'AND COALESCE(o.is_internal, 0) = 0'
      : hasPaymentChannel
        ? "AND COALESCE(o.payment_channel, 'cash') != 'internal'"
        : '';
    /** Раньше: status != 1 — в актуальном справочнике id=1 часто «Оформлен», заказы с TG/оплатой попадали сюда и выпадали из ЗП целиком. */
    const excludeCancelled = hasIsCancelled ? 'AND COALESCE(o.is_cancelled, 0) = 0' : '';

    const rows = await db.all<EarningsRow[]>(
      `
      SELECT
        i.id as itemId,
        i.orderId as orderId,
        o.userId as userId,
        ${executorSel},
        ${responsibleSel},
        ${sourceSel},
        i.price as price,
        i.quantity as quantity,
        i.params as params,
        i.type as itemType
      FROM items i
      JOIN orders o ON o.id = i.orderId
      WHERE date(COALESCE(o.createdAt, o.created_at)) = date(?)
        ${excludeCancelled}
        ${excludeInternal}
      `,
      [date]
    );

    if (!rows || rows.length === 0) {
      await db.run('DELETE FROM order_item_earnings WHERE earned_date = ?', [date]);
      return;
    }

    const productIds = new Set<number>();
    const operationIds = new Set<number>();
    
    rows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.params || '{}');
        const productId = Number(parsed?.productId);
        if (Number.isFinite(productId)) {
          productIds.add(productId);
        } else if (row.itemType != null && String(row.itemType).trim() !== '') {
          const fromType = Number(String(row.itemType).trim());
          if (Number.isFinite(fromType) && fromType > 0) {
            productIds.add(fromType);
          }
        }
        // Проверяем операции в params
        if (parsed?.services && Array.isArray(parsed.services)) {
          parsed.services.forEach((service: any) => {
            const opId = Number(service?.operationId);
            if (Number.isFinite(opId)) {
              operationIds.add(opId);
            }
          });
        }
        // Послепечатные услуги (отдельная позиция): postprintOperations[].serviceId
        if (parsed?.postprintOperations && Array.isArray(parsed.postprintOperations)) {
          parsed.postprintOperations.forEach((op: any) => {
            const sid = Number(op?.serviceId);
            if (Number.isFinite(sid)) {
              operationIds.add(sid);
            }
          });
        }
        // Также проверяем прямой operationId (для послепечатных услуг)
        const opId = Number(parsed?.operationId);
        if (Number.isFinite(opId)) {
          operationIds.add(opId);
        }
      } catch {
        // ignore invalid json
      }
    });

    const productPercentMap = new Map<number, number>();
    if (productIds.size > 0) {
      let hasProductOperatorPercent = true;
      try {
        hasProductOperatorPercent = await hasColumn('products', 'operator_percent');
      } catch { /* ignore */ }
      if (hasProductOperatorPercent) {
        const ids = Array.from(productIds);
        const placeholders = ids.map(() => '?').join(',');
        const productRows = await db.all<Array<{ id: number; operator_percent?: number | null }>>(
          `SELECT id, operator_percent FROM products WHERE id IN (${placeholders})`,
          ids
        );
        productRows.forEach((row) => {
          productPercentMap.set(Number(row.id), (row.operator_percent != null && Number.isFinite(Number(row.operator_percent)) ? Number(row.operator_percent) : 0));
        });
      }
    }
    // Получаем проценты из операций (всегда подтягиваем operator_percent из БД)
    const operationPercentMap = new Map<number, number>();
    if (operationIds.size > 0) {
      const ids = Array.from(operationIds);
      const placeholders = ids.map(() => '?').join(',');
      try {
        const operationRows = await db.all<Array<{ id: number; operator_percent?: number | null }>>(
          `SELECT id, operator_percent FROM post_processing_services WHERE id IN (${placeholders})`,
          ids
        );
        operationRows.forEach((row) => {
          const pct = row.operator_percent != null && Number.isFinite(Number(row.operator_percent))
            ? Number(row.operator_percent)
            : 0;
          operationPercentMap.set(Number(row.id), pct);
        });
      } catch (err) {
        const hasOperatorPercent = await hasColumn('post_processing_services', 'operator_percent');
        if (hasOperatorPercent) throw err;
      }
    }

    await db.run('BEGIN');
    try {
      await db.run('DELETE FROM order_item_earnings WHERE earned_date = ?', [date]);

      for (const row of rows) {
        const effectiveUserId = effectiveEarningsUserId(row);
        if (effectiveUserId == null || !Number.isFinite(effectiveUserId)) continue;

        let params: any = {};
        try {
          params = JSON.parse(row.params || '{}');
        } catch {
          params = {};
        }

        // Всегда подтягиваем актуальные проценты из БД; params — только fallback
        let percent = 0;
        // 1. Операции (params.services)
        if (params?.services && Array.isArray(params.services) && params.services.length > 0) {
          const firstOpId = Number(params.services[0]?.operationId);
          if (Number.isFinite(firstOpId)) {
            percent = operationPercentMap.get(firstOpId) ?? 0;
          }
        }
        // 2. Послепечатные услуги (postprintOperations)
        if (percent === 0 && params?.postprintOperations && Array.isArray(params.postprintOperations) && params.postprintOperations.length > 0) {
          for (const op of params.postprintOperations) {
            const sid = Number(op?.serviceId ?? op?.id);
            if (!Number.isFinite(sid)) continue;
            const p = operationPercentMap.get(sid) ?? 0;
            percent = p;
            if (p > 0) break;
          }
        }
        // 3. Прямой operationId
        if (percent === 0) {
          const opId = Number(params?.operationId);
          if (Number.isFinite(opId)) {
            percent = operationPercentMap.get(opId) ?? 0;
          }
        }
        // 4. Продукт (params.productId или type позиции = id продукта с витрины / MAP)
        if (percent === 0) {
          let productId = Number(params?.productId);
          if (!Number.isFinite(productId) && row.itemType != null) {
            const fromType = Number(String(row.itemType).trim());
            if (Number.isFinite(fromType) && fromType > 0) productId = fromType;
          }
          if (Number.isFinite(productId)) {
            percent = productPercentMap.get(productId) ?? 0;
          }
        }
        // 5. Fallback: сохранённый в params (устаревший, но лучше чем 0)
        if (percent === 0) {
          const rawPercent = Number(params?.operator_percent ?? params?.operatorPercent ?? NaN);
          if (Number.isFinite(rawPercent)) percent = rawPercent;
        }

        const itemTotal = (Number(row.price) || 0) * (Number(row.quantity) || 0);
        const amount = (itemTotal * percent) / 100;

        await db.run(
          `
          INSERT OR REPLACE INTO order_item_earnings
          (order_id, order_item_id, user_id, order_item_total, percent, amount, earned_date, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `,
          [
            row.orderId,
            row.itemId,
            effectiveUserId,
            itemTotal,
            percent,
            amount,
            date,
          ]
        );
      }

      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }
}
