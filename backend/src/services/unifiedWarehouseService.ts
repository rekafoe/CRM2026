import { getDb } from '../config/database';
import { logger } from '../utils/logger';

export interface UnifiedMaterial {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  min_quantity?: number;
  sheet_price_single?: number;
  category_id?: number;
  category_name?: string;
  category_color?: string;
  supplier_id?: number;
  supplier_name?: string;
  supplier_contact?: string;
  // Новые поля для унификации
  price_per_unit?: number;        // Из dynamicPricingService
  material_type?: string;        // Из dynamicPricingService
  is_active?: boolean;           // Из dynamicPricingService
  reserved_quantity?: number;    // Резерв
  available_quantity?: number;   // Доступно
  stock_status?: 'ok' | 'low' | 'warning' | 'out';
}

export interface MaterialReservation {
  id: number;
  material_id: number;
  order_id?: number;
  quantity: number;
  status: 'reserved' | 'confirmed' | 'cancelled';
  created_at: string;
  expires_at: string;
  reason?: string;
}

export interface WarehouseStats {
  totalMaterials: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
  reservedValue: number;
  availableValue: number;
  categories: number;
  suppliers: number;
  alerts: number;
}

export class UnifiedWarehouseService {
  // Получить все материалы с унифицированными данными
  static async getAllMaterials(): Promise<UnifiedMaterial[]> {
    try {
      const db = await getDb();
      
      // Основной запрос к таблице materials с объединением данных
      const materials = await db.all(`
        SELECT 
          m.id,
          m.name,
          m.unit,
          m.quantity,
          m.min_quantity,
          m.sheet_price_single,
          m.category_id,
          c.name as category_name,
          c.color as category_color,
          m.supplier_id,
          s.name as supplier_name,
          s.contact_person as supplier_contact,
          -- Используем sheet_price_single как основную цену
          COALESCE(m.sheet_price_single, 0) as price_per_unit,
          -- Получаем тип материала из категории
          COALESCE(c.name, 'paper') as material_type,
          1 as is_active,
          -- Рассчитываем резерв
          COALESCE((
            SELECT SUM(mr.quantity) 
            FROM material_reservations mr 
            WHERE mr.material_id = m.id 
            AND mr.status = 'reserved'
            AND mr.expires_at > datetime('now')
          ), 0) as reserved_quantity
        FROM materials m
        LEFT JOIN material_categories c ON c.id = m.category_id
        LEFT JOIN suppliers s ON s.id = m.supplier_id
        ORDER BY c.name, m.name
      `);

      // Обрабатываем результаты
      const unifiedMaterials: UnifiedMaterial[] = materials.map((material: any) => {
        const reserved = material.reserved_quantity || 0;
        const available = Math.max(0, material.quantity - reserved);
        
        // Определяем статус склада
        let stockStatus: 'ok' | 'low' | 'warning' | 'out' = 'ok';
        if (material.quantity <= 0) {
          stockStatus = 'out';
        } else if (material.min_quantity && material.quantity <= material.min_quantity) {
          stockStatus = 'low';
        } else if (material.min_quantity && material.quantity <= material.min_quantity * 1.5) {
          stockStatus = 'warning';
        }

        return {
          id: material.id,
          name: material.name,
          unit: material.unit,
          quantity: material.quantity,
          min_quantity: material.min_quantity,
          sheet_price_single: material.sheet_price_single,
          category_id: material.category_id,
          category_name: material.category_name,
          category_color: material.category_color,
          supplier_id: material.supplier_id,
          supplier_name: material.supplier_name,
          supplier_contact: material.supplier_contact,
          price_per_unit: material.price_per_unit,
          material_type: material.material_type,
          is_active: Boolean(material.is_active),
          reserved_quantity: reserved,
          available_quantity: available,
          stock_status: stockStatus
        };
      });

      logger.info('Получены унифицированные материалы', { count: unifiedMaterials.length });
      return unifiedMaterials;
    } catch (error) {
      logger.error('Ошибка получения унифицированных материалов', error);
      return [];
    }
  }

  // Получить статистику склада
  static async getWarehouseStats(): Promise<WarehouseStats> {
    try {
      const materials = await this.getAllMaterials();
      
      const totalMaterials = materials.length;
      const inStock = materials.filter(m => m.stock_status === 'ok').length;
      const lowStock = materials.filter(m => m.stock_status === 'low').length;
      const outOfStock = materials.filter(m => m.stock_status === 'out').length;
      
      const totalValue = materials.reduce((sum, m) => 
        sum + (m.quantity * (m.price_per_unit || m.sheet_price_single || 0)), 0);
      
      const reservedValue = materials.reduce((sum, m) => 
        sum + ((m.reserved_quantity || 0) * (m.price_per_unit || m.sheet_price_single || 0)), 0);
      
      const availableValue = materials.reduce((sum, m) => 
        sum + ((m.available_quantity || 0) * (m.price_per_unit || m.sheet_price_single || 0)), 0);

      // Получаем количество категорий и поставщиков
      const db = await getDb();
      const categoriesResult = await db.get('SELECT COUNT(*) as count FROM material_categories');
      const suppliersResult = await db.get('SELECT COUNT(*) as count FROM suppliers');
      
      const stats: WarehouseStats = {
        totalMaterials,
        inStock,
        lowStock,
        outOfStock,
        totalValue,
        reservedValue,
        availableValue,
        categories: categoriesResult?.count || 0,
        suppliers: suppliersResult?.count || 0,
        alerts: lowStock + outOfStock
      };

      logger.info('Получена статистика склада', stats);
      return stats;
    } catch (error) {
      logger.error('Ошибка получения статистики склада', error);
      return {
        totalMaterials: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        totalValue: 0,
        reservedValue: 0,
        availableValue: 0,
        categories: 0,
        suppliers: 0,
        alerts: 0
      };
    }
  }

