import { Request, Response } from 'express';
import { WarehouseService, MaterialFilters, ReservationRequest } from '../services/warehouseService';
import { logger } from '../utils/logger';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

interface WarehouseRequest extends Request {
  query: {
    categoryId?: string;
    supplierId?: string;
    search?: string;
    stockStatus?: string;
    minQuantity?: string;
    maxQuantity?: string;
  };
}

interface ReservationRequestBody {
  reservations: ReservationRequest[];
}

interface ConfirmReservationBody {
  reservationIds: number[];
}

interface UpdateQuantityBody {
  quantity: number;
  reason?: string;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

class ResponseHelper {
  static success<T>(res: Response, data: T, message?: string) {
    res.json({
      success: true,
      data,
      message
    });
  }

  static error(res: Response, statusCode: number, message: string, details?: any) {
    res.status(statusCode).json({
      success: false,
      error: message,
      details
    });
  }

  static validationError(res: Response, message: string, field?: string) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message,
      field
    });
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

class ControllerValidator {
  static validateMaterialId(id: string): number {
    const materialId = parseInt(id);
    if (isNaN(materialId) || materialId <= 0) {
      throw new Error('Invalid material ID');
    }
    return materialId;
  }

  static validateFilters(query: any): MaterialFilters {
    const filters: MaterialFilters = {};

    if (query.categoryId) {
      const categoryId = parseInt(query.categoryId);
      if (!isNaN(categoryId) && categoryId > 0) {
        filters.categoryId = categoryId;
      }
    }

    if (query.supplierId) {
      const supplierId = parseInt(query.supplierId);
      if (!isNaN(supplierId) && supplierId > 0) {
        filters.supplierId = supplierId;
      }
    }

    if (query.search && query.search.trim()) {
      filters.search = query.search.trim();
    }

    if (query.stockStatus && ['ok', 'low', 'warning', 'out'].includes(query.stockStatus)) {
      filters.stockStatus = query.stockStatus as any;
    }

    if (query.minQuantity) {
      const minQuantity = parseFloat(query.minQuantity);
      if (!isNaN(minQuantity) && minQuantity >= 0) {
        filters.minQuantity = minQuantity;
      }
    }

    if (query.maxQuantity) {
      const maxQuantity = parseFloat(query.maxQuantity);
      if (!isNaN(maxQuantity) && maxQuantity >= 0) {
        filters.maxQuantity = maxQuantity;
      }
    }

    return filters;
  }

  static validateReservationRequest(body: any): ReservationRequest[] {
    if (!body.reservations || !Array.isArray(body.reservations)) {
      throw new Error('Reservations array is required');
    }

    if (body.reservations.length === 0) {
      throw new Error('At least one reservation is required');
    }

    return body.reservations.map((reservation: any, index: number) => {
      if (!reservation.material_id || !reservation.quantity) {
        throw new Error(`Reservation ${index + 1}: material_id and quantity are required`);
      }

      const materialId = parseInt(reservation.material_id);
      const quantity = parseFloat(reservation.quantity);

      if (isNaN(materialId) || materialId <= 0) {
        throw new Error(`Reservation ${index + 1}: invalid material_id`);
      }

      if (isNaN(quantity) || quantity <= 0) {
        throw new Error(`Reservation ${index + 1}: invalid quantity`);
      }

      return {
        material_id: materialId,
        quantity,
        order_id: reservation.order_id ? parseInt(reservation.order_id) : undefined,
        reason: reservation.reason,
        expires_in_hours: reservation.expires_in_hours ? parseInt(reservation.expires_in_hours) : undefined
      };
    });
  }

  static validateConfirmReservation(body: any): number[] {
    if (!body.reservationIds || !Array.isArray(body.reservationIds)) {
      throw new Error('reservationIds array is required');
    }

    if (body.reservationIds.length === 0) {
      throw new Error('At least one reservation ID is required');
    }

    return body.reservationIds.map((id: any, index: number) => {
      const reservationId = parseInt(id);
      if (isNaN(reservationId) || reservationId <= 0) {
        throw new Error(`Invalid reservation ID at index ${index}`);
      }
      return reservationId;
    });
  }

  static validateUpdateQuantity(body: any): { quantity: number; reason?: string } {
    if (body.quantity === undefined || body.quantity === null) {
      throw new Error('Quantity is required');
    }

    const quantity = parseFloat(body.quantity);
    if (isNaN(quantity) || quantity < 0) {
      throw new Error('Quantity must be a non-negative number');
    }

    return {
      quantity,
      reason: body.reason
    };
  }
}

// ============================================================================
// MAIN CONTROLLER
// ============================================================================

export class WarehouseController {
  // ============================================================================
  // MATERIAL ENDPOINTS
  // ============================================================================

  /**
   * GET /api/warehouse/materials
   * Get all materials with optional filtering
   */
  static getAllMaterials = async (req: WarehouseRequest, res: Response) => {
    try {
      const filters = ControllerValidator.validateFilters(req.query);
      const materials = await WarehouseService.getAllMaterials(filters);
      
      ResponseHelper.success(res, materials, 'Materials retrieved successfully');
    } catch (error: any) {
      logger.error('Error getting materials', error);
      
      if (error.message.includes('Validation error')) {
        ResponseHelper.validationError(res, error.message);
      } else {
        ResponseHelper.error(res, 500, 'Failed to get materials', error.message);
      }
    }
  };

