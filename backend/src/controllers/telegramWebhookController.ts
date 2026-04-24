import { Request, Response } from 'express';
import { TelegramUserService, type UpdateTelegramUserRequest } from '../services/telegramUserService';
import { TelegramSettingsService } from '../services/telegramSettingsService';
import { TelegramBotCommands } from '../services/telegramBotCommands';
import { TelegramService } from '../services/telegramService';
import { callTelegramMethod, previewTelegramText, type TelegramWebhookInfoResult } from '../utils/telegramBotApi';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        type: string;
      };
    };
    data: string;
  };
}

export class TelegramWebhookController {
  /**
   * Обработка webhook от Telegram
   */
  static async handleWebhook(req: Request, res: Response) {
    try {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
      if (secret) {
        const h = req.headers['x-telegram-bot-api-secret-token'];
        const got = Array.isArray(h) ? h[0] : h;
        if (got !== secret) {
          return res.status(403).json({ success: false, message: 'Invalid webhook secret' });
        }
      }

      const update: TelegramUpdate = req.body;
      
      console.log('📨 Received Telegram webhook:', {
        update_id: update.update_id,
        has_message: !!update.message,
        chat_id: update.message?.chat.id,
        user_id: update.message?.from?.id,
        text_preview: previewTelegramText(update.message?.text),
        full_body: JSON.stringify(req.body, null, 2)
      });

      // Обрабатываем callback query (нажатие на кнопки)
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
        return res.json({ success: true, message: 'Callback query processed' });
      }

      if (!update.message) {
        return res.json({ success: true, message: 'No message in update' });
      }

      const { from, chat, text, photo, document } = update.message;

      if (!from) {
        return res.json({ success: true, message: 'No from in message, skipping' });
      }
      
      // Проверяем, что сообщение от пользователя, а не от бота
      if (from.is_bot) {
        return res.json({ success: true, message: 'Message from bot, ignoring' });
      }

      // Автоматически добавляем или обновляем пользователя
      await this.handleUserMessage(from, chat, text, photo, document);

      res.json({ success: true, message: 'Webhook processed successfully' });
    } catch (error: any) {
      console.error('❌ Error processing Telegram webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing webhook',
        error: error.message
      });
    }
  }

  /**
   * Обработка сообщения от пользователя
   */
  private static async handleUserMessage(from: any, chat: any, text?: string, photo?: any[], document?: any) {
    const chatId = chat.id.toString();
    
    console.log(`🔍 Processing user message for chat_id: ${chatId}, user: ${from.first_name}, text: ${text}`);
    
    try {
      // Проверяем, существует ли пользователь
      const existingUser = await TelegramUserService.getUserByChatId(chatId);
      console.log(`👤 Existing user check for ${chatId}:`, existingUser ? 'EXISTS' : 'NOT FOUND');
      
      if (existingUser) {
        console.log(`🔄 Updating existing user: ${from.first_name} (${chatId})`);
        await this.updateUserInfo(existingUser, from, chat);
        console.log(`✅ Updated existing user: ${from.first_name} (${chatId})`);

        if (text && String(text).trim() !== '') {
          console.log(`🤖 Processing text input: ${text}`);
          const response = await TelegramBotCommands.handleMessage(chatId, from.id.toString(), text);
          if (response) {
            await this.sendMessageToUser(chatId, response);
          }
        } else if ((photo && photo.length > 0) || document) {
          await this.sendMiniappFlowHint(chatId);
        }
      } else {
        // Создаем нового пользователя
        await this.createNewUser(from, chat);
        console.log(`🆕 Created new user: ${from.first_name} (${chatId})`);
        
        // Отправляем приветственное сообщение с командами
        const welcomeMessage = await TelegramBotCommands.handleStart(chatId, from.id.toString());
        await this.sendMessageToUser(chatId, welcomeMessage);
      }

      // Отправляем приветственное сообщение для новых пользователей
      if (!existingUser) {
        try {
          console.log('⏰ Getting welcome_message_enabled with timeout...');
          const welcomePromise = TelegramSettingsService.getSetting('welcome_message_enabled');
          const welcomeTimeoutPromise = new Promise<string>((resolve) => {
            setTimeout(() => {
              console.log('⏰ welcome_message_enabled timeout, using default: true');
              resolve('true');
            }, 2000); // 2 секунды таймаут
          });
          
          const welcomeEnabled = await Promise.race([welcomePromise, welcomeTimeoutPromise]) || 'true';
          console.log(`💬 Welcome message enabled: ${welcomeEnabled}`);
          
          if (welcomeEnabled === 'true') {
            await this.sendWelcomeMessage(chatId, from.first_name);
          }
        } catch (error) {
          console.error('❌ Error getting welcome_message_enabled:', error);
          // Отправляем приветствие по умолчанию
          await this.sendWelcomeMessage(chatId, from.first_name);
        }
      }

    } catch (error) {
      console.error(`❌ Error handling user message for ${chatId}:`, error);
    }
  }

  /**
   * Создание нового пользователя
   */
  private static async createNewUser(from: any, chat: any) {
    const chatId = chat.id.toString();
    
    console.log(`🆕 Creating new user for chat_id: ${chatId}, name: ${from.first_name}`);
    
    // Проверяем настройки автоматического добавления
    let autoAddUsers: string | null = null;
    
    try {
      console.log('⏰ Starting settings check with timeout...');
      const settingsPromise = TelegramSettingsService.getSetting('auto_add_users');
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          console.log('⏰ Settings check timeout, using default: true');
          resolve('true');
        }, 5000); // 5 секунд таймаут
      });
      
      autoAddUsers = await Promise.race([settingsPromise, timeoutPromise]);
      console.log(`⚙️ Auto-add users setting: ${autoAddUsers}`);
    } catch (error) {
      console.error('❌ Error getting auto_add_users setting:', error);
      autoAddUsers = 'true';
    }
    
    // Если не удалось получить настройку, используем значение по умолчанию
    if (autoAddUsers === null || autoAddUsers === undefined) {
      console.log('⚠️ Could not get auto_add_users setting, using default: true');
      autoAddUsers = 'true';
    }
    
    // Дополнительная проверка - если все еще null, принудительно устанавливаем true
    if (!autoAddUsers) {
      console.log('⚠️ autoAddUsers is falsy, forcing to true');
      autoAddUsers = 'true';
    }
    
    if (autoAddUsers !== 'true') {
      console.log('⚠️ Auto-add users is disabled, skipping user creation');
      return;
    }
    
    // Получаем роль по умолчанию из настроек
    let defaultRole = 'client';
    try {
      console.log('⏰ Getting default_role with timeout...');
      const rolePromise = TelegramSettingsService.getSetting('default_role');
      const roleTimeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          console.log('⏰ default_role timeout, using default: client');
          resolve('client');
        }, 3000); // 3 секунды таймаут
      });
      
      defaultRole = await Promise.race([rolePromise, roleTimeoutPromise]) || 'client';
      console.log(`🎭 Default role: ${defaultRole}`);
    } catch (error) {
      console.error('❌ Error getting default_role:', error);
      defaultRole = 'client';
    }
    
    let role = defaultRole; // Используем настройку по умолчанию
    
    // Если это групповой чат, можно дать роль "manager"
    if (chat.type === 'group' || chat.type === 'supergroup') {
      role = 'manager';
    }

    // Настройки уведомлений для клиентов (только важные уведомления)
    const notificationPreferences = {
      low_stock: false,        // Клиенты не получают уведомления о низких остатках
      new_orders: true,        // Клиенты получают уведомления о своих заказах
      system_alerts: false     // Клиенты не получают системные уведомления
    };

    // Если это менеджер из группового чата, расширяем права
    if (role === 'manager') {
      notificationPreferences.low_stock = true;
      notificationPreferences.system_alerts = true;
    }

    console.log(`👤 Creating user with data:`, {
      chat_id: chatId,
      username: from.username,
      first_name: from.first_name,
      last_name: from.last_name,
      role: role,
      notifications_enabled: true,
      notification_preferences: notificationPreferences
    });

    try {
      const newUser = await TelegramUserService.createUser({
        chat_id: chatId,
        username: from.username,
        first_name: from.first_name,
        last_name: from.last_name,
        role: role,
        notifications_enabled: true,
        notification_preferences: notificationPreferences
      });

      console.log(`✅ User created successfully:`, newUser);
    } catch (error) {
      console.error(`❌ Error creating user:`, error);
      // Не выбрасываем ошибку, чтобы не прерывать процесс
    }
  }

  /**
   * Обновление информации о пользователе
   */
  private static async updateUserInfo(user: any, from: any, chat: any) {
    const updates: UpdateTelegramUserRequest = {};
    const same = (a: string | null | undefined, b: string | undefined) =>
      (a ?? '').trim() === (b ?? '').trim();

    if (!same(user.username, from.username)) {
      updates.username = from.username ?? undefined;
    }
    if (!same(user.first_name, from.first_name)) {
      updates.first_name = from.first_name ?? undefined;
    }
    if (!same(user.last_name, from.last_name)) {
      updates.last_name = from.last_name ?? undefined;
    }

    if (Object.keys(updates).length > 0) {
      console.log(`🔄 Updating user info:`, updates);
      await TelegramUserService.updateUser(user.id, updates);
    } else {
      console.log(`✅ User info is up to date, no updates needed`);
    }
  }

  /**
   * Отправка приветственного сообщения
   */
  private static async sendWelcomeMessage(chatId: string, firstName: string) {
    try {
      const welcomeMessage = `👋 Привет, ${firstName}!

Добро пожаловать в Telegram-бот типографии.

🤖 *Что я умею:*
• показать активные заказы
• открыть PrintCore App для нового заказа

Используйте /start, /help или /miniapp.`;

      await this.sendMessageToUser(chatId, welcomeMessage);
    } catch (error) {
      console.error('❌ Error sending welcome message:', error);
    }
  }

  /**
   * Отправка сообщения пользователю
   */
  private static async sendMessageToUser(chatId: string, message: string): Promise<void> {
    try {
      const sentWithKeyboard = await TelegramBotCommands.sendMessageWithMainKeyboard(chatId, message);
      if (!sentWithKeyboard) {
        await TelegramService.sendMessageToUser(chatId, message);
      }
    } catch (error) {
      console.error(`❌ Error sending message to ${chatId}:`, error);
    }
  }

  /**
   * Получение информации о webhook
   */
  static async getWebhookInfo(req: Request, res: Response) {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return res.status(503).json({ success: false, message: 'TELEGRAM_BOT_TOKEN is not set' });
    }
    try {
      const data = await callTelegramMethod<TelegramWebhookInfoResult>(token, 'getWebhookInfo');
      if (!data.ok) {
        return res.status(502).json({
          success: false,
          message: data.description || 'Telegram getWebhookInfo failed',
          error_code: data.error_code
        });
      }
      res.json({
        success: true,
        data: {
          telegram: data.result,
          env_webhook_url: process.env.TELEGRAM_WEBHOOK_URL || null,
          bot_username: process.env.TELEGRAM_BOT_USERNAME || null
        }
      });
    } catch (error: any) {
      console.error('❌ Error getting webhook info:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting webhook info',
        error: error.message
      });
    }
  }

  /**
   * Установка webhook
   */
  static async setWebhook(req: Request, res: Response) {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return res.status(503).json({ success: false, message: 'TELEGRAM_BOT_TOKEN is not set' });
    }
    try {
      const { webhookUrl, dropPendingUpdates, removeWebhook } = req.body as {
        webhookUrl?: string
        dropPendingUpdates?: boolean
        removeWebhook?: boolean
      }

      if (removeWebhook) {
        const del = await callTelegramMethod<true>(token, 'deleteWebhook', {
          drop_pending_updates: Boolean(dropPendingUpdates)
        });
        if (!del.ok) {
          return res.status(502).json({
            success: false,
            message: del.description || 'Telegram deleteWebhook failed',
            error_code: del.error_code
          });
        }
        return res.json({
          success: true,
          message: 'Webhook removed in Telegram',
          data: { removed: true }
        });
      }

      const urlRaw = typeof webhookUrl === 'string' ? webhookUrl.trim() : '';
      if (urlRaw === '') {
        return res.status(400).json({
          success: false,
          message: 'Укажите webhookUrl или removeWebhook: true для снятия вебхука'
        });
      }

      const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
      const params: Record<string, string | number | boolean | undefined> = {
        url: urlRaw,
        drop_pending_updates: Boolean(dropPendingUpdates)
      };
      if (secret) {
        params.secret_token = secret;
      }

      const data = await callTelegramMethod<true>(token, 'setWebhook', params);
      if (!data.ok) {
        return res.status(502).json({
          success: false,
          message: data.description || 'Telegram setWebhook failed',
          error_code: data.error_code
        });
      }

      console.log(`🔗 setWebhook ok: ${urlRaw}`);

      res.json({
        success: true,
        message: 'Webhook URL set in Telegram',
        data: { webhook_url: urlRaw, has_secret: Boolean(secret) }
      });
    } catch (error: any) {
      console.error('❌ Error setting webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Error setting webhook',
        error: error.message
      });
    }
  }

  /**
   * Старые inline-кнопки и media-flow отключены: даём понятную подсказку и
   * не оставляем callback без ответа.
   */
  private static async handleCallbackQuery(callbackQuery: any) {
    try {
      const { id, from, message } = callbackQuery;
      const chatId = message?.chat?.id?.toString();
      
      console.log(`🔘 Legacy callback query from ${from.first_name}`);

      if (!chatId) {
        console.error('❌ No chat ID in callback query');
        return;
      }

      await TelegramService.answerCallbackQuery(id, 'Сценарий перенесён в PrintCore App');
      await this.sendMiniappFlowHint(chatId);
    } catch (error) {
      console.error('❌ Error handling callback query:', error);
    }
  }

  private static async sendMiniappFlowHint(chatId: string) {
    await this.sendMessageToUser(
      chatId,
      'Основной клиентский сценарий перенесён в PrintCore App. Для новых действий используйте /miniapp.'
    );
  }

}
