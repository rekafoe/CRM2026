import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { WarehouseService } from './warehouseService';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface TransactionOperation {
  type: 'spend' | 'add' | 'adjust' | 'reserve' | 'unreserve' | 'confirm_reservation' | 'cancel_reservation';
  materialId: number;
  quantity: number;
  reason: string;
  orderId?: number;
  userId?: number;
  metadata?: any;
  reservationId?: number; // For reservation operations
}

export interface TransactionResult {
  success: boolean;
  materialId: number;
  oldQuantity: number;
  newQuantity: number;
  operation: TransactionOperation;
  timestamp: string;
  error?: string;
}

export interface TransactionHistory {
  id: number;
  materialId: number;
  materialName: string;
  delta: number;
  reason: string;
  orderId?: number;
  userId?: number;
  createdAt: string;
}

export interface TransactionFilters {
  materialId?: number;
  orderId?: number;
  userId?: number;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

class TransactionValidator {
  static validateOperation(operation: TransactionOperation): void {
    if (!operation.materialId || operation.materialId <= 0) {
      throw new Error('Invalid material ID');
    }

    if (operation.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    if (!operation.reason || operation.reason.trim().length === 0) {
      throw new Error('Reason is required');
    }

    const validTypes = ['spend', 'add', 'adjust', 'reserve', 'unreserve', 'confirm_reservation', 'cancel_reservation'];
    if (!validTypes.includes(operation.type)) {
      throw new Error(`Invalid operation type: ${operation.type}`);
    }

    // Validate reservation operations
    if (['confirm_reservation', 'cancel_reservation'].includes(operation.type)) {
      if (!operation.reservationId || operation.reservationId <= 0) {
        throw new Error('Reservation ID is required for reservation operations');
      }
    }
  }

  static validateMaterialExists(db: any, materialId: number): Promise<{ id: number; name: string; quantity: number }> {
    return new Promise(async (resolve, reject) => {
      try {
        const material = await db.get('SELECT id, name, quantity FROM materials WHERE id = ?', [materialId]);
        if (!material) {
          reject(new Error(`Material with ID ${materialId} not found`));
          return;
        }
        resolve(material);
      } catch (error) {
        reject(error);
      }
    });
  }
}

// ============================================================================
// MAIN TRANSACTION SERVICE
// ============================================================================

export class WarehouseTransactionService {
  // ============================================================================
  // TRANSACTION EXECUTION
  // ============================================================================

  /**
   * Execute atomic transaction with multiple operations
   */
  static async executeTransaction(operations: TransactionOperation[]): Promise<TransactionResult[]> {
    if (!operations || operations.length === 0) {
      throw new Error('No operations provided');
    }

    const db = await getDb();
    const results: TransactionResult[] = [];
    
    await db.run('BEGIN');
    
    try {
      for (const operation of operations) {
        try {
          TransactionValidator.validateOperation(operation);
          const result = await this.executeOperation(db, operation);
          results.push(result);
        } catch (error: any) {
          // Log the error but continue with other operations
          results.push({
            success: false,
            materialId: operation.materialId,
            oldQuantity: 0,
            newQuantity: 0,
            operation,
            timestamp: new Date().toISOString(),
            error: error.message
          });
        }
      }
      
      await db.run('COMMIT');
      
      const successCount = results.filter(r => r.success).length;
      logger.info('Transaction completed', { 
        total: operations.length,
        successful: successCount,
        failed: operations.length - successCount
      });
      
      return results;
    } catch (error) {
      await db.run('ROLLBACK');
      logger.error('Transaction failed, rolled back', error);
      throw error;
    }
  }

