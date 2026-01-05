import { getDb } from '../config/database';
import { logger } from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Material {
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
  price_per_unit?: number;
  material_type?: string;
  is_active?: boolean;
  reserved_quantity?: number;
  available_quantity?: number;
  stock_status?: StockStatus;
}

export type StockStatus = 'ok' | 'low' | 'warning' | 'out';

export interface MaterialReservation {
  id: number;
  material_id: number;
  order_id?: number;
  quantity: number;
  status: 'reserved' | 'confirmed' | 'expired' | 'cancelled';
  reason?: string;
  created_at: string;
  expires_at: string;
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

export interface ReservationRequest {
  material_id: number;
  quantity: number;
  order_id?: number;
  reason?: string;
  expires_in_hours?: number;
}

export interface MaterialFilters {
  categoryId?: number;
  supplierId?: number;
  search?: string;
  stockStatus?: StockStatus;
  minQuantity?: number;
  maxQuantity?: number;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

class WarehouseValidator {
  static validateMaterialId(id: number): void {
    if (!id || id <= 0) {
      throw new Error('Invalid material ID');
    }
  }

  static validateQuantity(quantity: number): void {
    if (quantity < 0) {
      throw new Error('Quantity cannot be negative');
    }
  }

  static validateReservationRequest(request: ReservationRequest): void {
    this.validateMaterialId(request.material_id);
    this.validateQuantity(request.quantity);
    
    if (request.expires_in_hours && request.expires_in_hours <= 0) {
      throw new Error('Expiration hours must be positive');
    }
  }
}

// ============================================================================
// MAIN WAREHOUSE SERVICE
// ============================================================================

export class WarehouseService {
  // ============================================================================
  // MATERIAL MANAGEMENT
  // ============================================================================

