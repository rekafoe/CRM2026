import { Router } from 'express';
import { OrderManagementController } from '../controllers/orderManagementController';

const router = Router();

// Получение пула заказов
router.get('/pool', OrderManagementController.getOrderPool);

// Назначение заказа пользователю
router.post('/assign', OrderManagementController.assignOrder);

// Завершение заказа
router.post('/complete', OrderManagementController.completeOrder);

// Получение деталей заказа
router.get('/:orderId/:orderType', OrderManagementController.getOrderDetails);

// Получение страницы заказов пользователя
router.get('/pages/user/:userId', OrderManagementController.getUserOrderPage);

// Получение всех страниц заказов (для админов)
router.get('/pages/all', OrderManagementController.getAllOrderPages);

// Создание страницы заказов пользователя
router.post('/pages/create', OrderManagementController.createUserOrderPage);

// Перемещение заказа между датами
router.post('/move-order', OrderManagementController.moveOrderToDate);
router.get('/pages/:pageId/changes', OrderManagementController.getPageChanges);

export default router;
