import { Router } from 'express';
import { WarehouseController } from '../controllers/warehouseController';
import { authenticate } from '../middleware';

const router = Router();

// Apply authentication to all warehouse routes
router.use(authenticate);

// ============================================================================
// MATERIAL ROUTES
// ============================================================================

/**
 * GET /api/warehouse/materials
 * Get all materials with optional filtering
 * Query params: categoryId, supplierId, search, stockStatus, minQuantity, maxQuantity
 */
router.get('/materials', WarehouseController.getAllMaterials);

/**
 * GET /api/warehouse/materials/:id
 * Get material by ID
 */
router.get('/materials/:id', WarehouseController.getMaterialById);

/**
 * PUT /api/warehouse/materials/:id/quantity
 * Update material quantity
 * Body: { quantity: number, reason?: string }
 */
router.put('/materials/:id/quantity', WarehouseController.updateMaterialQuantity);

// ============================================================================
// RESERVATION ROUTES
// ============================================================================

/**
 * POST /api/warehouse/reservations
 * Create material reservations
 * Body: { reservations: [{ material_id: number, quantity: number, order_id?: number, reason?: string, expires_in_hours?: number }] }
 */
router.post('/reservations', WarehouseController.createReservations);

/**
 * POST /api/warehouse/reservations/confirm
 * Confirm reservations (deduct materials)
 * Body: { reservationIds: number[] }
 */
router.post('/reservations/confirm', WarehouseController.confirmReservations);

/**
 * POST /api/warehouse/reservations/cancel
 * Cancel reservations
 * Body: { reservationIds: number[] }
 */
router.post('/reservations/cancel', WarehouseController.cancelReservations);

// ============================================================================
// STATISTICS ROUTES
// ============================================================================

/**
 * GET /api/warehouse/stats
 * Get warehouse statistics
 */
router.get('/stats', WarehouseController.getWarehouseStats);

// ============================================================================
// UTILITY ROUTES
// ============================================================================

/**
 * POST /api/warehouse/cleanup
 * Clean up expired reservations
 */
router.post('/cleanup', WarehouseController.cleanupExpiredReservations);

/**
 * GET /api/warehouse/health
 * Health check endpoint
 */
router.get('/health', WarehouseController.healthCheck);

export default router;
