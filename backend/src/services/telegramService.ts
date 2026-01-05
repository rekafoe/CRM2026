// Используем встроенный fetch (Node.js 18+)
import { TelegramUserService } from './telegramUserService';

export interface TelegramConfig {
  botToken: string;
  chatId?: string; // Сделаем опциональным
  enabled: boolean;
}

export interface LowStockNotification {
  materialId: number;
  materialName: string;
  currentQuantity: number;
  minQuantity: number;
  supplierName?: string;
  supplierContact?: string;
  categoryName?: string;
}

export interface OrderNotification {
  orderId: number;
  supplierName: string;
  supplierContact?: string;
  materials: Array<{
    name: string;
    quantity: number;
    unit: string;
    price: number;
  }>;
  totalAmount: number;
  deliveryDate?: string;
}

export class TelegramService {
  private static config: TelegramConfig | null = null;
  private static pollingInterval: NodeJS.Timeout | null = null;
  private static lastUpdateId: number = 0;
  private static isPollingInProgress: boolean = false;
  private static consecutivePollingErrors: number = 0;
  private static nextAllowedPollAt: number = 0;
  private static readonly DEFAULT_POLL_INTERVAL_MS: number = Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 5000);
  private static readonly DEFAULT_FETCH_TIMEOUT_MS: number = Number(process.env.TELEGRAM_POLL_TIMEOUT_MS || 30000); // 30s

  /**
   * Инициализация конфигурации Telegram
   */
  static initialize(config: TelegramConfig) {
    this.config = config;
    console.log('🤖 Telegram service initialized:', {
      enabled: config.enabled,
      chatId: config.chatId ? `${config.chatId.substring(0, 4)}...` : 'not set'
    });
    
    // Запускаем polling для получения обновлений
    if (config.enabled && config.botToken) {
      this.startPolling();
    }
  }

  /**
   * Получение текущей конфигурации
   */
  static getConfig(): TelegramConfig {
    return this.config || {
      botToken: '',
      chatId: undefined,
      enabled: false
    };
  }

  /**
   * Проверка доступности сервиса
   */
  static isEnabled(): boolean {
    return !!(this.config?.enabled && this.config?.botToken);
  }

  /**
   * Отправка уведомления о низких остатках
   */
  static async sendLowStockNotification(notification: LowStockNotification): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram notifications disabled');
      return false;
    }

    const message = this.formatLowStockMessage(notification);
    const result = await this.sendToAllUsers(message);
    return result.sent > 0;
  }

  /**
   * Отправка уведомления о заказе поставщику
   */
  static async sendOrderNotification(notification: OrderNotification): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram notifications disabled');
      return false;
    }

    const message = this.formatOrderMessage(notification);
    const result = await this.sendToAllUsers(message);
    return result.sent > 0;
  }

  /**
   * Отправка общего уведомления
   */
  static async sendNotification(title: string, message: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram notifications disabled');
      return false;
    }

    const emoji = priority === 'high' ? '🚨' : priority === 'medium' ? '⚠️' : 'ℹ️';
    const formattedMessage = `${emoji} *${title}*\n\n${message}`;
    
    const result = await this.sendToAllUsers(formattedMessage);
    return result.sent > 0;
  }

  /**
   * Отправка сообщения в Telegram
   */
  private static async sendMessage(message: string): Promise<boolean> {
    if (!this.config) {
      console.error('❌ Telegram config not initialized');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });

      const data = await response.json();

      if (data.ok) {
        console.log('✅ Telegram message sent successfully');
        return true;
      } else {
        console.error('❌ Telegram API error:', data);
        return false;
      }
    } catch (error: any) {
      console.error('❌ Failed to send Telegram message:', error.message);
      return false;
    }
  }

  /**
   * Форматирование сообщения о низких остатках
   */
  private static formatLowStockMessage(notification: LowStockNotification): string {
    const { materialName, currentQuantity, minQuantity, supplierName, supplierContact, categoryName } = notification;
    
    let message = `🚨 *Низкий остаток материала*\n\n`;
    message += `📦 *Материал:* ${materialName}\n`;
    message += `📊 *Текущий остаток:* ${currentQuantity}\n`;
    message += `⚠️ *Минимальный уровень:* ${minQuantity}\n`;
    
    if (categoryName) {
      message += `🏷️ *Категория:* ${categoryName}\n`;
    }
    
    if (supplierName) {
      message += `🏢 *Поставщик:* ${supplierName}\n`;
    }
    
    if (supplierContact) {
      message += `📞 *Контакт:* ${supplierContact}\n`;
    }
    
    message += `\n💡 *Рекомендация:* Необходимо пополнить запас`;
    
    return message;
  }

  /**
   * Форматирование сообщения о заказе
   */
  private static formatOrderMessage(notification: OrderNotification): string {
    const { orderId, supplierName, supplierContact, materials, totalAmount, deliveryDate } = notification;
    
    let message = `📋 *Новый заказ поставщику*\n\n`;
    message += `🆔 *Заказ №:* ${orderId}\n`;
    message += `🏢 *Поставщик:* ${supplierName}\n`;
    
    if (supplierContact) {
      message += `📞 *Контакт:* ${supplierContact}\n`;
    }
    
    if (deliveryDate) {
      message += `📅 *Дата поставки:* ${deliveryDate}\n`;
    }
    
    message += `\n📦 *Материалы:*\n`;
    
    materials.forEach((material, index) => {
      message += `${index + 1}. ${material.name} - ${material.quantity} ${material.unit} (${material.price} BYN)\n`;
    });
    
    message += `\n💰 *Общая сумма:* ${totalAmount.toFixed(2)} BYN`;
    
    return message;
  }

  /**
   * Тестовая отправка сообщения
   */
  static async sendTestMessage(): Promise<boolean> {
    const testMessage = `🧪 *Тестовое сообщение*\n\nСистема уведомлений работает корректно!`;
    const result = await this.sendToAllUsers(testMessage);
    return result.sent > 0;
  }

  /**
   * Отправка сообщения всем активным пользователям
   */
  static async sendToAllUsers(message: string): Promise<{ sent: number; failed: number }> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return { sent: 0, failed: 0 };
    }

    try {
      const users = await TelegramUserService.getActiveUsers();
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        try {
          const success = await this.sendMessageToUser(user.chat_id, message);
          if (success) {
            sent++;
            console.log(`✅ Message sent to ${user.username || user.first_name || user.chat_id}`);
          } else {
            failed++;
            console.log(`❌ Failed to send message to ${user.username || user.first_name || user.chat_id}`);
          }
        } catch (error) {
          failed++;
          console.error(`❌ Error sending to ${user.username || user.first_name || user.chat_id}:`, error);
        }
      }

      console.log(`📊 Message delivery: ${sent} sent, ${failed} failed`);
      return { sent, failed };
    } catch (error) {
      console.error('❌ Error sending to all users:', error);
      return { sent: 0, failed: 0 };
    }
  }

  /**
   * Отправка сообщения пользователям определенной роли
   */
  static async sendToRole(role: string, message: string): Promise<{ sent: number; failed: number }> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return { sent: 0, failed: 0 };
    }

    try {
      const users = await TelegramUserService.getUsersByRole(role);
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        try {
          const success = await this.sendMessageToUser(user.chat_id, message);
          if (success) {
            sent++;
            console.log(`✅ Message sent to ${user.username || user.first_name || user.chat_id} (${role})`);
          } else {
            failed++;
            console.log(`❌ Failed to send message to ${user.username || user.first_name || user.chat_id} (${role})`);
          }
        } catch (error) {
          failed++;
          console.error(`❌ Error sending to ${user.username || user.first_name || user.chat_id} (${role}):`, error);
        }
      }

      console.log(`📊 Message delivery to ${role}: ${sent} sent, ${failed} failed`);
      return { sent, failed };
    } catch (error) {
      console.error(`❌ Error sending to role ${role}:`, error);
      return { sent: 0, failed: 0 };
    }
  }

  /**
   * Отправка сообщения конкретному пользователю по chat_id
   */
  static async sendMessageToUser(chatId: string, message: string): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.config!.botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      const result = await response.json();
      
      if (result.ok) {
        console.log(`✅ Message sent to chat ${chatId}`);
        return true;
      } else {
        console.error(`❌ Telegram API error for chat ${chatId}:`, result);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error sending message to chat ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Отправка уведомления о низких остатках активным пользователям
   */
  static async sendLowStockToUsers(notification: LowStockNotification): Promise<{ sent: number; failed: number }> {
    const message = this.formatLowStockMessage(notification);
    
    try {
      const users = await TelegramUserService.getActiveUsers();
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        // Проверяем настройки пользователя
        if (!user.notification_preferences.low_stock) {
          console.log(`⚠️ Low stock notifications disabled for ${user.username || user.first_name || user.chat_id}`);
          continue;
        }

        try {
          const success = await this.sendMessageToUser(user.chat_id, message);
          if (success) {
            sent++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          console.error(`❌ Error sending low stock notification to ${user.username || user.first_name || user.chat_id}:`, error);
        }
      }

      console.log(`📊 Low stock notification delivery: ${sent} sent, ${failed} failed`);
      return { sent, failed };
    } catch (error) {
      console.error('❌ Error sending low stock notifications:', error);
      return { sent: 0, failed: 0 };
    }
  }

  /**
   * Запуск polling для получения обновлений от Telegram
   */
  private static startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    console.log('🔄 Starting Telegram polling...');
    
    const baseIntervalMs = this.DEFAULT_POLL_INTERVAL_MS; // базовый интервал

    this.pollingInterval = setInterval(async () => {
      if (this.isPollingInProgress) {
        // предотвращаем параллельные запросы
        return;
      }

      // backoff: если была серия ошибок, ждём увеличенный интервал
      const now = Date.now();
      if (now < this.nextAllowedPollAt) {
        return;
      }

      this.isPollingInProgress = true;
      try {
        await this.getUpdates();
        // сбрасываем счётчик ошибок при успешном запросе
        this.consecutivePollingErrors = 0;
        this.nextAllowedPollAt = 0;
      } catch (error) {
        console.error('❌ Error in Telegram polling:', error);
        this.consecutivePollingErrors = Math.min(this.consecutivePollingErrors + 1, 5);
        // экспоненциальный backoff: 2^n секунд, максимум 60 сек
        const backoffMs = Math.min(Math.pow(2, this.consecutivePollingErrors) * 1000, 60000);
        this.nextAllowedPollAt = Date.now() + backoffMs;
      } finally {
        this.isPollingInProgress = false;
      }
    }, baseIntervalMs);
  }

  /**
   * Получение обновлений от Telegram API
   */
  private static async getUpdates() {
    if (!this.config?.botToken) return;

    try {
      // Используем long polling: Telegram рекомендует до 50 сек; берём 25 сек
      const longPollSeconds = Number(process.env.TELEGRAM_LONGPOLL_TIMEOUT_SEC || 25);
      const url = `https://api.telegram.org/bot${this.config.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=${longPollSeconds}`;

      // управляем таймаутом через AbortController, чтобы не накапливались висящие запросы
      const controller = new AbortController();
      const pollingTimeoutMs = this.DEFAULT_FETCH_TIMEOUT_MS; // по умолчанию 30 сек, можно настроить через ENV
      const timeout = setTimeout(() => controller.abort(), pollingTimeoutMs);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await response.json();

      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          this.lastUpdateId = update.update_id;
          await this.handleUpdate(update);
        }
      }
    } catch (error) {
      // Уточняем сообщение об ошибке, особенно для таймаутов соединения
      const message = (error as any)?.name === 'AbortError'
        ? 'Fetch aborted by timeout'
        : (error as any)?.message || String(error);
      console.error('❌ Error getting Telegram updates:', message);
    }
  }

  /**
   * Обработка обновления от Telegram
   */
  private static async handleUpdate(update: any) {
    // Импортируем контроллер webhook для обработки
    const { TelegramWebhookController } = await import('../controllers/telegramWebhookController');
    
    // Обрабатываем callback query (нажатие на кнопки)
    if (update.callback_query) {
      console.log('🔘 Received callback query via polling:', {
        callback_id: update.callback_query.id,
        chat_id: update.callback_query.message?.chat?.id,
        user_id: update.callback_query.from?.id,
        data: update.callback_query.data
      });
      
      await (TelegramWebhookController as any).handleCallbackQuery(update.callback_query);
      return;
    }

    // Обрабатываем обычные сообщения
    if (!update.message) return;

    const { from, chat, text, photo, document } = update.message;
    
    // Проверяем, что сообщение от пользователя, а не от бота
    if (from.is_bot) return;

    console.log('📨 Received message via polling:', {
      chat_id: chat.id,
      user_id: from.id,
      text: text?.substring(0, 50) + '...',
      has_photo: !!photo,
      has_document: !!document
    });

    await (TelegramWebhookController as any).handleUserMessage(from, chat, text, photo, document);
  }

  /**
   * Отправка документа пользователю
   */
  static async sendDocumentToUser(chatId: string, filePath: string, caption?: string): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return false;
    }

    try {
      const FormData = require('form-data');
      const fs = require('fs');
      const https = require('https');
      
      // Проверяем, существует ли файл
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        return false;
      }

      // Проверяем размер файла
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      if (fileSizeInMB > 50) {
        console.error(`❌ File too large: ${fileSizeInMB.toFixed(2)}MB (max 50MB)`);
        return false;
      }

      console.log(`📤 Sending document to ${chatId}: ${filePath} (${fileSizeInMB.toFixed(2)}MB)`);

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('document', fs.createReadStream(filePath));
      if (caption) {
        form.append('caption', caption);
      }

      // Используем https модуль для отправки
      return new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.telegram.org',
          port: 443,
          path: `/bot${this.config!.botToken}/sendDocument`,
          method: 'POST',
          headers: form.getHeaders()
        }, (res: any) => {
          let data = '';
          
          res.on('data', (chunk: any) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.ok) {
                console.log(`✅ Document sent to ${chatId}`);
                resolve(true);
              } else {
                console.error(`❌ Failed to send document to ${chatId}:`, result);
                resolve(false);
              }
            } catch (error) {
              console.error(`❌ JSON parse error: ${error}`);
              console.error(`❌ Response data: ${data}`);
              resolve(false);
            }
          });
        });

        req.on('error', (error: any) => {
          console.error(`❌ Request error: ${error}`);
          resolve(false);
        });

        form.pipe(req);
      });
      
    } catch (error) {
      console.error(`❌ Error sending document to ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Отправка сообщения с inline клавиатурой
   */
  static async sendMessageWithKeyboard(chatId: string, message: string, keyboard: any): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config!.botToken}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }),
      });

      const result = await response.json();
      
      if (result.ok) {
        console.log(`✅ Message with keyboard sent to ${chatId}`);
        return true;
      } else {
        console.error(`❌ Failed to send message with keyboard to ${chatId}:`, result);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error sending message with keyboard to ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Редактирование сообщения с клавиатурой
   */
  static async editMessageWithKeyboard(chatId: string, messageId: number, message: string, keyboard: any): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config!.botToken}/editMessageText`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }),
      });

      const result = await response.json();
      
      if (result.ok) {
        console.log(`✅ Message with keyboard edited for ${chatId}`);
        return true;
      } else {
        console.error(`❌ Failed to edit message with keyboard for ${chatId}:`, result);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error editing message with keyboard for ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Ответ на callback query
   */
  static async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert: boolean = false): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log('⚠️ Telegram service is not enabled');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config!.botToken}/answerCallbackQuery`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text,
          show_alert: showAlert
        }),
      });

      const result = await response.json();
      
      if (result.ok) {
        console.log(`✅ Callback query answered: ${callbackQueryId}`);
        return true;
      } else {
        console.error(`❌ Failed to answer callback query ${callbackQueryId}:`, result);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error answering callback query ${callbackQueryId}:`, error);
      return false;
    }
  }
}
