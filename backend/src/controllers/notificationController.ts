import { Request, Response } from 'express';
import { TelegramService } from '../services/telegramService';
import { StockMonitoringService } from '../services/stockMonitoringService';
import { AutoOrderService } from '../services/autoOrderService';
import { MaterialService } from '../services/materialService';

export class NotificationController {
  /**
   * Тестовая отправка уведомления в Telegram
   */
  static async sendTestNotification(req: Request, res: Response) {
    try {
      const { message } = req.body;
      const testMessage = message || '🧪 *Тестовое сообщение*\n\nСистема уведомлений работает корректно!';
      
      const result = await TelegramService.sendToAllUsers(testMessage);
      
      res.json({ 
        success: true, 
        message: `Тестовое уведомление отправлено: ${result.sent} успешно, ${result.failed} ошибок`,
        data: result
      });
    } catch (error: any) {
      console.error('❌ Error sending test notification:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Ошибка отправки уведомления',
        error: error.message 
      });
    }
  }

  /**
   * Получение конфигурации Telegram
   */
  static async getTelegramConfig(req: Request, res: Response) {
    try {
      const config = TelegramService.getConfig();
      
      res.json({
        success: true,
        data: config
      });
    } catch (error: any) {
      console.error('❌ Error getting Telegram config:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения конфигурации Telegram',
        error: error.message
      });
    }
  }

  /**
   * Настройка Telegram бота
   */
  static async configureTelegram(req: Request, res: Response) {
    try {
      const { botToken, chatId, enabled } = req.body;
      
      console.log('🔧 Configuring Telegram:', { 
        botToken: botToken ? `${botToken.substring(0, 10)}...` : 'empty',
        chatId: chatId || 'empty',
        enabled 
      });
      
      if (!botToken) {
        return res.status(400).json({
          success: false,
          message: 'Требуется botToken'
        });
      }

      TelegramService.initialize({
        botToken,
        chatId: chatId || '',
        enabled: enabled !== false
      });

      res.json({
        success: true,
        message: 'Конфигурация Telegram обновлена'
      });
    } catch (error: any) {
      console.error('❌ Error configuring Telegram:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка настройки Telegram',
        error: error.message
      });
    }
  }

  /**
   * Получение активных предупреждений о запасах
   */
  static async getStockAlerts(req: Request, res: Response) {
    console.log('🔍 getStockAlerts called');
    try {
      console.log('📊 Calling MaterialService.getLowStockMaterials()...');
      const materials = await MaterialService.getLowStockMaterials();
      console.log(`✅ Got ${materials.length} low stock materials:`, materials);
      
      // Преобразуем в формат StockAlert
      const alerts = materials.map((material: any) => ({
        id: material.id,
        materialId: material.id,
        materialName: material.name,
        currentQuantity: material.quantity,
        minQuantity: material.min_quantity,
        alertLevel: material.quantity <= 0 ? 'out_of_stock' : 'low',
        createdAt: new Date().toISOString(),
        isResolved: false
      }));
      
      res.json({
        success: true,
        data: alerts
      });
    } catch (error: any) {
      console.error('❌ Error getting stock alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения предупреждений',
        error: error.message
      });
    }
  }

  /**
   * Отметка предупреждения как решенного
   */
  static async resolveStockAlert(req: Request, res: Response) {
    try {
      const { alertId } = req.params;
      
      await StockMonitoringService.resolveAlert(parseInt(alertId));
      
      res.json({
        success: true,
        message: 'Предупреждение отмечено как решенное'
      });
    } catch (error: any) {
      console.error('❌ Error resolving stock alert:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления предупреждения',
        error: error.message
      });
    }
  }

  /**
   * Ручная проверка запасов
   */
  static async checkStockLevels(req: Request, res: Response) {
    try {
      const alerts = await StockMonitoringService.checkStockLevels();
      
      res.json({
        success: true,
        message: `Проверка завершена. Найдено ${alerts.length} предупреждений`,
        data: alerts
      });
    } catch (error: any) {
      console.error('❌ Error checking stock levels:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка проверки запасов',
        error: error.message
      });
    }
  }

  /**
   * Получение конфигурации мониторинга запасов
   */
  static async getStockMonitoringConfig(req: Request, res: Response) {
    try {
      const config = StockMonitoringService.getConfig();
      
      res.json({
        success: true,
        data: config
      });
    } catch (error: any) {
      console.error('❌ Error getting stock monitoring config:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения конфигурации',
        error: error.message
      });
    }
  }

  /**
   * Обновление конфигурации мониторинга запасов
   */
  static async updateStockMonitoringConfig(req: Request, res: Response) {
    try {
      const config = req.body;
      
      StockMonitoringService.updateConfig(config);
      
      res.json({
        success: true,
        message: 'Конфигурация мониторинга обновлена'
      });
    } catch (error: any) {
      console.error('❌ Error updating stock monitoring config:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления конфигурации',
        error: error.message
      });
    }
  }

  /**
   * Создание автоматического заказа
   */
  static async createAutoOrder(req: Request, res: Response) {
    try {
      const { materialIds } = req.body;
      
      const order = await AutoOrderService.createAutoOrder(materialIds);
      
      if (order) {
        res.json({
          success: true,
          message: 'Автоматический заказ создан',
          data: order
        });
      } else {
        res.json({
          success: false,
          message: 'Нет материалов для автоматического заказа'
        });
      }
    } catch (error: any) {
      console.error('❌ Error creating auto order:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка создания автоматического заказа',
        error: error.message
      });
    }
  }

  /**
   * Получение автоматических заказов
   */
  static async getAutoOrders(req: Request, res: Response) {
    try {
      const { status } = req.query;
      
      const orders = await AutoOrderService.getAutoOrders(status as string);
      
      res.json({
        success: true,
        data: orders
      });
    } catch (error: any) {
      console.error('❌ Error getting auto orders:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения автоматических заказов',
        error: error.message
      });
    }
  }

  /**
   * Одобрение автоматического заказа
   */
  static async approveAutoOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      
      await AutoOrderService.approveOrder(parseInt(orderId));
      
      res.json({
        success: true,
        message: 'Заказ одобрен'
      });
    } catch (error: any) {
      console.error('❌ Error approving auto order:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка одобрения заказа',
        error: error.message
      });
    }
  }

  /**
   * Отправка заказа поставщику
   */
  static async sendAutoOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      
      await AutoOrderService.sendOrder(parseInt(orderId));
      
      res.json({
        success: true,
        message: 'Заказ отправлен поставщику'
      });
    } catch (error: any) {
      console.error('❌ Error sending auto order:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки заказа',
        error: error.message
      });
    }
  }

  /**
   * Отметка заказа как доставленного
   */
  static async markAutoOrderDelivered(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      
      await AutoOrderService.markAsDelivered(parseInt(orderId));
      
      res.json({
        success: true,
        message: 'Заказ отмечен как доставленный'
      });
    } catch (error: any) {
      console.error('❌ Error marking auto order as delivered:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления статуса заказа',
        error: error.message
      });
    }
  }

  /**
   * Получение конфигурации автоматических заказов
   */
  static async getAutoOrderConfig(req: Request, res: Response) {
    try {
      const config = AutoOrderService.getConfig();
      
      res.json({
        success: true,
        data: config
      });
    } catch (error: any) {
      console.error('❌ Error getting auto order config:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения конфигурации',
        error: error.message
      });
    }
  }

  /**
   * Обновление конфигурации автоматических заказов
   */
  static async updateAutoOrderConfig(req: Request, res: Response) {
    try {
      const config = req.body;
      
      AutoOrderService.updateConfig(config);
      
      res.json({
        success: true,
        message: 'Конфигурация автоматических заказов обновлена'
      });
    } catch (error: any) {
      console.error('❌ Error updating auto order config:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления конфигурации',
        error: error.message
      });
    }
  }
}
