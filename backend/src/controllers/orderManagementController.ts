import { Request, Response } from 'express';
import { OrderManagementService } from '../services/orderManagementService';
import { UserOrderPageService } from '../services/userOrderPageService';

export class OrderManagementController {
  /**
   * Получение пула заказов
   */
  static async getOrderPool(req: Request, res: Response) {
    try {
      const pool = await OrderManagementService.getOrderPool();
      
      res.json({
        success: true,
        data: pool
      });
    } catch (error) {
      console.error('❌ Error getting order pool:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении пула заказов'
      });
    }
  }

  /**
   * Назначение заказа пользователю
   */
  static async assignOrder(req: Request, res: Response) {
    try {
      const { orderId, orderType, userId, userName, date } = req.body;

      if (!orderId || !orderType || !userId || !userName || !date) {
        return res.status(400).json({
          success: false,
          message: 'Не все обязательные поля заполнены'
        });
      }

      const success = await OrderManagementService.assignOrderToUser(
        orderId, 
        orderType, 
        userId, 
        userName, 
        date
      );

      if (success) {
        res.json({
          success: true,
          message: 'Заказ успешно назначен'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Не удалось назначить заказ'
        });
      }
    } catch (error: any) {
      console.error('❌ Error assigning order:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Ошибка при назначении заказа'
      });
    }
  }

  /**
   * Завершение заказа
   */
  static async completeOrder(req: Request, res: Response) {
    try {
      const { orderId, orderType, notes } = req.body;

      if (!orderId || !orderType) {
        return res.status(400).json({
          success: false,
          message: 'ID заказа и тип обязательны'
        });
      }

      const success = await OrderManagementService.completeOrder(orderId, orderType, notes);

      if (success) {
        res.json({
          success: true,
          message: 'Заказ успешно завершен'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Не удалось завершить заказ'
        });
      }
    } catch (error) {
      console.error('❌ Error completing order:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при завершении заказа'
      });
    }
  }

  /**
   * Получение деталей заказа
   */
  static async getOrderDetails(req: Request, res: Response) {
    try {
      const { orderId, orderType } = req.params;

      if (!orderId || !orderType) {
        return res.status(400).json({
          success: false,
          message: 'ID заказа и тип обязательны'
        });
      }

      const order = await OrderManagementService.getOrderDetails(
        parseInt(orderId), 
        orderType
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Заказ не найден'
        });
      }

      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      console.error('❌ Error getting order details:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении деталей заказа'
      });
    }
  }

  /**
   * Получение страницы заказов пользователя
   */
  static async getUserOrderPage(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { date } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID пользователя обязателен'
        });
      }

      let page;
      if (date) {
        page = await UserOrderPageService.getUserOrderPage(parseInt(userId), date as string);
      } else {
        const pages = await UserOrderPageService.getUserOrderPages(parseInt(userId));
        page = pages[0]; // Текущая страница
      }

      if (!page) {
        return res.status(404).json({
          success: false,
          message: 'Страница заказов не найдена'
        });
      }

      // Получаем заказы страницы
      const orders = await UserOrderPageService.getPageOrders(page.id);

      res.json({
        success: true,
        data: {
          page,
          orders
        }
      });
    } catch (error) {
      console.error('❌ Error getting user order page:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении страницы заказов пользователя'
      });
    }
  }

  /**
   * Получение всех страниц заказов (для админов)
   */
  static async getAllOrderPages(req: Request, res: Response) {
    try {
      const { daysBack = 90 } = req.query;
      
      const pages = await UserOrderPageService.getAllOrderPages(parseInt(daysBack as string));

      res.json({
        success: true,
        data: pages
      });
    } catch (error) {
      console.error('❌ Error getting all order pages:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении страниц заказов'
      });
    }
  }

  /**
   * Создание страницы заказов пользователя на дату
   */
  static async createUserOrderPage(req: Request, res: Response) {
    try {
      const { userId, userName, date } = req.body;

      if (!userId || !userName || !date) {
        return res.status(400).json({
          success: false,
          message: 'Не все обязательные поля заполнены'
        });
      }

      const page = await UserOrderPageService.getOrCreateUserOrderPage(userId, userName, date);

      res.json({
        success: true,
        data: page
      });
    } catch (error) {
      console.error('❌ Error creating user order page:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при создании страницы заказов'
      });
    }
  }

  /**
   * Перемещение заказа между датами
   */
  static async moveOrderToDate(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, orderType, newDate, userId } = req.body;

      if (!orderId || !orderType || !newDate || !userId) {
        res.status(400).json({
          success: false,
          message: 'Необходимы orderId, orderType, newDate и userId'
        });
        return;
      }

      const result = await OrderManagementService.moveOrderToDate(
        orderId,
        orderType,
        newDate,
        userId
      );

      if (result) {
        res.json({
          success: true,
          message: 'Заказ успешно перемещен'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Ошибка при перемещении заказа'
        });
      }
    } catch (error) {
      console.error('Error moving order to date:', error);
      res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера'
      });
    }
  }

  /**
   * Получение изменений страницы с момента последнего обновления
   */
  static async getPageChanges(req: Request, res: Response): Promise<void> {
    try {
      const { pageId } = req.params;
      const { lastUpdate } = req.query;

      if (!pageId || !lastUpdate) {
        res.status(400).json({
          success: false,
          message: 'Необходимы pageId и lastUpdate'
        });
        return;
      }

      const changes = await UserOrderPageService.getPageChangesSinceLastUpdate(
        parseInt(pageId),
        lastUpdate as string
      );

      res.json({
        success: true,
        data: changes
      });
    } catch (error) {
      console.error('Error getting page changes:', error);
      res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера'
      });
    }
  }
}