  /**
   * GET /api/warehouse/materials/:id
   * Get material by ID
   */
  static getMaterialById = async (req: Request, res: Response) => {
    try {
      const materialId = ControllerValidator.validateMaterialId(req.params.id);
      const material = await WarehouseService.getMaterialById(materialId);
      
      if (!material) {
        ResponseHelper.error(res, 404, 'Material not found');
        return;
      }
      
      ResponseHelper.success(res, material, 'Material retrieved successfully');
    } catch (error: any) {
      logger.error('Error getting material by ID', error);
      
      if (error.message.includes('Invalid material ID')) {
        ResponseHelper.validationError(res, error.message);
      } else {
        ResponseHelper.error(res, 500, 'Failed to get material', error.message);
      }
    }
  };

  /**
   * PUT /api/warehouse/materials/:id/quantity
   * Update material quantity
   */
  static updateMaterialQuantity = async (req: Request, res: Response) => {
    try {
      const materialId = ControllerValidator.validateMaterialId(req.params.id);
      const { quantity, reason } = ControllerValidator.validateUpdateQuantity(req.body);
      
      await WarehouseService.updateMaterialQuantity(materialId, quantity, reason);
      
      ResponseHelper.success(res, null, 'Material quantity updated successfully');
    } catch (error: any) {
      logger.error('Error updating material quantity', error);
      
      if (error.message.includes('Invalid material ID') || error.message.includes('Quantity')) {
        ResponseHelper.validationError(res, error.message);
      } else if (error.message.includes('Material not found')) {
        ResponseHelper.error(res, 404, error.message);
      } else {
        ResponseHelper.error(res, 500, 'Failed to update material quantity', error.message);
      }
    }
  };

  // ============================================================================
  // RESERVATION ENDPOINTS
  // ============================================================================

  /**
   * POST /api/warehouse/reservations
   * Create material reservations
   */
  static createReservations = async (req: Request, res: Response) => {
    try {
      const reservations = ControllerValidator.validateReservationRequest(req.body);
      const createdReservations = await WarehouseService.reserveMaterials(reservations);
      
      ResponseHelper.success(res, createdReservations, 'Reservations created successfully');
    } catch (error: any) {
      logger.error('Error creating reservations', error);
      
      if (error.message.includes('required') || error.message.includes('invalid')) {
        ResponseHelper.validationError(res, error.message);
      } else if (error.message.includes('Insufficient material')) {
        ResponseHelper.error(res, 409, error.message);
      } else {
        ResponseHelper.error(res, 500, 'Failed to create reservations', error.message);
      }
    }
  };

  /**
   * POST /api/warehouse/reservations/confirm
   * Confirm reservations (deduct materials)
   */
  static confirmReservations = async (req: Request, res: Response) => {
    try {
      const reservationIds = ControllerValidator.validateConfirmReservation(req.body);
      await WarehouseService.confirmReservations(reservationIds);
      
      ResponseHelper.success(res, null, 'Reservations confirmed successfully');
    } catch (error: any) {
      logger.error('Error confirming reservations', error);
      
      if (error.message.includes('required') || error.message.includes('Invalid')) {
        ResponseHelper.validationError(res, error.message);
      } else if (error.message.includes('not found')) {
        ResponseHelper.error(res, 404, error.message);
      } else {
        ResponseHelper.error(res, 500, 'Failed to confirm reservations', error.message);
      }
    }
  };

  /**
   * POST /api/warehouse/reservations/cancel
   * Cancel reservations
   */
  static cancelReservations = async (req: Request, res: Response) => {
    try {
      const reservationIds = ControllerValidator.validateConfirmReservation(req.body);
      await WarehouseService.cancelReservations(reservationIds);
      
      ResponseHelper.success(res, null, 'Reservations cancelled successfully');
    } catch (error: any) {
      logger.error('Error cancelling reservations', error);
      
      if (error.message.includes('required') || error.message.includes('Invalid')) {
        ResponseHelper.validationError(res, error.message);
      } else {
        ResponseHelper.error(res, 500, 'Failed to cancel reservations', error.message);
      }
    }
  };

  // ============================================================================
  // STATISTICS ENDPOINTS
  // ============================================================================

  /**
   * GET /api/warehouse/stats
   * Get warehouse statistics
   */
  static getWarehouseStats = async (req: Request, res: Response) => {
    try {
      const stats = await WarehouseService.getWarehouseStats();
      ResponseHelper.success(res, stats, 'Warehouse statistics retrieved successfully');
    } catch (error: any) {
      logger.error('Error getting warehouse stats', error);
      ResponseHelper.error(res, 500, 'Failed to get warehouse statistics', error.message);
    }
  };

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  /**
   * POST /api/warehouse/cleanup
   * Clean up expired reservations
   */
  static cleanupExpiredReservations = async (req: Request, res: Response) => {
    try {
      const cleanedCount = await WarehouseService.cleanupExpiredReservations();
      ResponseHelper.success(res, { cleanedCount }, 'Expired reservations cleaned up successfully');
    } catch (error: any) {
      logger.error('Error cleaning up expired reservations', error);
      ResponseHelper.error(res, 500, 'Failed to cleanup expired reservations', error.message);
    }
  };

  /**
   * GET /api/warehouse/health
   * Health check endpoint
   */
  static healthCheck = async (req: Request, res: Response) => {
    try {
      // Simple health check - try to get basic stats
      const stats = await WarehouseService.getWarehouseStats();
      
      ResponseHelper.success(res, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: {
          totalMaterials: stats.totalMaterials,
          alerts: stats.alerts
        }
      }, 'Warehouse service is healthy');
    } catch (error: any) {
      logger.error('Warehouse health check failed', error);
      ResponseHelper.error(res, 503, 'Warehouse service is unhealthy', error.message);
    }
  };
}
