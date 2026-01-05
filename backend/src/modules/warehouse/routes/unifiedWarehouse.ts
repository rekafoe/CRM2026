import { Router } from 'express';
import { UnifiedWarehouseController } from '../controllers/unifiedWarehouseController';

const router = Router();

// Получение материалов и статистики
router.get('/materials', UnifiedWarehouseController.getAllMaterials);
router.get('/stats', UnifiedWarehouseController.getWarehouseStats);

// Резервирование материалов
router.post('/reservations', UnifiedWarehouseController.reserveMaterials);
router.post('/reservations/confirm', UnifiedWarehouseController.confirmReservations);
router.post('/reservations/cancel', UnifiedWarehouseController.cancelReservations);
router.get('/reservations/order/:orderId', UnifiedWarehouseController.getReservationsByOrder);

// Синхронизация
router.post('/sync-pricing', UnifiedWarehouseController.syncWithPricing);

export default router;

