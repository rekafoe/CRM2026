// Используем встроенный fetch (Node.js 18+)
import { TelegramUserService } from './telegramUserService';
import { previewTelegramText } from '../utils/telegramBotApi';
import { starMarkdownToHtml } from '../utils/telegramText';

export interface TelegramConfig {
  botToken: string;
  chatId?: string; // Сделаем опциональным
  enabled: boolean;
  /** true — доставка апдейтов через setWebhook, long polling в этом процессе не запускается */
  useWebhook?: boolean;
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
  /** После серии ConnectTimeout — полностью молчим, иначе CRM встаёт на минуты. */
  private static networkCircuitOpenUntil: number = 0;
  private static networkFailureStreak: number = 0;
  private static readonly DEFAULT_POLL_INTERVAL_MS: number = Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 15000);
  /** Короткий abort: undici connect timeout сам по себе ~10с и убивает отзывчивость. */
  private static readonly DEFAULT_FETCH_TIMEOUT_MS: number = Number(process.env.TELEGRAM_POLL_TIMEOUT_MS || 5000);
  private static readonly SEND_TIMEOUT_MS: number = Number(process.env.TELEGRAM_SEND_TIMEOUT_MS || 4000);
  private static readonly CIRCUIT_OPEN_MS: number = Number(process.env.TELEGRAM_CIRCUIT_OPEN_MS || 30 * 60 * 1000);
  private static readonly CIRCUIT_FAIL_THRESHOLD: number = Number(process.env.TELEGRAM_CIRCUIT_FAIL_THRESHOLD || 2);

  private static isCircuitOpen(): boolean {
    return Date.now() < this.networkCircuitOpenUntil;
  }

  private static noteNetworkSuccess() {
    this.networkFailureStreak = 0;
    this.networkCircuitOpenUntil = 0;
  }

  private static noteNetworkFailure(reason: string) {
    this.networkFailureStreak += 1;
    if (this.networkFailureStreak < this.CIRCUIT_FAIL_THRESHOLD) return;
    this.networkCircuitOpenUntil = Date.now() + this.CIRCUIT_OPEN_MS;
    console.warn(
      `⏸️ Telegram: сеть недоступна (${reason}). Пауза ${Math.round(this.CIRCUIT_OPEN_MS / 60000)} мин — polling/send пропущены, CRM не ждёт api.telegram.org.`,
    );
    this.stopPolling();
  }

  /** fetch к Telegram с abort; при circuit open сразу false/throw. */
  private static async telegramFetch(
    url: string,
    init: RequestInit | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    if (this.isCircuitOpen()) {
      throw new Error('Telegram circuit open');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      this.noteNetworkSuccess();
      return response;
    } catch (error) {
      const msg = (error as any)?.name === 'AbortError'
        ? 'Fetch aborted by timeout'
        : (error as any)?.cause?.code || (error as any)?.message || String(error);
      this.noteNetworkFailure(String(msg));
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  static isNetworkAvailable(): boolean {
    return this.isEnabled() && !this.isCircuitOpen();
  }

  /**
   * Инициализация конфигурации Telegram
   */
  static initialize(config: TelegramConfig) {
    // UserNotificationService тоже вызывает initialize — не перезапускаем polling второй раз
    // и не затираем useWebhook пустым конфигом.
    if (this.config?.botToken && this.config.botToken === config.botToken) {
      this.config = {
        ...this.config,
        ...config,
        useWebhook: config.useWebhook ?? this.config.useWebhook,
        chatId: config.chatId || this.config.chatId,
      };
      console.log('🤖 Telegram service already initialized — config merged, polling not restarted');
      return;
    }

    this.config = config;
    console.log('🤖 Telegram service initialized:', {
      enabled: config.enabled,
      use_webhook: Boolean(config.useWebhook),
      chatId: config.chatId ? `${config.chatId.substring(0, 4)}...` : 'not set'
    });
    
    if (config.enabled && config.botToken) {
      if (config.useWebhook) {
        console.log('🌐 Telegram: webhook mode — getUpdates/polling in this process is not started (use POST .../api/notifications/telegram/webhook).');
      } else if (process.env.TELEGRAM_POLLING_ENABLED === 'true') {
        this.startPolling();
      } else {
        // Railway часто не достучится до api.telegram.org — long polling вешает CRM на ConnectTimeout.
        // Входящие: TELEGRAM_USE_WEBHOOK=true. Исходящие sendMessage всё ещё работают при живой сети.
        console.log('⏭️ Telegram polling disabled (set TELEGRAM_POLLING_ENABLED=true to enable long polling).');
      }
    }
  }

  /**
   * Получение текущей конфигурации
   */
  static getConfig(): TelegramConfig {
    return this.config || {
      botToken: '',
      chatId: undefined,
      enabled: false,
      useWebhook: false
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
    if (!this.isNetworkAvailable()) {
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
    if (!this.isNetworkAvailable()) return false;

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
      
      const response = await this.telegramFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: starMarkdownToHtml(message),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      }, this.SEND_TIMEOUT_MS);

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
    if (!this.isNetworkAvailable()) return false;

    try {
      const response = await this.telegramFetch(
        `https://api.telegram.org/bot${this.config!.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: starMarkdownToHtml(message),
            parse_mode: 'HTML'
          })
        },
        this.SEND_TIMEOUT_MS,
      );

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
    
    const baseIntervalMs = this.DEFAULT_POLL_INTERVAL_MS;

    this.pollingInterval = setInterval(async () => {
      if (this.isCircuitOpen()) {
        return;
      }
      if (this.isPollingInProgress) {
        return;
      }

      const now = Date.now();
      if (now < this.nextAllowedPollAt) {
        return;
      }

      this.isPollingInProgress = true;
      try {
        await this.getUpdates();
        this.consecutivePollingErrors = 0;
        this.nextAllowedPollAt = 0;
      } catch (error) {
        console.error('❌ Error in Telegram polling:', error);
        this.consecutivePollingErrors = Math.min(this.consecutivePollingErrors + 1, 8);
        const backoffMs = Math.min(Math.pow(2, this.consecutivePollingErrors) * 2000, 300000);
        this.nextAllowedPollAt = Date.now() + backoffMs;
      } finally {
        this.isPollingInProgress = false;
      }
    }, baseIntervalMs);
  }

  private static stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('⏹️ Telegram polling stopped');
    }
  }

  /**
   * Получение обновлений от Telegram API
   */
  private static async getUpdates() {
    if (!this.config?.botToken) return;
    if (this.isCircuitOpen()) return;

    try {
      // Короткий poll: long-poll 25с + connect timeout 10с = CRM «висит» под нагрузкой на Railway.
      const longPollSeconds = Number(process.env.TELEGRAM_LONGPOLL_TIMEOUT_SEC || 0);
      const url = `https://api.telegram.org/bot${this.config.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=${longPollSeconds}`;

      const response = await this.telegramFetch(url, undefined, this.DEFAULT_FETCH_TIMEOUT_MS);
      const data = await response.json();

      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          this.lastUpdateId = update.update_id;
          await this.handleUpdate(update);
        }
      }
    } catch (error) {
      const message = (error as any)?.name === 'AbortError'
        ? 'Fetch aborted by timeout'
        : (error as any)?.message || String(error);
      console.error('❌ Error getting Telegram updates:', message);
      throw error;
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
    if (from?.is_bot) return;

    console.log('📨 Received message via polling:', {
      chat_id: chat.id,
      user_id: from?.id,
      text_preview: previewTelegramText(text),
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
    if (!this.isNetworkAvailable()) return false;

    try {
      const url = `https://api.telegram.org/bot${this.config!.botToken}/sendMessage`;
      
      const response = await this.telegramFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: starMarkdownToHtml(message),
          parse_mode: 'HTML',
          reply_markup: keyboard
        }),
      }, this.SEND_TIMEOUT_MS);

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
    if (!this.isNetworkAvailable()) return false;

    try {
      const url = `https://api.telegram.org/bot${this.config!.botToken}/editMessageText`;
      
      const response = await this.telegramFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: starMarkdownToHtml(message),
          parse_mode: 'HTML',
          reply_markup: keyboard
        }),
      }, this.SEND_TIMEOUT_MS);

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
    if (!this.isNetworkAvailable()) return false;

    try {
      const url = `https://api.telegram.org/bot${this.config!.botToken}/answerCallbackQuery`;
      
      const response = await this.telegramFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text,
          show_alert: showAlert
        }),
      }, this.SEND_TIMEOUT_MS);

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
