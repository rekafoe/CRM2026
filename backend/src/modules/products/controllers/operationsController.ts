/**
 * Контроллер для управления операциями (печать, резка, ламинация и т.п.)
 */

import { Request, Response } from 'express';
import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';

export class OperationsController {
  /**
   * Получить все операции
   * GET /api/operations
   */
  static async getAllOperations(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { operation_type, is_active } = req.query;

      let query = 'SELECT * FROM post_processing_services WHERE 1=1';
      const params: any[] = [];

      if (operation_type) {
        query += ' AND operation_type = ?';
        params.push(operation_type);
      }

      if (is_active !== undefined) {
        query += ' AND is_active = ?';
        params.push(is_active === 'true' ? 1 : 0);
      }

      query += ' ORDER BY operation_type, name';

      const operations = await db.all(query, params);

      // Парсим JSON поля
      const parsedOperations = operations.map((op: any) => ({
        ...op,
        parameters: op.parameters ? JSON.parse(op.parameters) : null
      }));

      res.json({
        success: true,
        data: parsedOperations,
        count: parsedOperations.length
      });
    } catch (error) {
      logger.error('Ошибка получения операций', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch operations'
      });
    }
  }

  /**
   * Получить одну операцию
   * GET /api/operations/:id
   */
  static async getOperationById(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { id } = req.params;

      const operation: any = await db.get(
        'SELECT * FROM post_processing_services WHERE id = ?',
        [id]
      );

      if (!operation) {
        res.status(404).json({
          success: false,
          error: 'Operation not found'
        });
        return;
      }

      // Парсим JSON поля
      operation.parameters = operation.parameters ? JSON.parse(operation.parameters) : null;

      res.json({
        success: true,
        data: operation
      });
    } catch (error) {
      logger.error('Ошибка получения операции', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch operation'
      });
    }
  }

  /**
   * Создать операцию
   * POST /api/operations
   */
  static async createOperation(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const {
        name,
        description,
        price,
        unit,
        operation_type,
        price_unit,
        setup_cost,
        min_quantity,
        parameters,
        is_active
      } = req.body;

      // Валидация
      if (!name || !price || !operation_type || !price_unit) {
        res.status(400).json({
          success: false,
          error: 'Required fields: name, price, operation_type, price_unit'
        });
        return;
      }

      const parametersJson = parameters ? JSON.stringify(parameters) : null;

      const result = await db.run(`
        INSERT INTO post_processing_services (
          name, description, price, unit, 
          operation_type, price_unit, setup_cost, min_quantity, parameters, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name,
        description || null,
        price,
        unit || 'шт',
        operation_type,
        price_unit,
        setup_cost || 0,
        min_quantity || 1,
        parametersJson,
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      ]);

      logger.info('Операция создана', { operationId: result.lastID, name });

      res.status(201).json({
        success: true,
        data: {
          id: result.lastID,
          ...req.body
        }
      });
    } catch (error) {
      logger.error('Ошибка создания операции', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create operation'
      });
    }
  }

  /**
   * Обновить операцию
   * PUT /api/operations/:id
   */
  static async updateOperation(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { id } = req.params;
      const {
        name,
        description,
        price,
        unit,
        operation_type,
        price_unit,
        setup_cost,
        min_quantity,
        parameters,
        is_active
      } = req.body;

      const operation = await db.get('SELECT * FROM post_processing_services WHERE id = ?', [id]);
      if (!operation) {
        res.status(404).json({
          success: false,
          error: 'Operation not found'
        });
        return;
      }

      const parametersJson = parameters ? JSON.stringify(parameters) : null;

      await db.run(`
        UPDATE post_processing_services SET
          name = ?,
          description = ?,
          price = ?,
          unit = ?,
          operation_type = ?,
          price_unit = ?,
          setup_cost = ?,
          min_quantity = ?,
          parameters = ?,
          is_active = ?
        WHERE id = ?
      `, [
        name !== undefined ? name : operation.name,
        description !== undefined ? description : operation.description,
        price !== undefined ? price : operation.price,
        unit !== undefined ? unit : operation.unit,
        operation_type !== undefined ? operation_type : operation.operation_type,
        price_unit !== undefined ? price_unit : operation.price_unit,
        setup_cost !== undefined ? setup_cost : operation.setup_cost,
        min_quantity !== undefined ? min_quantity : operation.min_quantity,
        parametersJson !== undefined ? parametersJson : operation.parameters,
        is_active !== undefined ? (is_active ? 1 : 0) : operation.is_active,
        id
      ]);

      logger.info('Операция обновлена', { operationId: id, name: name || operation.name });

      res.json({
        success: true,
        data: { id, ...req.body }
      });
    } catch (error) {
      logger.error('Ошибка обновления операции', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update operation'
      });
    }
  }

  /**
   * Обновить связь операции с продуктом
   * PUT /api/products/:productId/operations/:linkId
   */
  static async updateProductOperation(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { productId, linkId } = req.params;
      const { is_required, conditions, linked_parameter_name } = req.body;

      // Проверяем существование связи
      const link = await db.get(
        'SELECT * FROM product_operations_link WHERE id = ? AND product_id = ?',
        [linkId, productId]
      );

      if (!link) {
        res.status(404).json({
          success: false,
          error: 'Operation link not found'
        });
        return;
      }

      // Проверяем структуру таблицы
      const columns: any[] = await db.all('PRAGMA table_info(product_operations_link)');
      const hasLinkedParam = columns.some((c: any) => c.name === 'linked_parameter_name');
      const hasConditions = columns.some((c: any) => c.name === 'conditions');
      const hasUpdatedAt = columns.some((c: any) => c.name === 'updated_at');

      // Подготавливаем данные для обновления
      const updates: string[] = [];
      const values: any[] = [];

      if (is_required !== undefined) {
        updates.push('is_required = ?');
        values.push(is_required ? 1 : 0);
      }

      if (hasConditions && conditions !== undefined) {
        updates.push('conditions = ?');
        values.push(conditions ? JSON.stringify(conditions) : null);
      }

      if (hasLinkedParam && linked_parameter_name !== undefined) {
        updates.push('linked_parameter_name = ?');
        values.push(linked_parameter_name || null);
      }

      if (updates.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
        return;
      }

      // Добавляем updated_at если колонка существует
      if (hasUpdatedAt) {
        updates.push('updated_at = datetime("now")');
      }
      
      values.push(linkId, productId);

      await db.run(
        `UPDATE product_operations_link SET ${updates.join(', ')} WHERE id = ? AND product_id = ?`,
        values
      );

      logger.info('Связь операции с продуктом обновлена', { 
        linkId, 
        productId, 
        updates: { is_required, conditions, linked_parameter_name } 
      });

      res.json({
        success: true,
        message: 'Operation link updated successfully'
      });
    } catch (error) {
      logger.error('Ошибка обновления связи операции', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update operation link',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Удалить операцию
   * DELETE /api/operations/:id
   */
  static async deleteOperation(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { id } = req.params;

      const operation = await db.get('SELECT * FROM post_processing_services WHERE id = ?', [id]);
      if (!operation) {
        res.status(404).json({
          success: false,
          error: 'Operation not found'
        });
        return;
      }

      await db.run('DELETE FROM post_processing_services WHERE id = ?', [id]);

      logger.info('Операция удалена', { operationId: id, name: operation.name });

      res.json({
        success: true,
        message: 'Operation deleted successfully'
      });
    } catch (error) {
      logger.error('Ошибка удаления операции', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete operation'
      });
    }
  }

  /**
   * Получить операции, связанные с продуктом
   * GET /api/products/:productId/operations
   */
  static async getProductOperations(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { productId } = req.params;

      // Проверяем структуру таблицы
      const columns: any[] = await db.all('PRAGMA table_info(product_operations_link)');
      const hasIsOptional = columns.some(c => c.name === 'is_optional');
      const hasLinkedParam = columns.some(c => c.name === 'linked_parameter_name');

      // Формируем SELECT динамически
      const selectFields = [
        'pol.id',
        'pol.product_id',
        'pol.operation_id',
        'pol.sequence',
        'pol.is_required',
        'pol.is_default',
        hasIsOptional ? 'pol.is_optional' : '0 as is_optional',
        hasLinkedParam ? 'pol.linked_parameter_name' : 'NULL as linked_parameter_name',
        'pol.price_multiplier',
        'pol.conditions',
        'pps.name as operation_name',
        'pps.description as operation_description',
        'pps.price',
        'pps.unit',
        'pps.operation_type',
        'pps.price_unit',
        'pps.setup_cost',
        'pps.min_quantity',
        'pps.parameters',
        'pps.is_active'
      ];

      const operations = await db.all(`
        SELECT ${selectFields.join(', ')}
        FROM product_operations_link pol
        JOIN post_processing_services pps ON pol.operation_id = pps.id
        WHERE pol.product_id = ?
        ORDER BY pol.sequence
      `, [productId]);

      // Парсим JSON поля и форматируем структуру
      const parsedOperations = operations.map((op: any) => ({
        id: op.id,  // ID связи (link_id)
        operation_id: op.operation_id,  // ID операции из библиотеки
        operation_name: op.operation_name,
        operation_description: op.operation_description,
        operation_type: op.operation_type,
        price: op.price,
        price_per_unit: op.price,  // Для совместимости
        service_name: op.operation_name,  // Для совместимости
        unit: op.unit,
        price_unit: op.price_unit,
        setup_cost: op.setup_cost,
        sequence: op.sequence,
        is_required: op.is_required,
        is_default: op.is_default,
        is_optional: op.is_optional || 0,
        linked_parameter_name: op.linked_parameter_name,
        price_multiplier: op.price_multiplier,
        parameters: op.parameters ? JSON.parse(op.parameters) : null,
        conditions: op.conditions ? JSON.parse(op.conditions) : null,
        is_active: op.is_active
      }));
      
      logger.info('📤 Отправка операций продукта', { productId, count: parsedOperations.length });

      res.json({
        success: true,
        data: parsedOperations,
        count: parsedOperations.length
      });
    } catch (error) {
      logger.error('Ошибка получения операций продукта', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch product operations'
      });
    }
  }

  /**
   * Добавить операцию к продукту
   * POST /api/products/:productId/operations
   */
  static async addOperationToProduct(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { productId } = req.params;
      const {
        operation_id,
        sequence,
        is_required,
        is_default,
        price_multiplier,
        conditions
      } = req.body;

      if (!operation_id) {
        res.status(400).json({
          success: false,
          error: 'operation_id is required'
        });
        return;
      }

      // Проверяем, не добавлена ли уже эта операция к продукту
      const existing = await db.get(
        `SELECT id FROM product_operations_link WHERE product_id = ? AND operation_id = ?`,
        [productId, operation_id]
      );

      if (existing) {
        res.status(400).json({
          success: false,
          error: 'Эта операция уже добавлена к продукту'
        });
        return;
      }

      const conditionsJson = conditions ? JSON.stringify(conditions) : null;

      // Проверяем структуру таблицы
      const columns: any[] = await db.all('PRAGMA table_info(product_operations_link)');
      const hasIsOptional = columns.some(c => c.name === 'is_optional');
      const hasLinkedParam = columns.some(c => c.name === 'linked_parameter_name');

      // Формируем INSERT динамически
      const insertFields = ['product_id', 'operation_id', 'sequence', 'is_required', 'is_default', 'price_multiplier', 'conditions'];
      const insertValues = [
        productId,
        operation_id,
        sequence || 1,
        is_required !== undefined ? (is_required ? 1 : 0) : 1,
        is_default !== undefined ? (is_default ? 1 : 0) : 1,
        price_multiplier || 1.0,
        conditionsJson
      ];

      if (hasIsOptional) {
        insertFields.push('is_optional');
        insertValues.push(0);
      }
      
      if (hasLinkedParam) {
        insertFields.push('linked_parameter_name');
        insertValues.push(null);
      }

      const result = await db.run(`
        INSERT INTO product_operations_link (${insertFields.join(', ')})
        VALUES (${insertFields.map(() => '?').join(', ')})
      `, insertValues);

      logger.info('Операция добавлена к продукту', { productId, operationId: operation_id, linkId: result.lastID });

      res.status(201).json({
        success: true,
        data: {
          id: result.lastID,
          product_id: productId,
          operation_id: operation_id
        }
      });
    } catch (error) {
      logger.error('Ошибка добавления операции к продукту', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add operation to product'
      });
    }
  }

  /**
   * Массовое добавление операций к продукту
   * POST /api/products/:productId/operations/bulk
   */
  static async bulkAddOperationsToProduct(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { productId } = req.params;
      const { operations } = req.body; // Array<{ operation_id: number; sequence?: number; is_required?: boolean; ... }>

      if (!Array.isArray(operations) || operations.length === 0) {
        res.status(400).json({
          success: false,
          error: 'operations array is required and must not be empty'
        });
        return;
      }

      // Проверяем структуру таблицы
      const columns: any[] = await db.all('PRAGMA table_info(product_operations_link)');
      const hasIsOptional = columns.some(c => c.name === 'is_optional');
      const hasLinkedParam = columns.some(c => c.name === 'linked_parameter_name');

      await db.run('BEGIN');

      try {
        const added: number[] = [];
        let sequence = 1;

        for (const operation of operations) {
          if (!operation.operation_id) {
            continue; // Пропускаем некорректные записи
          }

          // Проверяем, не добавлена ли уже эта операция
          const existing = await db.get(
            `SELECT id FROM product_operations_link WHERE product_id = ? AND operation_id = ?`,
            [productId, operation.operation_id]
          );

          if (existing) {
            continue; // Пропускаем уже существующие
          }

          const conditionsJson = operation.conditions ? JSON.stringify(operation.conditions) : null;

          // Формируем INSERT динамически
          const insertFields = ['product_id', 'operation_id', 'sequence', 'is_required', 'is_default', 'price_multiplier', 'conditions'];
          const insertValues = [
            productId,
            operation.operation_id,
            operation.sequence || sequence++,
            operation.is_required !== undefined ? (operation.is_required ? 1 : 0) : 1,
            operation.is_default !== undefined ? (operation.is_default ? 1 : 0) : 1,
            operation.price_multiplier || 1.0,
            conditionsJson
          ];

          if (hasIsOptional) {
            insertFields.push('is_optional');
            insertValues.push(operation.is_optional ? 1 : 0);
          }
          
          if (hasLinkedParam) {
            insertFields.push('linked_parameter_name');
            insertValues.push(operation.linked_parameter_name || null);
          }

          const result = await db.run(`
            INSERT INTO product_operations_link (${insertFields.join(', ')})
            VALUES (${insertFields.map(() => '?').join(', ')})
          `, insertValues);

          added.push(operation.operation_id);
        }

        await db.run('COMMIT');

        logger.info('Операции добавлены к продукту (bulk)', { productId, count: added.length });

        res.status(201).json({
          success: true,
          added: added.length,
          operations: added
        });
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Ошибка массового добавления операций к продукту', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add operations to product'
      });
    }
  }

  /**
   * Удалить операцию из продукта
   * DELETE /api/products/:productId/operations/:linkId
   */
  static async removeOperationFromProduct(req: Request, res: Response): Promise<void> {
    try {
      const db = await getDb();
      const { productId, linkId } = req.params;

      await db.run(
        'DELETE FROM product_operations_link WHERE id = ? AND product_id = ?',
        [linkId, productId]
      );

      logger.info('Операция удалена из продукта', { productId, linkId });

      res.json({
        success: true,
        message: 'Operation removed from product successfully'
      });
    } catch (error) {
      logger.error('Ошибка удаления операции из продукта', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove operation from product'
      });
    }
  }
}

