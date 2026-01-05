import { Router } from 'express';
import { PhotoOrderController } from '../controllers/photoOrderController';

const router = Router();

// Получение доступных размеров фото
router.get('/sizes', PhotoOrderController.getAvailableSizes);

// Создание заказа фото (с загрузкой файлов)
router.post('/create', 
  PhotoOrderController.getUploadMiddleware(),
  PhotoOrderController.createOrder
);

// Получение заказов пользователя
router.get('/user/:chatId', PhotoOrderController.getUserOrders);

// Получение заказа по ID
router.get('/:orderId', PhotoOrderController.getOrderById);

// Обновление статуса заказа
router.put('/:orderId/status', PhotoOrderController.updateOrderStatus);

// Отправка обработанных фото пользователю
router.post('/:orderId/send', PhotoOrderController.sendProcessedPhotos);

export default router;
