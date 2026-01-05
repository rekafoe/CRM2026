import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { Material } from '../models';
import { MaterialService as ModuleMaterialService } from '../modules/warehouse/services/materialService';

// Local filter type preserved for compatibility
export interface MaterialFilters {
  categoryId?: number;
  supplierId?: number;
  search?: string;
  stockStatus?: 'all' | 'in' | 'low' | 'out';
  minQuantity?: number;
  maxQuantity?: number;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MaterialCreateRequest {
  name: string;
  unit: string;
  quantity: number;
  min_quantity?: number;
  sheet_price_single?: number;
  category_id?: number;
  supplier_id?: number;
  paper_type_id?: number;
  density?: number;
  description?: string;
  min_stock_level?: number;
  max_stock_level?: number;
  location?: string;
  barcode?: string;
  sku?: string;
  notes?: string;
  is_active?: boolean;
}

export interface MaterialUpdateRequest extends Partial<MaterialCreateRequest> {
  id: number;
}

export interface MaterialSearchFilters extends MaterialFilters {
  paperTypeId?: number;
  density?: number;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

class MaterialValidator {
  static validateMaterialData(data: MaterialCreateRequest): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Material name is required');
    }
    
    if (!data.unit || data.unit.trim().length === 0) {
      throw new Error('Material unit is required');
    }
    
    if (data.quantity < 0) {
      throw new Error('Quantity cannot be negative');
    }
    
    if (data.min_quantity !== undefined && data.min_quantity < 0) {
      throw new Error('Minimum quantity cannot be negative');
    }
    
    if (data.sheet_price_single !== undefined && data.sheet_price_single < 0) {
      throw new Error('Price cannot be negative');
    }
  }

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
}

// ============================================================================
// MAIN MATERIAL SERVICE
// ============================================================================

export class MaterialService {
  // ============================================================================
  // READ OPERATIONS
  // ============================================================================

  /**
   * Get all materials with optional filtering
   */
  static async getAllMaterials(filters?: MaterialSearchFilters): Promise<Material[]> {
    try {
      // Fetch all from unified module service, then apply in-memory filters
      let materials = await ModuleMaterialService.getAllMaterials();

      if (filters?.categoryId) {
        materials = materials.filter(m => (m as any).category_id === filters.categoryId);
      }
      if (filters?.supplierId) {
        materials = materials.filter(m => (m as any).supplier_id === filters.supplierId);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        materials = materials.filter(m => (m.name || '').toLowerCase().includes(q));
      }
      if (filters?.minQuantity != null) {
        materials = materials.filter(m => ((m as any).quantity ?? 0) >= (filters!.minQuantity as number));
      }
      if (filters?.maxQuantity != null) {
        materials = materials.filter(m => ((m as any).quantity ?? 0) <= (filters!.maxQuantity as number));
      }
      if (filters?.stockStatus && filters.stockStatus !== 'all') {
        materials = materials.filter(m => {
          const qty = (m as any).quantity ?? 0;
          const minQty = (m as any).min_quantity ?? 0;
          if (filters!.stockStatus === 'out') return qty === 0;
          if (filters!.stockStatus === 'low') return qty > 0 && qty <= Math.max(0, minQty);
          if (filters!.stockStatus === 'in') return qty > Math.max(0, minQty);
          return true;
        });
      }

      // Apply additional filters specific to MaterialService
      if (filters?.paperTypeId) {
        materials = materials.filter(m => m.category_id === filters.paperTypeId);
      }

      if (filters?.density) {
        // Note: density filtering would need to be added to the database query
        // For now, we'll filter in memory (not ideal for large datasets)
        materials = materials.filter(m => {
          // This would need to be implemented based on your database schema
          return true; // Placeholder
        });
      }

      return materials;
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
      MaterialValidator.validateMaterialId(id);
      return await ModuleMaterialService.getMaterialById(id);
      } catch (error) {
      logger.error('Error getting material by ID', error);
      throw new Error('Failed to get material');
    }
  }

