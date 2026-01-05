import { Request, Response } from 'express';
import { TelegramUserService, CreateTelegramUserRequest, UpdateTelegramUserRequest } from '../services/telegramUserService';

export class TelegramUserController {
  /**
   * Получение всех Telegram пользователей
   */
  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await TelegramUserService.getAllUsers();
      
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      console.error('❌ Error getting telegram users:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения пользователей Telegram',
        error: error.message
      });
    }
  }

  /**
   * Получение активных Telegram пользователей
   */
  static async getActiveUsers(req: Request, res: Response) {
    try {
      const users = await TelegramUserService.getActiveUsers();
      
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      console.error('❌ Error getting active telegram users:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения активных пользователей Telegram',
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
      const users = await TelegramUserService.getUsersByRole(role);
      
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      console.error('❌ Error getting telegram users by role:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения пользователей Telegram по роли',
        error: error.message
      });
    }
  }

  /**
   * Получение пользователя по chat_id
   */
  static async getUserByChatId(req: Request, res: Response) {
    try {
      const { chatId } = req.params;
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь Telegram не найден'
        });
      }
      
      res.json({
        success: true,
        data: user
      });
    } catch (error: any) {
      console.error('❌ Error getting telegram user by chat_id:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения пользователя Telegram',
        error: error.message
      });
    }
  }

  /**
   * Создание нового Telegram пользователя
   */
  static async createUser(req: Request, res: Response) {
    try {
      const userData: CreateTelegramUserRequest = req.body;
      
      if (!userData.chat_id) {
        return res.status(400).json({
          success: false,
          message: 'Требуется chat_id'
        });
      }

      const user = await TelegramUserService.createUser(userData);
      
      res.status(201).json({
        success: true,
        data: user,
        message: 'Пользователь Telegram создан успешно'
      });
    } catch (error: any) {
      console.error('❌ Error creating telegram user:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка создания пользователя Telegram',
        error: error.message
      });
    }
  }

  /**
   * Обновление Telegram пользователя
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userData: UpdateTelegramUserRequest = req.body;
      
      const user = await TelegramUserService.updateUser(parseInt(id), userData);
      
      res.json({
        success: true,
        data: user,
        message: 'Пользователь Telegram обновлен успешно'
      });
    } catch (error: any) {
      console.error('❌ Error updating telegram user:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления пользователя Telegram',
        error: error.message
      });
    }
  }

  /**
   * Удаление Telegram пользователя
   */
  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const deleted = await TelegramUserService.deleteUser(parseInt(id));
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь Telegram не найден'
        });
      }
      
      res.json({
        success: true,
        message: 'Пользователь Telegram удален успешно'
      });
    } catch (error: any) {
      console.error('❌ Error deleting telegram user:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка удаления пользователя Telegram',
        error: error.message
      });
    }
  }

  /**
   * Получение статистики Telegram пользователей
   */
  static async getStats(req: Request, res: Response) {
    try {
      const stats = await TelegramUserService.getStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      console.error('❌ Error getting telegram users stats:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка получения статистики пользователей Telegram',
        error: error.message
      });
    }
  }
}