  /**
   * Get all materials with unified data
   */
  static async getAllMaterials(filters?: MaterialFilters): Promise<Material[]> {
    try {
      const db = await getDb();
      
      let whereClause = '';
      const params: any[] = [];
      
      if (filters) {
        const conditions: string[] = [];
        
        if (filters.categoryId) {
          conditions.push('m.category_id = ?');
          params.push(filters.categoryId);
        }
        
        if (filters.supplierId) {
          conditions.push('m.supplier_id = ?');
          params.push(filters.supplierId);
        }
        
        if (filters.search) {
          conditions.push('(m.name LIKE ? OR c.name LIKE ?)');
          params.push(`%${filters.search}%`, `%${filters.search}%`);
        }
        
        if (filters.minQuantity !== undefined) {
          conditions.push('m.quantity >= ?');
          params.push(filters.minQuantity);
        }
        
        if (filters.maxQuantity !== undefined) {
          conditions.push('m.quantity <= ?');
          params.push(filters.maxQuantity);
        }
        
        if (conditions.length > 0) {
          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }
      }
      
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
          COALESCE(m.sheet_price_single, 0) as price_per_unit,
          COALESCE(c.name, 'paper') as material_type,
          1 as is_active,
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
        
        ${whereClause}
        ORDER BY c.name, m.name
      `, params);

      return materials.map(this.mapToMaterial);
    } catch (error) {
      logger.error('Error getting materials', error);
      throw new Error('Failed to get materials');
    }
  }

  /**
   * Get material by ID
   */
  static async getMaterialById(id: number): Promise<Material | null> {
    try {
      WarehouseValidator.validateMaterialId(id);
      
      const db = await getDb();
      const material = await db.get(`
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
          COALESCE(m.sheet_price_single, 0) as price_per_unit,
          COALESCE(c.name, 'paper') as material_type,
          1 as is_active,
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
        
        WHERE m.id = ?
      `, [id]);

      return material ? this.mapToMaterial(material) : null;
    } catch (error) {
      logger.error('Error getting material by ID', error);
      throw new Error('Failed to get material');
    }
  }

  /**
   * Update material quantity
   */
  static async updateMaterialQuantity(id: number, newQuantity: number, reason?: string): Promise<void> {
    try {
      WarehouseValidator.validateMaterialId(id);
      WarehouseValidator.validateQuantity(newQuantity);
      
      const db = await getDb();
      
      // Get current quantity
      const material = await db.get('SELECT quantity FROM materials WHERE id = ?', [id]);
      if (!material) {
        throw new Error('Material not found');
      }
      
      const delta = newQuantity - material.quantity;
      
      await db.run('BEGIN');
      
      // Update quantity
      await db.run('UPDATE materials SET quantity = ? WHERE id = ?', [newQuantity, id]);
      
      // Log transaction
      await db.run(
        `INSERT INTO material_moves (
           material_id,
           type,
           quantity,
           delta,
           reason,
           order_id,
           user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?)` ,
        [
          id,
          delta >= 0 ? 'adjust_increase' : 'adjust_decrease',
          Math.abs(delta),
          delta,
          reason || 'Manual adjustment',
          null,
          null
        ]
      );
      
      await db.run('COMMIT');
      
      logger.info('Material quantity updated', { id, oldQuantity: material.quantity, newQuantity, delta });
    } catch (error) {
      logger.error('Error updating material quantity', error);
      throw new Error('Failed to update material quantity');
    }
  }

  // ============================================================================
  // RESERVATION MANAGEMENT
  // ============================================================================

  /**
   * Reserve materials for an order
   */
  static async reserveMaterials(reservations: ReservationRequest[]): Promise<MaterialReservation[]> {
    try {
      const db = await getDb();
      const createdReservations: MaterialReservation[] = [];
      
      await db.run('BEGIN');
      
      for (const reservation of reservations) {
        WarehouseValidator.validateReservationRequest(reservation);
        
        // Check material availability
        const material = await db.get('SELECT quantity, name FROM materials WHERE id = ?', [reservation.material_id]);
        if (!material) {
          throw new Error(`Material with ID ${reservation.material_id} not found`);
        }
        
        // Check available quantity
        const existingReservations = await db.get(`
          SELECT COALESCE(SUM(quantity), 0) as reserved
          FROM material_reservations 
          WHERE material_id = ? AND status = 'reserved' AND expires_at > datetime('now')
        `, [reservation.material_id]);
        
        const available = material.quantity - (existingReservations?.reserved || 0);
        
        if (available < reservation.quantity) {
          throw new Error(`Insufficient material "${material.name}". Available: ${available}, Required: ${reservation.quantity}`);
        }
        
        // Create reservation
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
          reservation.reason || 'Order reservation',
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
      
      logger.info('Materials reserved', { count: createdReservations.length });
      return createdReservations;
    } catch (error) {
      const db = await getDb();
      await db.run('ROLLBACK');
      logger.error('Error reserving materials', error);
      throw error;
    }
  }

  /**
   * Confirm reservations (deduct materials)
   */
  static async confirmReservations(reservationIds: number[]): Promise<void> {
    try {
      const db = await getDb();
      
      await db.run('BEGIN');
      
      for (const reservationId of reservationIds) {
        const reservation = await db.get(`
          SELECT * FROM material_reservations WHERE id = ? AND status = 'reserved'
        `, [reservationId]);
        
        if (!reservation) {
          throw new Error(`Reservation with ID ${reservationId} not found or already processed`);
        }
        
        // Deduct materials
        await db.run(`
          UPDATE materials 
          SET quantity = quantity - ? 
          WHERE id = ?
        `, [reservation.quantity, reservation.material_id]);
        
        // Update reservation status
        await db.run(`
          UPDATE material_reservations 
          SET status = 'confirmed' 
          WHERE id = ?
        `, [reservationId]);
        
        // Log transaction
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
          [
            reservation.material_id,
            'confirm_reservation',
            reservation.quantity,
            -Math.abs(Number(reservation.quantity || 0)),
            'Reservation confirmed',
            reservation.order_id ?? null,
            null
          ]
        );
      }
      
      await db.run('COMMIT');
      
      logger.info('Reservations confirmed', { count: reservationIds.length });
    } catch (error) {
      const db = await getDb();
      await db.run('ROLLBACK');
      logger.error('Error confirming reservations', error);
      throw error;
    }
  }

  /**
   * Cancel reservations
   */
  static async cancelReservations(reservationIds: number[]): Promise<void> {
    try {
      const db = await getDb();
      
      await db.run(`
        UPDATE material_reservations 
        SET status = 'cancelled' 
        WHERE id IN (${reservationIds.map(() => '?').join(',')})
      `, reservationIds);
      
      logger.info('Reservations cancelled', { count: reservationIds.length });
    } catch (error) {
      logger.error('Error cancelling reservations', error);
      throw error;
    }
  }

  // ============================================================================
  // STATISTICS & ANALYTICS
  // ============================================================================

  /**
   * Get warehouse statistics
   */
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

      const db = await getDb();
      const categoriesResult = await db.get('SELECT COUNT(*) as count FROM material_categories');
      const suppliersResult = await db.get('SELECT COUNT(*) as count FROM suppliers');
      
      return {
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
    } catch (error) {
      logger.error('Error getting warehouse stats', error);
      throw new Error('Failed to get warehouse statistics');
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Map database row to Material object
   */
  private static mapToMaterial(row: any): Material {
    const reserved = row.reserved_quantity || 0;
    const available = Math.max(0, row.quantity - reserved);
    
    // Determine stock status
    let stockStatus: StockStatus = 'ok';
    if (row.quantity <= 0) {
      stockStatus = 'out';
    } else if (row.quantity <= (row.min_quantity || 5)) {
      stockStatus = 'low';
    } else if (row.quantity <= (row.min_quantity || 5) * 2) {
      stockStatus = 'warning';
    }
    
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      min_quantity: row.min_quantity,
      sheet_price_single: row.sheet_price_single,
      category_id: row.category_id,
      category_name: row.category_name,
      category_color: row.category_color,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      supplier_contact: row.supplier_contact,
      price_per_unit: row.price_per_unit,
      material_type: row.material_type,
      is_active: row.is_active,
      reserved_quantity: reserved,
      available_quantity: available,
      stock_status: stockStatus
    };
  }

  /**
   * Clean up expired reservations
   */
  static async cleanupExpiredReservations(): Promise<number> {
    try {
      const db = await getDb();
      
      const result = await db.run(`
        UPDATE material_reservations 
        SET status = 'expired' 
        WHERE status = 'reserved' AND expires_at <= datetime('now')
      `);
      
      const affectedRows = result.changes || 0;
      logger.info('Expired reservations cleaned up', { count: affectedRows });
      
      return affectedRows;
    } catch (error) {
      logger.error('Error cleaning up expired reservations', error);
      throw error;
    }
  }
}