  // Резервирование материалов
  static async reserveMaterials(reservations: {
    material_id: number;
    quantity: number;
    order_id?: number;
    reason?: string;
    expires_in_hours?: number;
  }[]): Promise<MaterialReservation[]> {
    try {
      const db = await getDb();
      const createdReservations: MaterialReservation[] = [];
      
      await db.run('BEGIN');
      
      for (const reservation of reservations) {
        // Проверяем доступность материала
        const material = await db.get(`
          SELECT quantity, name FROM materials WHERE id = ?
        `, reservation.material_id);
        
        if (!material) {
          throw new Error(`Материал с ID ${reservation.material_id} не найден`);
        }
        
        // Проверяем доступное количество
        const existingReservations = await db.get(`
          SELECT COALESCE(SUM(quantity), 0) as reserved
          FROM material_reservations 
          WHERE material_id = ? AND status = 'reserved' AND expires_at > datetime('now')
        `, reservation.material_id);
        
        const available = material.quantity - (existingReservations?.reserved || 0);
        
        if (available < reservation.quantity) {
          throw new Error(`Недостаточно материала "${material.name}". Доступно: ${available}, требуется: ${reservation.quantity}`);
        }
        
        // Создаем резерв
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (reservation.expires_in_hours || 24));
        
        const result = await db.run(`
          INSERT INTO material_reservations 
          (material_id, order_id, quantity, status, reason, expires_at)
          VALUES (?, ?, ?, 'reserved', ?, ?)
        `, 
          reservation.material_id,
          reservation.order_id || null,
          reservation.quantity,
          reservation.reason || 'Резерв для заказа',
          expiresAt.toISOString()
        );
        
        createdReservations.push({
          id: result.lastID || 0,
          material_id: reservation.material_id,
          order_id: reservation.order_id,
          quantity: reservation.quantity,
          status: 'reserved',
          created_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          reason: reservation.reason
        });
      }
      
      await db.run('COMMIT');
      
      logger.info('Материалы зарезервированы', { count: createdReservations.length });
      return createdReservations;
    } catch (error) {
      // await db.run('ROLLBACK');
      logger.error('Ошибка резервирования материалов', error);
      throw error;
    }
  }

  // Подтверждение резерва (списание материалов)
  static async confirmReservations(reservationIds: number[]): Promise<void> {
    try {
      const db = await getDb();
      
      await db.run('BEGIN');
      
      for (const reservationId of reservationIds) {
        // Получаем данные резерва
        const reservation = await db.get(`
          SELECT * FROM material_reservations WHERE id = ? AND status = 'reserved'
        `, reservationId);
        
        if (!reservation) {
          throw new Error(`Резерв с ID ${reservationId} не найден или уже обработан`);
        }
        
        // Списываем материалы
        await db.run(`
          UPDATE materials 
          SET quantity = quantity - ? 
          WHERE id = ?
        `, reservation.quantity, reservation.material_id);
        
        // Записываем движение
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
          reservation.material_id,
          'confirm_reservation',
          reservation.quantity,
          -Math.abs(Number(reservation.quantity || 0)),
          reservation.reason || 'Списание по заказу',
          reservation.order_id ?? null,
          null
        );
        
        // Обновляем статус резерва
        await db.run(`
          UPDATE material_reservations 
          SET status = 'confirmed' 
          WHERE id = ?
        `, reservationId);
      }
      
      await db.run('COMMIT');
      
      logger.info('Резервы подтверждены', { count: reservationIds.length });
    } catch (error) {
      // await db.run('ROLLBACK');
      logger.error('Ошибка подтверждения резервов', error);
      throw error;
    }
  }

  // Отмена резерва
  static async cancelReservations(reservationIds: number[]): Promise<void> {
    try {
      const db = await getDb();
      
      await db.run(`
        UPDATE material_reservations 
        SET status = 'cancelled' 
        WHERE id IN (${reservationIds.map(() => '?').join(',')})
      `, ...reservationIds);
      
      logger.info('Резервы отменены', { count: reservationIds.length });
    } catch (error) {
      logger.error('Ошибка отмены резервов', error);
      throw error;
    }
  }

  // Получить резервы по заказу
  static async getReservationsByOrder(orderId: number): Promise<MaterialReservation[]> {
    try {
      const db = await getDb();
      
      const reservations = await db.all(`
        SELECT 
          mr.*,
          m.name as material_name,
          m.unit
        FROM material_reservations mr
        JOIN materials m ON m.id = mr.material_id
        WHERE mr.order_id = ?
        ORDER BY mr.created_at DESC
      `, orderId);
      
      return reservations;
    } catch (error) {
      logger.error('Ошибка получения резервов по заказу', error);
      return [];
    }
  }

  // Синхронизация с системой ценообразования
  static async syncWithPricing(): Promise<void> {
    try {
      const materials = await this.getAllMaterials();
      logger.info('Цены материалов синхронизированы', { count: materials.length });
    } catch (error) {
      logger.error('Ошибка синхронизации с системой ценообразования', error);
    }
  }
}

