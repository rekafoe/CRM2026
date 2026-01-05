import { getDb, withTransaction } from '../../../db';
import { logger } from '../../../utils/logger';

/**
 * Единая точка для всех транзакций со складом
 * Заменяет дублирование UPDATE materials и INSERT material_moves
 */
export class MaterialTransactionService {
  /**
   * Списание материала со склада
   */
  static async spend(params: {
    materialId: number;
    quantity: number;
    reason: string;
    orderId?: number;
    userId?: number;
    checkMinQuantity?: boolean;
  }): Promise<{ oldQuantity: number; newQuantity: number }> {
    const { materialId, quantity, reason, orderId, userId, checkMinQuantity = false } = params;

    return await withTransaction(async (db) => {
      // Получаем текущее состояние материала
      const material = await db.get<{ 
        id: number; 
        name: string; 
        quantity: number; 
        min_quantity: number | null 
      }>(
        'SELECT id, name, quantity, min_quantity FROM materials WHERE id = ?',
        materialId
      );

      if (!material) {
        throw new Error(`Материал с ID ${materialId} не найден`);
      }

      const roundedQty = Math.ceil(Number(quantity));
      const oldQuantity = Number(material.quantity);
      const newQuantity = oldQuantity - roundedQty;

      // Проверка достаточности
      if (newQuantity < 0) {
        throw new Error(
          `Недостаточно материала "${material.name}". Доступно: ${oldQuantity}, требуется: ${roundedQty}`
        );
      }

      // Проверка минимального остатка (опционально)
      if (checkMinQuantity && material.min_quantity != null) {
        if (newQuantity < material.min_quantity) {
          logger.warn('Списание ниже минимального остатка', {
            materialId,
            materialName: material.name,
            newQuantity,
            minQuantity: material.min_quantity
          });
        }
      }

      // Атомарное обновление количества
      await db.run(
        'UPDATE materials SET quantity = ? WHERE id = ?',
        newQuantity,
        materialId
      );

      // Запись движения
      const delta = -roundedQty;
      await db.run(
        `INSERT INTO material_moves (
          material_id,
          type,
          quantity,
          delta,
          reason,
          order_id,
          user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        materialId,
        'spend',
        roundedQty,
        delta,
        reason,
        orderId ?? null,
        userId ?? null
      );

      logger.info('Материал списан', {
        materialId,
        materialName: material.name,
        quantity: roundedQty,
        oldQuantity,
        newQuantity,
        reason
      });

      return { oldQuantity, newQuantity };
    });
  }

  /**
   * Поступление материала на склад
   */
  static async add(params: {
    materialId: number;
    quantity: number;
    reason: string;
    orderId?: number;
    userId?: number;
    supplierId?: number;
    deliveryNumber?: string;
    invoiceNumber?: string;
    deliveryDate?: string;
    deliveryNotes?: string;
  }): Promise<{ oldQuantity: number; newQuantity: number }> {
    const {
      materialId,
      quantity,
      reason,
      orderId,
      userId,
      supplierId,
      deliveryNumber,
      invoiceNumber,
      deliveryDate,
      deliveryNotes
    } = params;

    return await withTransaction(async (db) => {
      // Получаем текущее состояние
      const material = await db.get<{ id: number; name: string; quantity: number }>(
        'SELECT id, name, quantity FROM materials WHERE id = ?',
        materialId
      );

      if (!material) {
        throw new Error(`Материал с ID ${materialId} не найден`);
      }

      const roundedQty = Math.ceil(Number(quantity));
      const oldQuantity = Number(material.quantity);
      const newQuantity = oldQuantity + roundedQty;

      // Обновление количества
      await db.run(
        'UPDATE materials SET quantity = ? WHERE id = ?',
        newQuantity,
        materialId
      );

      // Запись движения с расширенными полями для поставок
      await db.run(
        `INSERT INTO material_moves (
          material_id,
          type,
          quantity,
          delta,
          reason,
          order_id,
          user_id,
          supplier_id,
          delivery_number,
          invoice_number,
          delivery_date,
          delivery_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        materialId,
        'add',
        roundedQty,
        roundedQty,
        reason,
        orderId ?? null,
        userId ?? null,
        supplierId ?? null,
        deliveryNumber ?? null,
        invoiceNumber ?? null,
        deliveryDate ?? null,
        deliveryNotes ?? null
      );

      logger.info('Материал добавлен', {
        materialId,
        materialName: material.name,
        quantity: roundedQty,
        oldQuantity,
        newQuantity,
        reason
      });

      return { oldQuantity, newQuantity };
    });
  }

  /**
   * Возврат материала на склад (отмена списания)
   */
  static async return(params: {
    materialId: number;
    quantity: number;
    reason: string;
    orderId?: number;
    userId?: number;
  }): Promise<{ oldQuantity: number; newQuantity: number }> {
    // Возврат = добавление с особым reason
    return this.add({
      ...params,
      reason: params.reason || 'Возврат материала'
    });
  }

  /**
   * Прямая установка количества (инвентаризация)
   */
  static async adjust(params: {
    materialId: number;
    newQuantity: number;
    reason: string;
    userId?: number;
  }): Promise<{ oldQuantity: number; newQuantity: number; delta: number }> {
    const db = await getDb();
    const { materialId, newQuantity, reason, userId } = params;

    const material = await db.get<{ id: number; name: string; quantity: number }>(
      'SELECT id, name, quantity FROM materials WHERE id = ?',
      materialId
    );

    if (!material) {
      throw new Error(`Материал с ID ${materialId} не найден`);
    }

    const oldQuantity = Number(material.quantity);
    const roundedNewQty = Math.ceil(Number(newQuantity));
    const delta = roundedNewQty - oldQuantity;

    await db.run(
      'UPDATE materials SET quantity = ? WHERE id = ?',
      roundedNewQty,
      materialId
    );

    await db.run(
      `INSERT INTO material_moves (
        material_id,
        type,
        quantity,
        delta,
        reason,
        order_id,
        user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      materialId,
      delta >= 0 ? 'adjust_increase' : 'adjust_decrease',
      Math.abs(delta),
      delta,
      reason,
      null,
      userId ?? null
    );

    logger.info('Количество материала скорректировано', {
      materialId,
      materialName: material.name,
      oldQuantity,
      newQuantity: roundedNewQty,
      delta,
      reason
    });

    return { oldQuantity, newQuantity: roundedNewQty, delta };
  }

  /**
   * Проверка доступности материала с учётом резервов
   */
  static async checkAvailability(materialId: number, requiredQuantity: number): Promise<{
    available: boolean;
    currentQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    materialName: string;
  }> {
    const db = await getDb();

    const material = await db.get<{ name: string; quantity: number }>(
      'SELECT name, quantity FROM materials WHERE id = ?',
      materialId
    );

    if (!material) {
      throw new Error(`Материал с ID ${materialId} не найден`);
    }

    // Считаем активные резервы
    const reservedResult = await db.get<{ reserved: number }>(
      `SELECT COALESCE(SUM(quantity_reserved), 0) as reserved
       FROM material_reservations
       WHERE material_id = ? AND status = 'active' AND expires_at > datetime('now')`,
      materialId
    );

    const currentQuantity = Number(material.quantity);
    const reservedQuantity = Number(reservedResult?.reserved || 0);
    const availableQuantity = currentQuantity - reservedQuantity;
    const roundedRequired = Math.ceil(Number(requiredQuantity));

    return {
      available: availableQuantity >= roundedRequired,
      currentQuantity,
      reservedQuantity,
      availableQuantity,
      materialName: material.name
    };
  }

  /**
   * Массовое списание материалов (транзакция)
   */
  static async bulkSpend(
    items: Array<{
      materialId: number;
      quantity: number;
      reason: string;
    }>,
    orderId?: number,
    userId?: number
  ): Promise<Array<{ materialId: number; oldQuantity: number; newQuantity: number }>> {
    const db = await getDb();
    const results: Array<{ materialId: number; oldQuantity: number; newQuantity: number }> = [];

    await db.run('BEGIN');
    try {
      for (const item of items) {
        const result = await this.spend({
          materialId: item.materialId,
          quantity: item.quantity,
          reason: item.reason,
          orderId,
          userId
        });
        results.push({ materialId: item.materialId, ...result });
      }
      await db.run('COMMIT');
      return results;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Массовое добавление материалов (транзакция)
   */
  static async bulkAdd(
    items: Array<{
      materialId: number;
      quantity: number;
      reason: string;
    }>,
    userId?: number
  ): Promise<Array<{ materialId: number; oldQuantity: number; newQuantity: number }>> {
    const db = await getDb();
    const results: Array<{ materialId: number; oldQuantity: number; newQuantity: number }> = [];

    await db.run('BEGIN');
    try {
      for (const item of items) {
        const result = await this.add({
          materialId: item.materialId,
          quantity: item.quantity,
          reason: item.reason,
          userId
        });
        results.push({ materialId: item.materialId, ...result });
      }
      await db.run('COMMIT');
      return results;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }
}

