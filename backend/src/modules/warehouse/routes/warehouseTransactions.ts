import { Router } from 'express';
import { WarehouseTransactionController } from '../controllers/warehouseTransactionController';

const router = Router();

// Основные операции
router.post('/execute', WarehouseTransactionController.executeTransaction);
router.post('/spend', WarehouseTransactionController.spendMaterial);
router.post('/add', WarehouseTransactionController.addMaterial);
router.post('/adjust', WarehouseTransactionController.adjustStock);

// Резервирование
router.post('/reserve', WarehouseTransactionController.reserveMaterials);
router.post('/unreserve', WarehouseTransactionController.unreserveMaterials);

// Утилиты
router.post('/check-availability', WarehouseTransactionController.checkAvailability);
router.get('/history', WarehouseTransactionController.getOperationHistory);

export default router;
