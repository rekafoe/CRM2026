import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { UserNotificationController } from '../modules/notifications/controllers/userNotificationController';
import { TelegramUserController } from '../controllers/telegramUserController';
import { TelegramWebhookController } from '../controllers/telegramWebhookController';
import { TelegramSettingsController } from '../controllers/telegramSettingsController';

const router = Router();

// Telegram уведомления
router.get('/telegram/config', NotificationController.getTelegramConfig);
router.post('/telegram/test', NotificationController.sendTestNotification);
router.post('/telegram/configure', NotificationController.configureTelegram);

// Telegram Webhook
router.post('/telegram/webhook', TelegramWebhookController.handleWebhook);
router.get('/telegram/webhook/info', TelegramWebhookController.getWebhookInfo);
router.post('/telegram/webhook/set', TelegramWebhookController.setWebhook);

// Telegram Settings
router.get('/telegram/settings', TelegramSettingsController.getSettings);
router.put('/telegram/settings', TelegramSettingsController.updateSettings);

// Мониторинг запасов
router.get('/stock-alerts', NotificationController.getStockAlerts);
router.post('/stock-alerts/:alertId/resolve', NotificationController.resolveStockAlert);
router.post('/stock/check', NotificationController.checkStockLevels);
router.get('/stock-monitoring/config', NotificationController.getStockMonitoringConfig);
router.put('/stock-monitoring/config', NotificationController.updateStockMonitoringConfig);

// Автоматические заказы
router.post('/auto-orders', NotificationController.createAutoOrder);
router.get('/auto-orders', NotificationController.getAutoOrders);
router.post('/auto-orders/:orderId/approve', NotificationController.approveAutoOrder);
router.post('/auto-orders/:orderId/send', NotificationController.sendAutoOrder);
router.post('/auto-orders/:orderId/delivered', NotificationController.markAutoOrderDelivered);
router.get('/auto-orders/config', NotificationController.getAutoOrderConfig);
router.put('/auto-orders/config', NotificationController.updateAutoOrderConfig);

// Пользовательские уведомления
router.get('/users', UserNotificationController.getAllUsers);
router.get('/users/role/:role', UserNotificationController.getUsersByRole);
router.post('/users/:userId/send', UserNotificationController.sendToUser);
router.post('/users/role/:role/send', UserNotificationController.sendToRole);
router.post('/users/send-all', UserNotificationController.sendToAllUsers);
router.post('/users/low-stock-alert', UserNotificationController.sendLowStockAlert);
router.post('/users/new-order-alert', UserNotificationController.sendNewOrderAlert);
router.post('/users/system-alert', UserNotificationController.sendSystemAlert);
router.put('/users/:userId/telegram-chat-id', UserNotificationController.updateUserTelegramChatId);

// Работа с пользователями бота
router.get('/bot/users', UserNotificationController.getBotUsers);
router.post('/bot/test-message', UserNotificationController.sendTestMessageToBotUsers);
router.post('/bot/low-stock', UserNotificationController.sendLowStockToBotUsers);

// Управление Telegram пользователями
router.get('/telegram-users', TelegramUserController.getAllUsers);
router.get('/telegram-users/active', TelegramUserController.getActiveUsers);
router.get('/telegram-users/role/:role', TelegramUserController.getUsersByRole);
router.get('/telegram-users/chat/:chatId', TelegramUserController.getUserByChatId);
router.post('/telegram-users', TelegramUserController.createUser);
router.put('/telegram-users/:id', TelegramUserController.updateUser);
router.delete('/telegram-users/:id', TelegramUserController.deleteUser);
router.get('/telegram-users/stats', TelegramUserController.getStats);

export default router;
