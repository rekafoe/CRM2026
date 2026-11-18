import { Request, Response } from 'express';
import { UserNotificationService } from '../services/userNotificationService';
import { StockMonitoringService } from '../../../services/stockMonitoringService';
import { logger } from '../../../utils/logger';

export class UserNotificationController {
  /**
   * Получение всех пользователей
   */
  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await UserNotificationService.getAllUsers();
      
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      logger.error('Error getting users', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения пользователей',
        error: error.message
      });
    }
  }

  /**
   * Получение пользователей по роли
   */
  static async getUsersByRole(req: Request, res: Response) {
    try {
      const { role } = req.params;
      const users = await UserNotificationService.getUsersByRole(role);
      
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      logger.error('Error getting users by role', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения пользователей по роли',
        error: error.message
      });
    }
  }

  /**
   * Отправка уведомления конкретному пользователю
   */
  static async sendToUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { title, message, priority, type, data } = req.body;
      
      const notification = {
        title,
        message,
        priority: priority || 'medium',
        type: type || 'general',
        data
      };
      
      const success = await UserNotificationService.sendToUser(parseInt(userId), notification);
      
      if (success) {
        res.json({
          success: true,
          message: 'Уведомление отправлено пользователю'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Не удалось отправить уведомление пользователю'
        });
      }
    } catch (error: any) {
      logger.error('Error sending notification to user', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки уведомления',
        error: error.message
      });
    }
  }

  /**
   * Отправка уведомления всем пользователям определенной роли
   */
  static async sendToRole(req: Request, res: Response) {
    try {
      const { role } = req.params;
      const { title, message, priority, type, data } = req.body;
      
      const notification = {
        title,
        message,
        priority: priority || 'medium',
        type: type || 'general',
        data
      };
      
      const sentCount = await UserNotificationService.sendToRole(role, notification);
      
      res.json({
        success: true,
        message: `Уведомление отправлено ${sentCount} пользователям роли ${role}`,
        sentCount
      });
    } catch (error: any) {
      logger.error('Error sending notification to role', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки уведомления роли',
        error: error.message
      });
    }
  }

  /**
   * Отправка уведомления всем пользователям
   */
  static async sendToAllUsers(req: Request, res: Response) {
    try {
      const { title, message, priority, type, data } = req.body;
      
      const notification = {
        title,
        message,
        priority: priority || 'medium',
        type: type || 'general',
        data
      };
      
      const sentCount = await UserNotificationService.sendToAllUsers(notification);
      
      res.json({
        success: true,
        message: `Уведомление отправлено ${sentCount} пользователям`,
        sentCount
      });
    } catch (error: any) {
      logger.error('Error sending notification to all users', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки уведомления всем пользователям',
        error: error.message
      });
    }
  }

  /**
   * Свежий дайджест остатков менеджерам и админам с low_stock.
   * Числа из тела запроса не используются.
   */
  static async sendLowStockAlert(_req: Request, res: Response) {
    try {
      const result = await StockMonitoringService.broadcastFreshDigest();
      res.json({
        success: true,
        message: `Дайджест остатков отправлен ${result.sent} менеджерам и админам`,
        sentCount: result.sent,
        count: result.count
      });
    } catch (error: any) {
      logger.error('Error sending low stock alert', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки уведомления о низких остатках',
        error: error.message
      });
    }
  }

  /**
   * Отправка уведомления о новых заказах
   */
  static async sendNewOrderAlert(req: Request, res: Response) {
    try {
      const { orderId, customerName, totalAmount } = req.body;
      
      const sentCount = await UserNotificationService.sendNewOrderAlert(
        orderId,
        customerName,
        totalAmount
      );
      
      res.json({
        success: true,
        message: `Уведомление о новом заказе отправлено ${sentCount} пользователям`,
        sentCount
      });
    } catch (error: any) {
      logger.error('Error sending new order alert', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки уведомления о новом заказе',
        error: error.message
      });
    }
  }

  /**
   * Отправка системного уведомления
   */
  static async sendSystemAlert(req: Request, res: Response) {
    try {
      const { title, message, priority } = req.body;
      
      const sentCount = await UserNotificationService.sendSystemAlert(
        title,
        message,
        priority
      );
      
      res.json({
        success: true,
        message: `Системное уведомление отправлено ${sentCount} пользователям`,
        sentCount
      });
    } catch (error: any) {
      logger.error('Error sending system alert', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки системного уведомления',
        error: error.message
      });
    }
  }

  /**
   * Обновление Telegram chat_id для пользователя
   */
  static async updateUserTelegramChatId(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { chatId } = req.body;
      
      const success = await UserNotificationService.updateUserTelegramChatId(
        parseInt(userId),
        chatId
      );
      
      if (success) {
        res.json({
          success: true,
          message: 'Telegram chat_id обновлен'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Не удалось обновить Telegram chat_id'
        });
      }
    } catch (error: any) {
      logger.error('Error updating user Telegram chat_id', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления Telegram chat_id',
        error: error.message
      });
    }
  }

  /**
   * Получение пользователей, которые писали боту
   */
  static async getBotUsers(req: Request, res: Response) {
    try {
      const users = await UserNotificationService.getBotUsers();
      
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      logger.error('Error getting bot users', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения пользователей бота',
        error: error.message
      });
    }
  }

  /**
   * Отправка тестового сообщения всем пользователям бота
   */
  static async sendTestMessageToBotUsers(req: Request, res: Response) {
    try {
      const sentCount = await UserNotificationService.sendTestMessageToBotUsers();
      
      res.json({
        success: true,
        message: `Тестовое сообщение отправлено ${sentCount} пользователям бота`,
        sentCount
      });
    } catch (error: any) {
      logger.error('Error sending test message to bot users', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки тестового сообщения',
        error: error.message
      });
    }
  }

  /**
   * Тот же свежий дайджест, что и у планировщика. Не getUpdates и не числа из формы.
   */
  static async sendLowStockToBotUsers(_req: Request, res: Response) {
    try {
      const result = await StockMonitoringService.broadcastFreshDigest();
      res.json({
        success: true,
        message: `Дайджест остатков отправлен ${result.sent} менеджерам и админам`,
        sentCount: result.sent,
        count: result.count
      });
    } catch (error: any) {
      logger.error('Error sending low stock to bot users', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки уведомления о низких остатках',
        error: error.message
      });
    }
  }
}