  /**
   * Execute single operation
   */
  private static async executeOperation(db: any, operation: TransactionOperation): Promise<TransactionResult> {
    const material = await TransactionValidator.validateMaterialExists(db, operation.materialId);
    const oldQuantity = material.quantity;
    let newQuantity = oldQuantity;
    let delta = 0;

    switch (operation.type) {
      case 'spend':
        delta = -operation.quantity;
        newQuantity = oldQuantity - operation.quantity;
        if (newQuantity < 0) {
          throw new Error(`Insufficient material "${material.name}". Available: ${oldQuantity}, Required: ${operation.quantity}`);
        }
        break;

      case 'add':
        delta = operation.quantity;
        newQuantity = oldQuantity + operation.quantity;
        break;

      case 'adjust':
        delta = operation.quantity - oldQuantity;
        newQuantity = operation.quantity;
        break;

      case 'reserve':
        // For reservations, we don't change the actual quantity
        // This is handled by the reservation system
        delta = 0;
        newQuantity = oldQuantity;
        break;

      case 'unreserve':
        // For unreservations, we don't change the actual quantity
        // This is handled by the reservation system
        delta = 0;
        newQuantity = oldQuantity;
        break;

      case 'confirm_reservation':
        // Confirm reservation - actually deduct materials
        delta = -operation.quantity;
        newQuantity = oldQuantity - operation.quantity;
        if (newQuantity < 0) {
          throw new Error(`Insufficient material "${material.name}" for reservation confirmation`);
        }
        break;

      case 'cancel_reservation':
        // Cancel reservation - no quantity change
        delta = 0;
        newQuantity = oldQuantity;
        break;

      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }

    // Update material quantity if needed
    if (operation.type !== 'reserve' && operation.type !== 'unreserve' && operation.type !== 'cancel_reservation') {
      await db.run('UPDATE materials SET quantity = ? WHERE id = ?', [newQuantity, operation.materialId]);
    }

    const loggedQuantity =
      operation.type === 'adjust'
        ? Math.abs(delta)
        : Math.abs(Number(operation.quantity ?? delta ?? 0));

    // Log the transaction
    await db.run(
      `INSERT INTO material_moves (
        material_id,
        type,
        quantity,
        delta,
        reason,
        order_id,
        user_id,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operation.materialId,
        operation.type,
        loggedQuantity,
        delta,
        operation.reason,
        operation.orderId || null,
        operation.userId || null,
        operation.metadata ? JSON.stringify(operation.metadata) : null
      ]
    );

    return {
      success: true,
      materialId: operation.materialId,
      oldQuantity,
      newQuantity,
      operation,
      timestamp: new Date().toISOString()
    };
  }

  // ============================================================================
  // QUICK OPERATIONS
  // ============================================================================

  /**
   * Spend materials (deduct from inventory)
   */
  static async spendMaterials(
    materialId: number, 
    quantity: number, 
    reason: string, 
    orderId?: number, 
    userId?: number
  ): Promise<TransactionResult> {
    const operation: TransactionOperation = {
      type: 'spend',
      materialId,
      quantity,
      reason,
      orderId,
      userId
    };

    const results = await this.executeTransaction([operation]);
    return results[0];
  }

  /**
   * Add materials (increase inventory)
   */
  static async addMaterials(
    materialId: number, 
    quantity: number, 
    reason: string, 
    orderId?: number, 
    userId?: number
  ): Promise<TransactionResult> {
    const operation: TransactionOperation = {
      type: 'add',
      materialId,
      quantity,
      reason,
      orderId,
      userId
    };

    const results = await this.executeTransaction([operation]);
    return results[0];
  }

  /**
   * Adjust materials (set specific quantity)
   */
  static async adjustMaterials(
    materialId: number, 
    newQuantity: number, 
    reason: string, 
    userId?: number
  ): Promise<TransactionResult> {
    const operation: TransactionOperation = {
      type: 'adjust',
      materialId,
      quantity: newQuantity,
      reason,
      userId
    };

    const results = await this.executeTransaction([operation]);
    return results[0];
  }

  // ============================================================================
  // RESERVATION OPERATIONS
  // ============================================================================

  /**
   * Reserve materials for an order
   */
  static async reserveMaterials(
    reservations: Array<{ materialId: number; quantity: number; orderId?: number; reason?: string }>
  ): Promise<void> {
    try {
      await WarehouseService.reserveMaterials(reservations.map(r => ({
        material_id: r.materialId,
        quantity: r.quantity,
        order_id: r.orderId,
        reason: r.reason || 'Order reservation'
      })));
    } catch (error) {
      logger.error('Error reserving materials', error);
      throw error;
    }
  }

  /**
   * Confirm reservations (deduct materials)
   */
  static async confirmReservations(reservationIds: number[]): Promise<void> {
    try {
      await WarehouseService.confirmReservations(reservationIds);
    } catch (error) {
      logger.error('Error confirming reservations', error);
      throw error;
    }
  }

  /**
   * Cancel reservations
   */
  static async cancelReservations(reservationIds: number[]): Promise<void> {
    try {
      await WarehouseService.cancelReservations(reservationIds);
    } catch (error) {
      logger.error('Error cancelling reservations', error);
      throw error;
    }
  }

  // ============================================================================
  // HISTORY & REPORTING
  // ============================================================================

  /**
   * Get transaction history
   */
  static async getTransactionHistory(filters?: TransactionFilters): Promise<TransactionHistory[]> {
    try {
      const db = await getDb();
      
      let whereClause = '';
      const params: any[] = [];
      
      if (filters) {
        const conditions: string[] = [];
        
        if (filters.materialId) {
          conditions.push('mm.material_id = ?');
          params.push(filters.materialId);
        }
        
        if (filters.orderId) {
          conditions.push('mm.order_id = ?');
          params.push(filters.orderId);
        }
        
        if (filters.userId) {
          conditions.push('mm.user_id = ?');
          params.push(filters.userId);
        }
        
        if (filters.reason) {
          conditions.push('mm.reason LIKE ?');
          params.push(`%${filters.reason}%`);
        }
        
        if (filters.dateFrom) {
          conditions.push('mm.created_at >= ?');
          params.push(filters.dateFrom);
        }
        
        if (filters.dateTo) {
          conditions.push('mm.created_at <= ?');
          params.push(filters.dateTo);
        }
        
        if (conditions.length > 0) {
          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }
      }
      
      const limit = filters?.limit || 100;
      const offset = filters?.offset || 0;
      
      const transactions = await db.all(`
        SELECT 
          mm.id,
          mm.material_id AS materialId,
          m.name as materialName,
          mm.delta,
          mm.type,
          mm.quantity,
          mm.reason,
          mm.order_id AS orderId,
          mm.user_id as userId,
          mm.created_at as createdAt
        FROM material_moves mm
        LEFT JOIN materials m ON m.id = mm.material_id
        ${whereClause}
        ORDER BY mm.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      return transactions.map((tx: any) => ({
        id: tx.id,
        materialId: tx.materialId,
        materialName: tx.materialName || 'Unknown',
        delta: tx.delta,
        type: tx.type,
        quantity: tx.quantity,
        reason: tx.reason,
        orderId: tx.orderId,
        userId: tx.userId,
        createdAt: tx.createdAt
      }));
    } catch (error) {
      logger.error('Error getting transaction history', error);
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * Get material movement summary
   */
  static async getMaterialMovementSummary(materialId: number, days: number = 30): Promise<{
    materialId: number;
    materialName: string;
    currentQuantity: number;
    totalIn: number;
    totalOut: number;
    netChange: number;
    transactions: number;
  }> {
    try {
      const db = await getDb();
      
      // Get material info
      const material = await db.get('SELECT id, name, quantity FROM materials WHERE id = ?', [materialId]);
      if (!material) {
        throw new Error('Material not found');
      }
      
      // Get movement summary
      const summary = await db.get(`
        SELECT 
          COUNT(*) as transactions,
          COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) as totalIn,
          COALESCE(SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END), 0) as totalOut,
          COALESCE(SUM(delta), 0) as netChange
        FROM material_moves 
        WHERE material_id = ? 
        AND created_at >= datetime('now', '-${days} days')
      `, [materialId]);
      
      return {
        materialId: material.id,
        materialName: material.name,
        currentQuantity: material.quantity,
        totalIn: summary.totalIn,
        totalOut: summary.totalOut,
        netChange: summary.netChange,
        transactions: summary.transactions
      };
    } catch (error) {
      logger.error('Error getting material movement summary', error);
      throw new Error('Failed to get material movement summary');
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get transaction statistics
   */
  static async getTransactionStats(days: number = 30): Promise<{
    totalTransactions: number;
    totalMaterials: number;
    totalIn: number;
    totalOut: number;
    mostActiveMaterial: { id: number; name: string; transactions: number } | null;
  }> {
    try {
      const db = await getDb();
      
      const stats = await db.get(`
        SELECT 
          COUNT(*) as totalTransactions,
          COUNT(DISTINCT material_id) as totalMaterials,
          COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) as totalIn,
          COALESCE(SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END), 0) as totalOut
        FROM material_moves 
        WHERE created_at >= datetime('now', '-${days} days')
      `);
      
      const mostActive = await db.get(`
        SELECT 
          mm.material_id,
          m.name,
          COUNT(*) as transactions
        FROM material_moves mm
        LEFT JOIN materials m ON m.id = mm.material_id
        WHERE mm.created_at >= datetime('now', '-${days} days')
        GROUP BY mm.material_id
        ORDER BY transactions DESC
        LIMIT 1
      `);
      
      return {
        totalTransactions: stats.totalTransactions,
        totalMaterials: stats.totalMaterials,
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        mostActiveMaterial: mostActive ? {
          id: mostActive.material_id,
          name: mostActive.name || 'Unknown',
          transactions: mostActive.transactions
        } : null
      };
    } catch (error) {
      logger.error('Error getting transaction stats', error);
      throw new Error('Failed to get transaction statistics');
    }
  }

  /**
   * Clean up old transactions (for maintenance)
   */
  static async cleanupOldTransactions(daysToKeep: number = 365): Promise<number> {
    try {
      const db = await getDb();
      
      const result = await db.run(`
        DELETE FROM material_moves 
        WHERE created_at < datetime('now', '-${daysToKeep} days')
      `);
      
      const deletedCount = result.changes || 0;
      logger.info('Old transactions cleaned up', { deletedCount, daysToKeep });
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old transactions', error);
      throw error;
    }
  }
}