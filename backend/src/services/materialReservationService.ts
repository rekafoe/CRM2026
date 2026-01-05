import { Database } from 'sqlite';
import { MaterialReservation, MaterialReservationHistory } from '../../../shared/types/entities';

export class MaterialReservationService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Создать резервирование материала
   */
  async createReservation(reservation: Partial<MaterialReservation>): Promise<MaterialReservation> {
    const {
      material_id,
      order_id,
      quantity_reserved,
      expires_at,
      reserved_by,
      notes
    } = reservation;

    // Проверяем доступность материала
    await this.checkMaterialAvailability(material_id!, quantity_reserved!);

    const sql = `
      INSERT INTO material_reservations (
        material_id, order_id, quantity_reserved, expires_at, 
        reserved_by, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'active')
    `;

    const result = await this.db.run(
      sql,
      [material_id, order_id, quantity_reserved, expires_at, reserved_by, notes]
    );

    return {
      id: result.lastID!,
      material_id: material_id!,
      order_id,
      quantity_reserved: quantity_reserved!,
      reserved_at: new Date().toISOString(),
      expires_at,
      status: 'active',
      reserved_by,
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Получить все резервирования
   */
  async getAllReservations(): Promise<MaterialReservation[]> {
    const sql = `
      SELECT 
        mr.*,
        m.name as material_name,
        m.unit as material_unit,
        u.name as user_name
      FROM material_reservations mr
      LEFT JOIN materials m ON m.id = mr.material_id
      LEFT JOIN users u ON u.id = mr.reserved_by
      ORDER BY mr.created_at DESC
    `;

    const rows: any[] = await this.db.all(sql);

    return rows.map(row => ({
      id: row.id,
      material_id: row.material_id,
      order_id: row.order_id,
      quantity_reserved: row.quantity_reserved,
      reserved_at: row.reserved_at,
      expires_at: row.expires_at,
      status: row.status,
      reserved_by: row.reserved_by,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      material: {
        id: row.material_id,
        name: row.material_name,
        unit: row.material_unit
      } as any,
      user: {
        id: row.reserved_by,
        name: row.user_name
      }
    }));
  }

  /**
   * Получить резервирования по материалу
   */
  async getReservationsByMaterial(materialId: number): Promise<MaterialReservation[]> {
    const sql = `
      SELECT 
        mr.*,
        m.name as material_name,
        m.unit as material_unit,
        u.name as user_name
      FROM material_reservations mr
      LEFT JOIN materials m ON m.id = mr.material_id
      LEFT JOIN users u ON u.id = mr.reserved_by
      WHERE mr.material_id = ? AND mr.status = 'active'
      ORDER BY mr.created_at DESC
    `;

    const rows: any[] = await this.db.all(sql, [materialId]);

    return rows.map(row => ({
      id: row.id,
      material_id: row.material_id,
      order_id: row.order_id,
      quantity_reserved: row.quantity_reserved,
      reserved_at: row.reserved_at,
      expires_at: row.expires_at,
      status: row.status,
      reserved_by: row.reserved_by,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      material: {
        id: row.material_id,
        name: row.material_name,
        unit: row.material_unit
      } as any,
      user: {
        id: row.reserved_by,
        name: row.user_name
      }
    }));
  }

  /**
   * Обновить резервирование
   */
  async updateReservation(
    id: number, 
    updates: Partial<MaterialReservation>,
    changedBy?: number
  ): Promise<MaterialReservation> {
    const {
      quantity_reserved,
      expires_at,
      status,
      notes
    } = updates;

    const sql = `
      UPDATE material_reservations 
      SET quantity_reserved = COALESCE(?, quantity_reserved),
          expires_at = COALESCE(?, expires_at),
          status = COALESCE(?, status),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await this.db.run(sql, [quantity_reserved, expires_at, status, notes, id]);

    // Получаем обновленное резервирование
    const getSql = `
      SELECT 
        mr.*,
        m.name as material_name,
        m.unit as material_unit,
        u.name as user_name
      FROM material_reservations mr
      LEFT JOIN materials m ON m.id = mr.material_id
      LEFT JOIN users u ON u.id = mr.reserved_by
      WHERE mr.id = ?
    `;

    const row: any = await this.db.get(getSql, [id]);

    return {
      id: row.id,
      material_id: row.material_id,
      order_id: row.order_id,
      quantity_reserved: row.quantity_reserved,
      reserved_at: row.reserved_at,
      expires_at: row.expires_at,
      status: row.status,
      reserved_by: row.reserved_by,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      material: {
        id: row.material_id,
        name: row.material_name,
        unit: row.material_unit
      } as any,
      user: {
        id: row.reserved_by,
        name: row.user_name
      }
    };
  }

  /**
   * Отменить резервирование
   */
  async cancelReservation(id: number, reason?: string, changedBy?: number): Promise<void> {
    const sql = `
      UPDATE material_reservations 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await this.db.run(sql, [id]);

    // Логируем отмену
    const historySql = `
      INSERT INTO material_reservation_history (
        reservation_id, action, changed_by, reason
      ) VALUES (?, 'cancelled', ?, ?)
    `;

    try {
      await this.db.run(historySql, [id, changedBy, reason || 'Manual cancellation']);
    } catch (err) {
      console.error('❌ [MaterialReservationService] logCancellation error:', err);
    }
  }

  /**
   * Выполнить резервирование (списать со склада)
   */
  async fulfillReservation(id: number, changedBy?: number): Promise<void> {
    // Получаем резервирование
    const getSql = `SELECT * FROM material_reservations WHERE id = ?`;
    const reservation: any = await this.db.get(getSql, [id]);

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    // Обновляем статус резервирования
    const updateSql = `
      UPDATE material_reservations 
      SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await this.db.run(updateSql, [id]);

    // Списываем количество со склада
    const deductSql = `
      UPDATE materials 
      SET quantity = quantity - ?
      WHERE id = ?
    `;

    await this.db.run(deductSql, [reservation.quantity_reserved, reservation.material_id]);

    // Логируем выполнение
    const historySql = `
      INSERT INTO material_reservation_history (
        reservation_id, action, changed_by, reason
      ) VALUES (?, 'fulfilled', ?, 'Reservation fulfilled')
    `;

    try {
      await this.db.run(historySql, [id, changedBy]);
    } catch (err) {
      console.error('❌ [MaterialReservationService] logFulfillment error:', err);
    }
  }

  /**
   * Проверить доступность материала
   */
  private async checkMaterialAvailability(materialId: number, quantity: number): Promise<void> {
    const sql = `
      SELECT 
        m.quantity,
        COALESCE(SUM(mr.quantity_reserved), 0) as reserved_quantity
      FROM materials m
      LEFT JOIN material_reservations mr ON mr.material_id = m.id AND mr.status = 'active'
      WHERE m.id = ?
      GROUP BY m.id, m.quantity
    `;

    const row: any = await this.db.get(sql, [materialId]);

    if (!row) {
      throw new Error('Material not found');
    }

    const availableQuantity = row.quantity - row.reserved_quantity;
    
    if (availableQuantity < quantity) {
      throw new Error(`Insufficient material. Available: ${availableQuantity}, Requested: ${quantity}`);
    }
  }

  /**
   * Получить доступное количество материала
   */
  async getAvailableQuantity(materialId: number): Promise<number> {
    const sql = `
      SELECT 
        m.quantity,
        COALESCE(SUM(mr.quantity_reserved), 0) as reserved_quantity
      FROM materials m
      LEFT JOIN material_reservations mr ON mr.material_id = m.id AND mr.status = 'active'
      WHERE m.id = ?
      GROUP BY m.id, m.quantity
    `;

    const row: any = await this.db.get(sql, [materialId]);

    if (!row) {
      return 0;
    }

    const availableQuantity = row.quantity - row.reserved_quantity;
    return Math.max(0, availableQuantity);
  }

  /**
   * Очистить истекшие резервирования
   */
  async cleanupExpiredReservations(): Promise<number> {
    const sql = `
      UPDATE material_reservations 
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP
    `;

    const result = await this.db.run(sql);
    const expiredCount = result.changes || 0;
    console.log(`🧹 [MaterialReservationService] Cleaned up ${expiredCount} expired reservations`);
    return expiredCount;
  }
}