  /**
   * Search materials by name or category
   */
  static async searchMaterials(query: string, limit: number = 50): Promise<Material[]> {
    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      const materials = await ModuleMaterialService.getAllMaterials();
      const q = query.trim().toLowerCase();
      const filtered = materials.filter(m => (m.name || '').toLowerCase().includes(q));
      return filtered.slice(0, limit);
    } catch (error) {
      logger.error('Error searching materials', error);
      throw new Error('Failed to search materials');
    }
  }

  // ============================================================================
  // CREATE OPERATIONS
  // ============================================================================

  /**
   * Create new material
   */
  static async createMaterial(data: MaterialCreateRequest): Promise<Material> {
    try {
      MaterialValidator.validateMaterialData(data);

      const db = await getDb();

      // Validate foreign keys
      if (data.supplier_id) {
        const supplier = await db.get('SELECT id FROM suppliers WHERE id = ?', [data.supplier_id]);
        if (!supplier) {
          throw new Error(`Supplier with ID ${data.supplier_id} not found`);
        }
      }

      if (data.category_id) {
        const category = await db.get('SELECT id FROM material_categories WHERE id = ?', [data.category_id]);
        if (!category) {
          throw new Error(`Category with ID ${data.category_id} not found`);
        }
      }

      if (data.paper_type_id) {
        const paperType = await db.get('SELECT id FROM paper_types WHERE id = ?', [data.paper_type_id]);
        if (!paperType) {
          throw new Error(`Paper type with ID ${data.paper_type_id} not found`);
        }
      }

      await db.run('BEGIN');

      try {
        const result = await db.run(`
          INSERT INTO materials (
            name, unit, quantity, min_quantity, sheet_price_single,
            category_id, supplier_id, paper_type_id, density, description,
            min_stock_level, max_stock_level, location, barcode, sku, notes, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          data.name.trim(),
          data.unit.trim(),
          data.quantity,
          data.min_quantity || null,
          data.sheet_price_single || null,
          data.category_id || null,
          data.supplier_id || null,
          data.paper_type_id || null,
          data.density || null,
          data.description || null,
          data.min_stock_level || null,
          data.max_stock_level || null,
          data.location || null,
          data.barcode || null,
          data.sku || null,
          data.notes || null,
          data.is_active !== undefined ? data.is_active : true
        ]);

        await db.run('COMMIT');

        const materialId = result.lastID || 0;
        const newMaterial = await this.getMaterialById(materialId);
        
        if (!newMaterial) {
          throw new Error('Failed to retrieve created material');
        }

        logger.info('Material created successfully', { id: materialId, name: data.name });
        return newMaterial;
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error creating material', error);
      throw error;
    }
  }

  // ============================================================================
  // UPDATE OPERATIONS
  // ============================================================================

  /**
   * Update existing material
   */
  static async updateMaterial(data: MaterialUpdateRequest): Promise<Material> {
    try {
      MaterialValidator.validateMaterialId(data.id);
      
      if (data.name !== undefined || data.unit !== undefined || data.quantity !== undefined) {
        MaterialValidator.validateMaterialData(data as MaterialCreateRequest);
      }

      const db = await getDb();

      // Check if material exists
      const existingMaterial = await db.get('SELECT id FROM materials WHERE id = ?', [data.id]);
      if (!existingMaterial) {
        throw new Error('Material not found');
      }

      // Validate foreign keys if provided
      if (data.supplier_id) {
        const supplier = await db.get('SELECT id FROM suppliers WHERE id = ?', [data.supplier_id]);
        if (!supplier) {
          throw new Error(`Supplier with ID ${data.supplier_id} not found`);
        }
      }

      if (data.category_id) {
        const category = await db.get('SELECT id FROM material_categories WHERE id = ?', [data.category_id]);
        if (!category) {
          throw new Error(`Category with ID ${data.category_id} not found`);
        }
      }

      if (data.paper_type_id) {
        const paperType = await db.get('SELECT id FROM paper_types WHERE id = ?', [data.paper_type_id]);
        if (!paperType) {
          throw new Error(`Paper type with ID ${data.paper_type_id} not found`);
        }
      }

      await db.run('BEGIN');

      try {
        // Build dynamic update query
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (data.name !== undefined) {
          updateFields.push('name = ?');
          updateValues.push(data.name.trim());
        }
        if (data.unit !== undefined) {
          updateFields.push('unit = ?');
          updateValues.push(data.unit.trim());
        }
        if (data.quantity !== undefined) {
          updateFields.push('quantity = ?');
          updateValues.push(data.quantity);
        }
        if (data.min_quantity !== undefined) {
          updateFields.push('min_quantity = ?');
          updateValues.push(data.min_quantity);
        }
        if (data.sheet_price_single !== undefined) {
          updateFields.push('sheet_price_single = ?');
          updateValues.push(data.sheet_price_single);
        }
        if (data.category_id !== undefined) {
          updateFields.push('category_id = ?');
          updateValues.push(data.category_id);
        }
        if (data.supplier_id !== undefined) {
          updateFields.push('supplier_id = ?');
          updateValues.push(data.supplier_id);
        }
        if (data.paper_type_id !== undefined) {
          updateFields.push('paper_type_id = ?');
          updateValues.push(data.paper_type_id);
        }
        if (data.density !== undefined) {
          updateFields.push('density = ?');
          updateValues.push(data.density);
        }
        if (data.description !== undefined) {
          updateFields.push('description = ?');
          updateValues.push(data.description);
        }
        if (data.min_stock_level !== undefined) {
          updateFields.push('min_stock_level = ?');
          updateValues.push(data.min_stock_level);
        }
        if (data.max_stock_level !== undefined) {
          updateFields.push('max_stock_level = ?');
          updateValues.push(data.max_stock_level);
        }
        if (data.location !== undefined) {
          updateFields.push('location = ?');
          updateValues.push(data.location);
        }
        if (data.barcode !== undefined) {
          updateFields.push('barcode = ?');
          updateValues.push(data.barcode);
        }
        if (data.sku !== undefined) {
          updateFields.push('sku = ?');
          updateValues.push(data.sku);
        }
        if (data.notes !== undefined) {
          updateFields.push('notes = ?');
          updateValues.push(data.notes);
        }
        if (data.is_active !== undefined) {
          updateFields.push('is_active = ?');
          updateValues.push(data.is_active);
        }

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        updateValues.push(data.id);

        await db.run(`
          UPDATE materials 
          SET ${updateFields.join(', ')}
          WHERE id = ?
        `, updateValues);

        await db.run('COMMIT');

        const updatedMaterial = await this.getMaterialById(data.id);
        if (!updatedMaterial) {
          throw new Error('Failed to retrieve updated material');
        }

        logger.info('Material updated successfully', { id: data.id });
        return updatedMaterial;
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error updating material', error);
      throw error;
    }
  }

  // ============================================================================
  // DELETE OPERATIONS
  // ============================================================================

  /**
   * Delete material
   */
  static async deleteMaterial(id: number): Promise<void> {
    try {
      MaterialValidator.validateMaterialId(id);

      const db = await getDb();

      // Check if material exists
      const material = await db.get('SELECT id, name FROM materials WHERE id = ?', [id]);
      if (!material) {
        throw new Error('Material not found');
      }

      // Check if material is used in any orders
      // Note: items table doesn't have material_id column, so we skip this check for now
      // const orderUsage = await db.get(`
      //   SELECT COUNT(*) as count 
      //   FROM items 
      //   WHERE material_id = ?
      // `, [id]);

      // if (orderUsage && orderUsage.count > 0) {
      //   throw new Error(`Cannot delete material "${material.name}" - it is used in ${orderUsage.count} order(s)`);
      // }

      // Check if material has active reservations
      const reservations = await db.get(`
        SELECT COUNT(*) as count 
        FROM material_reservations 
        WHERE material_id = ? AND status = 'reserved'
      `, [id]);

      if (reservations && reservations.count > 0) {
        throw new Error(`Cannot delete material "${material.name}" - it has ${reservations.count} active reservation(s)`);
      }

      await db.run('BEGIN');

      try {
        // Delete related records first
        await db.run('DELETE FROM material_moves WHERE material_id = ?', [id]);
        await db.run('DELETE FROM material_reservations WHERE material_id = ?', [id]);
        
        // Delete material
        await db.run('DELETE FROM materials WHERE id = ?', [id]);

        await db.run('COMMIT');

        logger.info('Material deleted successfully', { id, name: material.name });
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error deleting material', error);
      throw error;
    }
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk update materials
   */
  static async bulkUpdateMaterials(updates: Array<{ id: number; quantity: number; reason?: string }>): Promise<void> {
    try {
      const db = await getDb();

      await db.run('BEGIN');

      try {
        for (const update of updates) {
          MaterialValidator.validateMaterialId(update.id);
          MaterialValidator.validateQuantity(update.quantity);

          // Get current quantity
          const material = await db.get('SELECT quantity, name FROM materials WHERE id = ?', [update.id]);
          if (!material) {
            throw new Error(`Material with ID ${update.id} not found`);
          }

          const delta = update.quantity - material.quantity;

          // Update quantity
          await db.run('UPDATE materials SET quantity = ? WHERE id = ?', [update.quantity, update.id]);

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
              update.id,
              delta >= 0 ? 'adjust_increase' : 'adjust_decrease',
              Math.abs(delta),
              delta,
              update.reason || 'Bulk update',
              null,
              null
            ]
          );
        }

        await db.run('COMMIT');
        logger.info('Bulk update completed', { count: updates.length });
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error in bulk update', error);
      throw error;
    }
  }

  /**
   * Bulk delete materials
   */
  static async bulkDeleteMaterials(ids: number[]): Promise<{ deleted: number; errors: string[] }> {
    try {
      const results = { deleted: 0, errors: [] as string[] };

      for (const id of ids) {
        try {
          await this.deleteMaterial(id);
          results.deleted++;
        } catch (error: any) {
          results.errors.push(`Material ${id}: ${error.message}`);
        }
      }

      logger.info('Bulk delete completed', results);
      return results;
    } catch (error) {
      logger.error('Error in bulk delete', error);
      throw error;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get materials by category
   */
  static async getMaterialsByCategory(categoryId: number): Promise<Material[]> {
    try {
      MaterialValidator.validateMaterialId(categoryId);
      
      const all = await ModuleMaterialService.getAllMaterials();
      return all.filter(m => (m as any).category_id === categoryId);
    } catch (error) {
      logger.error('Error getting materials by category', error);
      throw new Error('Failed to get materials by category');
    }
  }

  /**
   * Get materials by supplier
   */
  static async getMaterialsBySupplier(supplierId: number): Promise<Material[]> {
    try {
      MaterialValidator.validateMaterialId(supplierId);
      
      const all = await ModuleMaterialService.getAllMaterials();
      return all.filter(m => (m as any).supplier_id === supplierId);
    } catch (error) {
      logger.error('Error getting materials by supplier', error);
      throw new Error('Failed to get materials by supplier');
    }
  }

  /**
   * Get low stock materials
   */
  static async getLowStockMaterials(): Promise<Material[]> {
    try {
      const materials = await ModuleMaterialService.getAllMaterials();
      return materials.filter(m => m.stock_status === 'low' || m.stock_status === 'out');
    } catch (error) {
      logger.error('Error getting low stock materials', error);
      throw new Error('Failed to get low stock materials');
    }
  }

  /**
   * Get material statistics
   */
  static async getMaterialStats(): Promise<{
    total: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
  }> {
    try {
      // Compute basic stats from materials list
      const materials = await ModuleMaterialService.getAllMaterials();
      const total = materials.length;
      let inStock = 0;
      let lowStock = 0;
      let outOfStock = 0;
      let totalValue = 0;
      for (const m of materials) {
        const qty = (m as any).quantity ?? 0;
        const minQty = (m as any).min_quantity ?? 0;
        const price = (m as any).sheet_price_single ?? 0;
        totalValue += qty * price;
        if (qty === 0) {
          outOfStock++;
        } else if (qty <= Math.max(0, minQty)) {
          lowStock++;
        } else {
          inStock++;
        }
      }
      return { total, inStock, lowStock, outOfStock, totalValue };
    } catch (error) {
      logger.error('Error getting material stats', error);
      throw new Error('Failed to get material statistics');
    }
  }
}