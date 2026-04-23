import { getDb } from '../db';
import { TelegramService } from './telegramService';
import { starMarkdownToHtml } from '../utils/telegramText';

export interface User {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  telegram_chat_id?: string;
  notifications_enabled: boolean;
  notification_preferences: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
}

export interface NotificationMessage {
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  type: 'low_stock' | 'new_order' | 'system_alert' | 'general';
  data?: any;
}

export class UserNotificationService {
  private static isInitialized = false;

  private static getBotTokenFromEnv(): string {
    return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  /**
   * Инициализация сервиса
   */
  static async initialize() {
    if (this.isInitialized) return;

    console.log('👥 Initializing User Notification Service...');
    const token = this.getBotTokenFromEnv();
    const enabled = process.env.TELEGRAM_ENABLED === 'true' && token.length > 0;

    TelegramService.initialize({
      botToken: token,
      chatId: '', // Будет устанавливаться для каждого пользователя
      enabled
    });

    this.isInitialized = true;
    console.log('✅ User Notification Service initialized');
  }

  /**
   * Получение всех пользователей с настройками уведомлений
   */
  static async getAllUsers(): Promise<User[]> {
    const db = await getDb();
    
    const users = await db.all<User[]>(`
      SELECT 
        id, name, email, phone, role,
        '' as telegram_chat_id,
        1 as notifications_enabled,
        '{"low_stock": true, "new_orders": true, "system_alerts": true}' as notification_preferences
      FROM users
      WHERE role IN ('admin', 'manager', 'user')
    `);

    return users.map(user => ({
      ...user,
      notification_preferences: typeof user.notification_preferences === 'string' 
        ? JSON.parse(user.notification_preferences)
        : user.notification_preferences
    }));
  }

  /**
   * Получение пользователей по роли
   */
  static async getUsersByRole(role: string): Promise<User[]> {
    const allUsers = await this.getAllUsers();
    return allUsers.filter(user => user.role === role);
  }

  /**
   * Отправка уведомления конкретному пользователю
   */
  static async sendToUser(userId: number, notification: NotificationMessage): Promise<boolean> {
    const db = await getDb();
    
    const user = await db.get<User>(`
      SELECT 
        id, name, email, phone, role,
        '' as telegram_chat_id,
        1 as notifications_enabled,
        '{"low_stock": true, "new_orders": true, "system_alerts": true}' as notification_preferences
      FROM users
      WHERE id = ?
    `, userId);

    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return false;
    }

    if (!user.notifications_enabled) {
      console.log(`⚠️ Notifications disabled for user ${user.name}`);
      return false;
    }

    const preferences = typeof user.notification_preferences === 'string' 
      ? JSON.parse(user.notification_preferences)
      : user.notification_preferences;

    // Проверяем, включены ли уведомления для этого типа
    if (!preferences[notification.type]) {
      console.log(`⚠️ ${notification.type} notifications disabled for user ${user.name}`);
      return false;
    }

    // Отправляем в Telegram, если есть chat_id
    if (user.telegram_chat_id) {
      const success = await this.sendTelegramMessage(user.telegram_chat_id, notification);
      if (success) {
        console.log(`✅ Notification sent to user ${user.name} (${user.role})`);
        return true;
      }
    }

    console.log(`⚠️ No Telegram chat_id for user ${user.name}`);
    return false;
  }

  /**
   * Отправка уведомления всем пользователям определенной роли
   */
  static async sendToRole(role: string, notification: NotificationMessage): Promise<number> {
    const users = await this.getUsersByRole(role);
    let sentCount = 0;

    console.log(`📤 Sending notification to ${users.length} ${role} users...`);

    for (const user of users) {
      const success = await this.sendToUser(user.id, notification);
      if (success) sentCount++;
    }

    console.log(`✅ Notification sent to ${sentCount}/${users.length} ${role} users`);
    return sentCount;
  }

  /**
   * Отправка уведомления всем пользователям
   */
  static async sendToAllUsers(notification: NotificationMessage): Promise<number> {
    const users = await this.getAllUsers();
    let sentCount = 0;

    console.log(`📤 Sending notification to ${users.length} users...`);

    for (const user of users) {
      const success = await this.sendToUser(user.id, notification);
      if (success) sentCount++;
    }

    console.log(`✅ Notification sent to ${sentCount}/${users.length} users`);
    return sentCount;
  }

  /**
   * Отправка уведомления о низких остатках (только админам)
   */
  static async sendLowStockAlert(materialName: string, currentQuantity: number, minStock: number, supplierName?: string): Promise<number> {
    const notification: NotificationMessage = {
      title: '🚨 Низкий остаток материала',
      message: this.formatLowStockMessage(materialName, currentQuantity, minStock, supplierName),
      priority: 'high',
      type: 'low_stock',
      data: {
        materialName,
        currentQuantity,
        minStock,
        supplierName
      }
    };

    return this.sendToRole('admin', notification);
  }

