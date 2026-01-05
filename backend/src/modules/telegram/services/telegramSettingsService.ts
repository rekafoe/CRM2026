import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';

export interface TelegramSettings {
  auto_add_users: boolean;
  default_role: string;
  welcome_message_enabled: boolean;
  group_chat_role: string;
  webhook_url: string;
}

export class TelegramSettingsService {
  /**
   * Получение настройки по ключу
   */
  static async getSetting(key: string): Promise<string | null> {
    logger.debug(`Getting setting: ${key}`);
    
    try {
      logger.debug(`Calling getDb()...`);
      const db = await getDb();
      logger.debug(`getDb() successful, executing query...`);
      
      return new Promise((resolve, reject) => {
        logger.debug(`Executing SQL query for ${key}...`);
        db.get('SELECT setting_value FROM telegram_settings WHERE setting_key = ?', [key], (err: any, row: any) => {
          logger.debug(`SQL query completed for ${key}`, { error: err, row });
          if (err) {
            logger.error(`Error getting setting ${key}`, err);
            reject(err);
          } else {
            const value = row ? row.setting_value : null;
            logger.debug(`Setting ${key}: ${value}`);
            resolve(value);
          }
        });
      });
    } catch (error) {
      logger.error(`Database error getting setting ${key}`, error);
      return null;
    }
  }

  /**
   * Обновление настройки
   */
  static async updateSetting(key: string, value: string): Promise<void> {
    const db = await getDb();
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO telegram_settings (setting_key, setting_value) VALUES (?, ?)',
        [key, value],
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Получение всех настроек
   */
  static async getAllSettings(): Promise<TelegramSettings> {
    logger.debug('Getting all Telegram settings...');
    
    try {
      const db = await getDb();
      logger.debug('Database connection successful');
      
      return new Promise((resolve, reject) => {
        db.all('SELECT setting_key, setting_value FROM telegram_settings', (err: any, rows: any[]) => {
          logger.debug('SQL query completed', { error: err, rowsCount: rows?.length });
          if (err) {
            logger.error('Error getting all settings', err);
            reject(err);
          } else {
          const settings: TelegramSettings = {
            auto_add_users: true,
            default_role: 'client',
            welcome_message_enabled: true,
            group_chat_role: 'manager',
            webhook_url: ''
          };

          rows.forEach((row: any) => {
            switch (row.setting_key) {
              case 'auto_add_users':
                settings.auto_add_users = row.setting_value === 'true';
                break;
              case 'default_role':
                settings.default_role = row.setting_value;
                break;
              case 'welcome_message_enabled':
                settings.welcome_message_enabled = row.setting_value === 'true';
                break;
              case 'group_chat_role':
                settings.group_chat_role = row.setting_value;
                break;
              case 'webhook_url':
                settings.webhook_url = row.setting_value;
                break;
            }
          });

            logger.debug('Settings loaded successfully', settings);
            resolve(settings);
          }
        });
      });
    } catch (error) {
      logger.error('Database error getting all settings', error);
      throw error;
    }
  }

  /**
   * Обновление всех настроек
   */
  static async updateAllSettings(settings: Partial<TelegramSettings>): Promise<void> {
    const updates = [
      { key: 'auto_add_users', value: settings.auto_add_users?.toString() || 'true' },
      { key: 'default_role', value: settings.default_role || 'client' },
      { key: 'welcome_message_enabled', value: settings.welcome_message_enabled?.toString() || 'true' },
      { key: 'group_chat_role', value: settings.group_chat_role || 'manager' },
      { key: 'webhook_url', value: settings.webhook_url || '' }
    ];

    for (const update of updates) {
      await this.updateSetting(update.key, update.value);
    }
  }
}
