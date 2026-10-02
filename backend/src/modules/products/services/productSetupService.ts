import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';

/**
 * Сервис для управления процессом настройки продукта
 * Обеспечивает последовательную настройку продукта через этапы:
 * 1. draft → materials_configured
 * 2. materials_configured → operations_configured  
 * 3. operations_configured → ready
 */

export type SetupStatus = 'draft' | 'materials_configured' | 'operations_configured' | 'ready';

export interface SetupStep {
  step: string;
  isCompleted: boolean;
  completedAt?: string;
  validationNotes?: string;
}

export interface ProductSetupState {
  productId: number;
  productName: string;
  currentStatus: SetupStatus;
  canActivate: boolean;
  steps: SetupStep[];
  missingSteps: string[];
}

export class ProductSetupService {
  /**
   * Получить состояние настройки продукта
   */
  static async getSetupState(productId: number): Promise<ProductSetupState> {
    const db = await getDb();

    const product = await db.get<{
      id: number;
      name: string;
      setup_status: SetupStatus;
      is_active: number;
    }>(
      `SELECT id, name, setup_status, is_active FROM products WHERE id = ?`,
      productId
    );

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Проверяем выполнение каждого этапа
    const steps = await this.validateAllSteps(productId);
    const missingSteps = steps.filter(s => !s.isCompleted).map(s => s.step);
    const canActivate = product.setup_status === 'ready' && missingSteps.length === 0;

    return {
      productId,
      productName: product.name,
      currentStatus: product.setup_status,
      canActivate,
      steps,
      missingSteps
    };
  }

  /**
   * Валидирует все этапы настройки продукта
   */
  private static async validateAllSteps(productId: number): Promise<SetupStep[]> {
    const steps: SetupStep[] = [
      {
        step: 'materials',
        isCompleted: await this.hasMaterials(productId)
      },
      {
        step: 'operations',
        isCompleted: await this.hasOperations(productId)
      },
      {
        step: 'pricing_rules',
        isCompleted: await this.hasPricingRules(productId)
      }
    ];

    return steps;
  }

  /**
   * Проверка: настроен ли тип продукта
   */
  private static async hasProductType(productId: number): Promise<boolean> {
    try {
      const db = await getDb();
      const product = await db.get<{ product_type: string | null }>(
        `SELECT product_type FROM products WHERE id = ?`,
        productId
      );
      return !!product?.product_type;
    } catch (error) {
      logger.error('Error in hasProductType', { productId, error });
      return false;
    }
  }

  /**
   * Проверка: настроены ли материалы
   */
  private static async hasMaterials(productId: number): Promise<boolean> {
    try {
      const db = await getDb();
      
      // Способ 1: Проверяем прямую связь product_materials
      const directMaterials = await db.all(
        `SELECT id FROM product_materials WHERE product_id = ? LIMIT 1`,
        productId
      );
      if (directMaterials && directMaterials.length > 0) return true;

      // Способ 2: Проверяем материалы в шаблоне продукта
      const templateConfig = await db.get<{ config_data: string | null }>(
        `SELECT config_data FROM product_template_configs WHERE product_id = ? LIMIT 1`,
        productId
      );
      
      if (templateConfig?.config_data) {
        try {
          const config = JSON.parse(templateConfig.config_data);
          if (config.materials && Array.isArray(config.materials) && config.materials.length > 0) {
            return true;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }

      // Способ 3: Проверяем правила материалов для типа продукта (product_material_rules)
      const product = await db.get<{ product_type: string | null; name: string | null }>(
        `SELECT product_type, name FROM products WHERE id = ?`,
        productId
      );

      if (product?.product_type) {
        const rules = await db.all(
          `SELECT id FROM product_material_rules 
           WHERE product_type = ? AND (product_name IS NULL OR product_name = ?)
           LIMIT 1`,
          [product.product_type, product.name]
        );
        if (rules && rules.length > 0) return true;
      }

      return false;
    } catch (error) {
      logger.error('Error in hasMaterials', { productId, error });
      return false;
    }
  }

  /**
   * Проверка: настроены ли операции
   */
  private static async hasOperations(productId: number): Promise<boolean> {
    try {
      const db = await getDb();
      
      const operations = await db.all(
        `SELECT id FROM product_operations_link WHERE product_id = ? LIMIT 1`,
        productId
      );

      return operations && operations.length > 0;
    } catch (error) {
      logger.error('Error in hasOperations', { productId, error });
      return false;
    }
  }

  /**
   * Проверка: настроены ли правила ценообразования (опционально)
   */
  private static async hasPricingRules(productId: number): Promise<boolean> {
    try {
      // Пока считаем, что правила не обязательны
      // В будущем можно добавить проверку operation_pricing_rules
      return true;
    } catch (error) {
      logger.error('Error in hasPricingRules', { productId, error });
      return true; // Возвращаем true, так как правила опциональны
    }
  }

  /**
   * Обновить статус продукта на основе выполненных этапов
   */
  static async updateSetupStatus(productId: number): Promise<SetupStatus> {
    const db = await getDb();
    
    const hasMaterials = await this.hasMaterials(productId);
    const hasOperations = await this.hasOperations(productId);

    let newStatus: SetupStatus = 'draft';

    if (hasMaterials && hasOperations) {
      newStatus = 'ready';
    } else if (hasMaterials) {
      newStatus = 'materials_configured';
    } else if (hasOperations) {
      newStatus = 'operations_configured';
    }

    await db.run(
      `UPDATE products SET setup_status = ?, updated_at = datetime('now') WHERE id = ?`,
      [newStatus, productId]
    );

    logger.info('Обновлен статус настройки продукта', {
      productId,
      newStatus,
      hasMaterials,
      hasOperations
    });

    return newStatus;
  }

  /**
   * Попытка активировать продукт (только если ready)
   */
  static async activateProduct(productId: number): Promise<{ success: boolean; message: string }> {
    const state = await this.getSetupState(productId);

    if (!state.canActivate) {
      return {
        success: false,
        message: `Продукт не может быть активирован. Отсутствуют этапы: ${state.missingSteps.join(', ')}`
      };
    }

    const db = await getDb();
    await db.run(
      `UPDATE products SET is_active = 1, updated_at = datetime('now') WHERE id = ?`,
      productId
    );

    logger.info('Продукт активирован', { productId, productName: state.productName });

    return {
      success: true,
      message: 'Продукт успешно активирован'
    };
  }

  /**
   * Создать чеклист этапов для продукта
   */
  static async initializeChecklist(productId: number): Promise<void> {
    const db = await getDb();

    const steps = ['materials', 'operations', 'pricing_rules'];

    for (const step of steps) {
      await db.run(
        `INSERT OR IGNORE INTO product_setup_checklist (product_id, step, is_completed)
         VALUES (?, ?, 0)`,
        [productId, step]
      );
    }

    logger.info('Инициализирован чеклист настройки продукта', { productId });
  }

  /**
   * Отметить этап как выполненный
   */
  static async completeStep(
    productId: number,
    step: string,
    validatedBy?: number,
    notes?: string
  ): Promise<void> {
    const db = await getDb();

    await db.run(
      `UPDATE product_setup_checklist 
       SET is_completed = 1, 
           completed_at = datetime('now'),
           validated_by = ?,
           validation_notes = ?,
           updated_at = datetime('now')
       WHERE product_id = ? AND step = ?`,
      [validatedBy, notes, productId, step]
    );

    logger.info('Этап настройки продукта выполнен', { productId, step });

    // Автоматически обновляем общий статус
    await this.updateSetupStatus(productId);
  }
}