  /**
   * Отправка уведомления о новых заказах (менеджерам и админам)
   */
  static async sendNewOrderAlert(orderId: number, customerName: string, totalAmount: number): Promise<number> {
    const notification: NotificationMessage = {
      title: '📋 Новый заказ',
      message: this.formatNewOrderMessage(orderId, customerName, totalAmount),
      priority: 'medium',
      type: 'new_order',
      data: {
        orderId,
        customerName,
        totalAmount
      }
    };

    const adminCount = await this.sendToRole('admin', notification);
    const managerCount = await this.sendToRole('manager', notification);
    
    return adminCount + managerCount;
  }

  /**
   * Отправка системного уведомления (всем пользователям)
   */
  static async sendSystemAlert(title: string, message: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<number> {
    const notification: NotificationMessage = {
      title,
      message,
      priority,
      type: 'system_alert'
    };

    return this.sendToAllUsers(notification);
  }

  /**
   * Отправка сообщения в Telegram
   */
  private static async sendTelegramMessage(chatId: string, notification: NotificationMessage): Promise<boolean> {
    const token = this.getBotTokenFromEnv();
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN is not set, skip sendTelegramMessage');
      return false;
    }
    try {
      const emoji = notification.priority === 'high' ? '🚨' : 
                   notification.priority === 'medium' ? '⚠️' : 'ℹ️';
      
      const message = `${emoji} *${notification.title}*\n\n${notification.message}`;
      
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: starMarkdownToHtml(message),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const result = await response.json();
      
      if (result.ok) {
        return true;
      } else {
        console.error(`❌ Telegram API error for chat ${chatId}:`, result);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ Failed to send Telegram message to ${chatId}:`, error.message);
      return false;
    }
  }

  /**
   * Форматирование сообщения о низких остатках
   */
  private static formatLowStockMessage(materialName: string, currentQuantity: number, minStock: number, supplierName?: string): string {
    let message = `📦 *Материал:* ${materialName}\n`;
    message += `📊 *Текущий остаток:* ${currentQuantity}\n`;
    message += `⚠️ *Минимальный уровень:* ${minStock}\n`;
    
    if (supplierName) {
      message += `🏢 *Поставщик:* ${supplierName}\n`;
    }
    
    message += `\n💡 *Рекомендация:* Необходимо пополнить запас`;
    
    return message;
  }

  /**
   * Форматирование сообщения о новом заказе
   */
  private static formatNewOrderMessage(orderId: number, customerName: string, totalAmount: number): string {
    let message = `🆔 *Заказ №:* ${orderId}\n`;
    message += `👤 *Клиент:* ${customerName}\n`;
    message += `💰 *Сумма:* ${totalAmount.toFixed(2)} BYN\n`;
    message += `\n📋 *Требует обработки*`;
    
    return message;
  }

  /**
   * Обновление Telegram chat_id для пользователя
   */
  static async updateUserTelegramChatId(userId: number, chatId: string): Promise<boolean> {
    const db = await getDb();
    
    try {
      // ВРЕМЕННО ОТКЛЮЧЕНО - колонка telegram_chat_id не существует
      // await db.run(`
      //   UPDATE users 
      //   SET telegram_chat_id = ?
      //   WHERE id = ?
      // `, chatId, userId);
      
      console.log(`⚠️ Telegram chat_id update skipped - column doesn't exist for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to update Telegram chat_id for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Получение информации о пользователях, которые писали боту
   */
  static async getBotUsers(): Promise<any[]> {
    const token = this.getBotTokenFromEnv();
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN is not set, getBotUsers returns []');
      return [];
    }
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.ok) {
        const users = new Map();
        
        data.result.forEach((update: any) => {
          if (update.message && update.message.from) {
            const user = update.message.from;
            users.set(user.id, {
              id: user.id,
              username: user.username,
              first_name: user.first_name,
              last_name: user.last_name,
              chat_id: update.message.chat.id,
              last_message: update.message.text,
              date: new Date(update.message.date * 1000)
            });
          }
        });
        
        return Array.from(users.values());
      }
      
      return [];
    } catch (error) {
      console.error('❌ Failed to get bot users:', error);
      return [];
    }
  }

  /**
   * Отправка тестового сообщения всем пользователям бота
   */
  static async sendTestMessageToBotUsers(): Promise<number> {
    const botUsers = await this.getBotUsers();
    let sentCount = 0;

    console.log(`📤 Sending test message to ${botUsers.length} bot users...`);

    for (const user of botUsers) {
      try {
        const message = `🧪 *Тестовое сообщение*\n\nПривет, ${user.first_name}! Система уведомлений работает корректно.`;
        const t = this.getBotTokenFromEnv();
        if (!t) {
          console.error('❌ TELEGRAM_BOT_TOKEN is not set');
          return 0;
        }
        const url = `https://api.telegram.org/bot${t}/sendMessage`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: user.chat_id,
            text: starMarkdownToHtml(message),
            parse_mode: 'HTML'
          })
        });

        const result = await response.json();
        
        if (result.ok) {
          sentCount++;
          console.log(`✅ Test message sent to ${user.first_name} (@${user.username || 'no_username'})`);
        } else {
          console.error(`❌ Failed to send to ${user.first_name}:`, result);
        }
      } catch (error) {
        console.error(`❌ Error sending to ${user.first_name}:`, error);
      }
    }

    console.log(`✅ Test messages sent to ${sentCount}/${botUsers.length} users`);
    return sentCount;
  }
}
