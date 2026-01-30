import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { hasColumn } from '../utils/tableSchemaCache';

export interface EarningsSchedulerConfig {
  enabled: boolean;
  intervalMinutes: number;
}

type EarningsRow = {
  itemId: number;
  orderId: number;
  userId: number | null;
  price: number;
  quantity: number;
  params: string;
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
      logger.error('EarningsService initial recalculation failed', { error });
    });
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  static async recalculateForDate(date: string) {
    const db = await getDb();

    const rows = await db.all<EarningsRow[]>(
      `
      SELECT
        i.id as itemId,
        i.orderId as orderId,
        o.userId as userId,
        i.price as price,
        i.quantity as quantity,
        i.params as params
      FROM items i
      JOIN orders o ON o.id = i.orderId
      WHERE date(COALESCE(o.createdAt, o.created_at)) = date(?)
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
      const ids = Array.from(productIds);
      const placeholders = ids.map(() => '?').join(',');
      const productRows = await db.all<Array<{ id: number; operator_percent: number }>>(
        `SELECT id, operator_percent FROM products WHERE id IN (${placeholders})`,
        ids
      );
      productRows.forEach((row) => {
        productPercentMap.set(Number(row.id), Number(row.operator_percent) || 0);
      });
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
        if (!row.userId) continue;

        let params: any = {};
        try {
          params = JSON.parse(row.params || '{}');
        } catch {
          params = {};
        }

        const rawPercent =
          Number(params?.operator_percent ?? params?.operatorPercent ?? NaN);
        let percent = Number.isFinite(rawPercent) ? rawPercent : 0;

        if (percent === 0) {
          // Сначала проверяем операции (для послепечатных услуг)
          if (params?.services && Array.isArray(params.services) && params.services.length > 0) {
            const firstOpId = Number(params.services[0]?.operationId);
            if (Number.isFinite(firstOpId)) {
              percent = operationPercentMap.get(firstOpId) ?? 0;
            }
          }
          // Послепечатные услуги (отдельная позиция): postprintOperations[].serviceId или .id
          if (percent === 0 && params?.postprintOperations && Array.isArray(params.postprintOperations) && params.postprintOperations.length > 0) {
            for (const op of params.postprintOperations) {
              const sid = Number(op?.serviceId ?? op?.id);
              if (!Number.isFinite(sid)) continue;
              const p = operationPercentMap.get(sid) ?? 0;
              percent = p;
              if (p > 0) break;
            }
          }
          // Также проверяем прямой operationId
          if (percent === 0) {
            const opId = Number(params?.operationId);
            if (Number.isFinite(opId)) {
              percent = operationPercentMap.get(opId) ?? 0;
            }
          }
          // Если процент всё ещё 0, проверяем продукт
          if (percent === 0) {
            const productId = Number(params?.productId);
            if (Number.isFinite(productId)) {
              percent = productPercentMap.get(productId) ?? 0;
            }
          }
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
            row.userId,
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
