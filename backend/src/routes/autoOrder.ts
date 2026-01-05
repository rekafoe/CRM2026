import { Router } from 'express';
import { AutoOrderController } from '../controllers/autoOrderController';
import { asyncHandler, authenticate } from '../middleware';

const router = Router();

// Правила авто-заказа
router.get('/rules', authenticate, asyncHandler(AutoOrderController.getRules));
router.post('/rules', authenticate, asyncHandler(AutoOrderController.createRule));
router.put('/rules/:id', authenticate, asyncHandler(AutoOrderController.updateRule));
router.delete('/rules/:id', authenticate, asyncHandler(AutoOrderController.deleteRule));

// Заявки на авто-заказ
router.get('/requests', authenticate, asyncHandler(AutoOrderController.getRequests));
router.post('/requests', authenticate, asyncHandler(AutoOrderController.createRequest));
router.put('/requests/:id/status', authenticate, asyncHandler(AutoOrderController.updateRequestStatus));

// Проверка материалов
router.post('/check', authenticate, asyncHandler(AutoOrderController.checkMaterials));

// Шаблоны сообщений
router.get('/templates', authenticate, asyncHandler(AutoOrderController.getTemplates));
router.post('/templates', authenticate, asyncHandler(AutoOrderController.createTemplate));

// Генерация сообщений
router.post('/generate-message', authenticate, asyncHandler(AutoOrderController.generateMessage));

export default router;
