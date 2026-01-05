import { Request, Response } from 'express';
import { TelegramSettingsService } from '../services/telegramSettingsService';

export class TelegramSettingsController {
  /**
   * Получение всех настроек Telegram
   */
  static async getSettings(req: Request, res: Response) {
    try {
      const settings = await TelegramSettingsService.getAllSettings();
      res.json({ success: true, data: settings });
    } catch (error: any) {
      console.error('❌ Error getting Telegram settings:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Ошибка получения настроек Telegram', 
        error: error.message 
      });
    }
  }

  /**
   * Обновление настроек Telegram
   */
  static async updateSettings(req: Request, res: Response) {
    try {
      const settings = req.body;
      await TelegramSettingsService.updateAllSettings(settings);
      res.json({ success: true, message: 'Настройки Telegram обновлены' });
    } catch (error: any) {
      console.error('❌ Error updating Telegram settings:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Ошибка обновления настроек Telegram', 
        error: error.message 
      });
    }
  }
}
