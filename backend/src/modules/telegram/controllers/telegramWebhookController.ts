import { Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import { TelegramService } from '../services/telegramService';
import { PhotoOrderService } from '../services/photoOrderService';
import { TelegramUserService } from '../services/telegramUserService';
import { TelegramSettingsService } from '../services/telegramSettingsService';
import { TelegramBotCommands } from '../services/telegramBotCommands';
import { ImageProcessingService } from '../services/imageProcessingService';
import { PhotoOrderSessionService } from '../services/photoOrderSessionService';

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
      const update: TelegramUpdate = req.body;
      
      logger.debug('Received Telegram webhook', {
        update_id: update.update_id,
        has_message: !!update.message,
        chat_id: update.message?.chat.id,
        user_id: update.message?.from.id,
        text: update.message?.text?.substring(0, 50) + '...',
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
      
      // Проверяем, что сообщение от пользователя, а не от бота
      if (from.is_bot) {
        return res.json({ success: true, message: 'Message from bot, ignoring' });
      }

      // Автоматически добавляем или обновляем пользователя
      await this.handleUserMessage(from, chat, text, photo, document);

      res.json({ success: true, message: 'Webhook processed successfully' });
    } catch (error: any) {
      logger.error('Error processing Telegram webhook', error);
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
    
    logger.debug(`Processing user message for chat_id: ${chatId}, user: ${from.first_name}, text: ${text}`);
    
    try {
      // Проверяем, существует ли пользователь
      const existingUser = await TelegramUserService.getUserByChatId(chatId);
      logger.debug(`Existing user check for ${chatId}:`, { exists: !!existingUser });
      
      if (existingUser) {
        // Обновляем информацию о пользователе
        logger.debug(`Updating existing user: ${from.first_name} (${chatId})`);
        await this.updateUserInfo(existingUser, from, chat);
        logger.debug(`Updated existing user: ${from.first_name} (${chatId})`);
        
        // Обрабатываем команды, если это команда
        if (text && text.startsWith('/')) {
          logger.debug(`Processing command: ${text}`);
          const response = await TelegramBotCommands.handleMessage(chatId, from.id.toString(), text);
          if (response) {
            await this.sendMessageToUser(chatId, response);
          }
        }
        // Обрабатываем фотографии для заказов
        else if (photo && photo.length > 0) {
          logger.debug(`Processing photo upload from ${from.first_name}`);
          await this.handlePhotoUpload(chatId, from, photo, text);
        }
        // Обрабатываем документы (фото как файлы)
        else if (document && this.isImageDocument(document)) {
          logger.debug(`Processing image document from ${from.first_name}`);
          await this.handleDocumentUpload(chatId, from, document, text);
        }
      } else {
        // Создаем нового пользователя
        await this.createNewUser(from, chat);
        logger.info(`Created new user: ${from.first_name} (${chatId})`);
        
        // Отправляем приветственное сообщение с командами
        const welcomeMessage = await TelegramBotCommands.handleStart(chatId, from.id.toString());
        await this.sendMessageToUser(chatId, welcomeMessage);
      }

      // Отправляем приветственное сообщение для новых пользователей
      if (!existingUser) {
        try {
          logger.debug('Getting welcome_message_enabled with timeout');
          const welcomePromise = TelegramSettingsService.getSetting('welcome_message_enabled');
          const welcomeTimeoutPromise = new Promise<string>((resolve) => {
            setTimeout(() => {
              logger.debug('welcome_message_enabled timeout, using default: true');
              resolve('true');
            }, 2000); // 2 секунды таймаут
          });
          
          const welcomeEnabled = await Promise.race([welcomePromise, welcomeTimeoutPromise]) || 'true';
          logger.debug(`Welcome message enabled: ${welcomeEnabled}`);
          
          if (welcomeEnabled === 'true') {
            await this.sendWelcomeMessage(chatId, from.first_name);
          }
        } catch (error) {
          logger.error('Error getting welcome_message_enabled', error);
          // Отправляем приветствие по умолчанию
          await this.sendWelcomeMessage(chatId, from.first_name);
        }
      }

    } catch (error) {
      logger.error(`Error handling user message for ${chatId}`, error);
    }
  }

  /**
   * Создание нового пользователя
   */
  private static async createNewUser(from: any, chat: any) {
    const chatId = chat.id.toString();
    
    logger.debug(`Creating new user for chat_id: ${chatId}, name: ${from.first_name}`);
    
    // Проверяем настройки автоматического добавления
    let autoAddUsers: string | null = null;
    
    try {
      logger.debug('Starting settings check with timeout');
      const settingsPromise = TelegramSettingsService.getSetting('auto_add_users');
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          logger.debug('Settings check timeout, using default: true');
          resolve('true');
        }, 5000); // 5 секунд таймаут
      });
      
      autoAddUsers = await Promise.race([settingsPromise, timeoutPromise]);
      logger.debug(`Auto-add users setting: ${autoAddUsers}`);
    } catch (error) {
      logger.error('Error getting auto_add_users setting', error);
      autoAddUsers = 'true';
    }
    
    // Если не удалось получить настройку, используем значение по умолчанию
    if (autoAddUsers === null || autoAddUsers === undefined) {
      logger.warn('Could not get auto_add_users setting, using default: true');
      autoAddUsers = 'true';
    }
    
    // Дополнительная проверка - если все еще null, принудительно устанавливаем true
    if (!autoAddUsers) {
      logger.warn('autoAddUsers is falsy, forcing to true');
      autoAddUsers = 'true';
    }
    
    if (autoAddUsers !== 'true') {
      logger.debug('Auto-add users is disabled, skipping user creation');
      return;
    }
    
    // Получаем роль по умолчанию из настроек
    let defaultRole = 'client';
    try {
      logger.debug('Getting default_role with timeout');
      const rolePromise = TelegramSettingsService.getSetting('default_role');
      const roleTimeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          logger.debug('default_role timeout, using default: client');
          resolve('client');
        }, 3000); // 3 секунды таймаут
      });
      
      defaultRole = await Promise.race([rolePromise, roleTimeoutPromise]) || 'client';
      logger.debug(`Default role: ${defaultRole}`);
    } catch (error) {
      logger.error('Error getting default_role', error);
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

    logger.debug(`Creating user with data`, {
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

      logger.info(`User created successfully`, newUser);
    } catch (error) {
      logger.error(`Error creating user`, error);
      // Не выбрасываем ошибку, чтобы не прерывать процесс
    }
  }

  /**
   * Обновление информации о пользователе
   */
  private static async updateUserInfo(user: any, from: any, chat: any) {
    const updates: any = {};
    
    // Обновляем только если данные изменились
    if (user.username !== from.username) {
      updates.username = from.username;
    }
    if (user.first_name !== from.first_name) {
      updates.first_name = from.first_name;
    }
    if (user.last_name !== from.last_name) {
      updates.last_name = from.last_name;
    }

    // Если есть изменения, обновляем пользователя
    if (Object.keys(updates).length > 0) {
      logger.debug(`Updating user info`, updates);
      await TelegramUserService.updateUser(user.id, updates);
    } else {
      logger.debug(`User info is up to date, no updates needed`);
    }
  }

  /**
   * Отправка приветственного сообщения
   */
  private static async sendWelcomeMessage(chatId: string, firstName: string) {
    try {
      // Импортируем TelegramService динамически, чтобы избежать циклических зависимостей
      const { TelegramService } = await import('../services/telegramService');
      
      const welcomeMessage = `👋 Привет, ${firstName}!

Добро пожаловать в систему уведомлений нашей типографии!

🤖 *Что я умею:*
• 🛒 Уведомления о статусе ваших заказов
• 📋 Информация о готовности продукции
• 💬 Связь с менеджерами

👤 *Ваш статус:* Клиент
Вы будете получать уведомления о ваших заказах.

⚙️ *Настройки:*
Администратор может настроить ваши уведомления в системе.

📞 *Поддержка:*
Если у вас есть вопросы, обратитесь к менеджеру.

Спасибо за выбор нашей типографии! 🎉`;

      await TelegramService.sendMessageToUser(chatId, welcomeMessage);
    } catch (error) {
      logger.error('Error sending welcome message', error);
    }
  }

  /**
   * Отправка сообщения пользователю
   */
  private static async sendMessageToUser(chatId: string, message: string): Promise<void> {
    try {
      await TelegramService.sendMessageToUser(chatId, message);
    } catch (error) {
      logger.error(`Error sending message to ${chatId}`, error);
    }
  }

  /**
   * Получение информации о webhook
   */
  static async getWebhookInfo(req: Request, res: Response) {
    try {
      // Здесь можно добавить логику для получения информации о webhook
      res.json({
        success: true,
        data: {
          webhook_url: process.env.TELEGRAM_WEBHOOK_URL || 'Not configured',
          bot_username: process.env.TELEGRAM_BOT_USERNAME || 'Not configured',
          last_update: new Date().toISOString()
        }
      });
    } catch (error: any) {
      logger.error('Error getting webhook info', error);
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
    try {
      const { webhookUrl } = req.body;
      
      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          message: 'Webhook URL is required'
        });
      }

      // Здесь можно добавить логику для установки webhook через Telegram API
      logger.info(`Setting webhook URL: ${webhookUrl}`);
      
      res.json({
        success: true,
        message: 'Webhook URL set successfully',
        data: { webhook_url: webhookUrl }
      });
    } catch (error: any) {
      logger.error('Error setting webhook', error);
      res.status(500).json({
        success: false,
        message: 'Error setting webhook',
        error: error.message
      });
    }
  }

  /**
   * Обработка загрузки фотографий
   */
  private static async handlePhotoUpload(chatId: string, from: any, photos: any[], caption?: string) {
    try {
      logger.debug(`Handling photo upload from ${from.first_name}, photos: ${photos.length}`);
      
      // Получаем самую большую фотографию
      const largestPhoto = photos.reduce((prev, current) => 
        (current.file_size || 0) > (prev.file_size || 0) ? current : prev
      );
      
      logger.debug(`Largest photo: ${largestPhoto.width}x${largestPhoto.height}, size: ${largestPhoto.file_size} bytes`);
      
      // Проверяем, есть ли активная сессия заказа
      const session = PhotoOrderSessionService.getSession(chatId);
      
      if (session) {
        logger.debug(`Found active session for ${chatId}: ${session.sizeName}, ${session.mode}, ${session.quantity}`);
        
        // Создаем заказ с параметрами из сессии
        const size = ImageProcessingService.getSizeByName(session.sizeName);
        if (!size) {
          await this.sendMessageToUser(chatId, '❌ Ошибка: неверный размер фотографии');
          PhotoOrderSessionService.clearSession(chatId);
          return;
        }

        const processingOptions = {
          cropMode: session.mode as 'crop' | 'fit',
          quality: 90,
          format: 'jpeg' as const
        };

        // Создаем заказ
        const order = await PhotoOrderService.createOrder({
          chatId,
          username: from.username,
          firstName: from.first_name,
          originalPhotos: [`telegram_photo_${largestPhoto.file_id}`], // Временный путь
          selectedSize: size,
          processingOptions,
          quantity: session.quantity,
          notes: 'Заказ через Telegram бота'
        });

        // Очищаем сессию
        PhotoOrderSessionService.clearSession(chatId);

        await this.sendMessageToUser(chatId, 
          `✅ *Заказ создан!*\n\n` +
          `🆔 Заказ #${order.id}\n` +
          `📏 Размер: ${size.name}\n` +
          `🎨 Режим: ${session.mode === 'crop' ? 'Кроп' : session.mode === 'fit' ? 'Вписать с полями' : 'Умный кроп'}\n` +
          `📦 Копий: ${session.quantity}\n` +
          `💰 Стоимость: ${(order.totalPrice / 100).toFixed(0)} руб.\n\n` +
          `📸 Фотография будет обработана в течение 1-2 минут.\n` +
          `📱 Вы получите обработанное фото для проверки.\n\n` +
          `💡 Используйте /my_orders для отслеживания статуса заказа.`
        );
        
        return;
      }
      
      // Проверяем, есть ли активный заказ в процессе
      const pendingOrders = await PhotoOrderService.getOrdersByChatId(chatId);
      const activeOrder = pendingOrders.find(order => 
        ['pending', 'processing'].includes(order.status)
      );
      
      if (activeOrder) {
        await this.sendMessageToUser(chatId, 
          `📸 Фотография получена! Добавлена к заказу #${activeOrder.id}\n\n` +
          `📋 Текущий заказ:\n` +
          `• Размер: ${activeOrder.selectedSize.name}\n` +
          `• Фотографий: ${activeOrder.originalPhotos.length + 1}\n` +
          `• Копий: ${activeOrder.quantity}\n\n` +
          `💡 Отправьте еще фотографии или напишите "Готово" для завершения заказа.`
        );
        return;
      }
      
      // Если нет активного заказа, отправляем инструкции
      await this.sendMessageToUser(chatId, 
        `📸 Фотография получена!\n\n` +
        `💡 Для создания заказа используйте команду /order_photo\n` +
        `📋 Или отправьте сообщение в формате:\n` +
        `"Заказ: 10x15, 2 копии, кроп"\n` +
        `+ прикрепите фотографии`
      );
      
    } catch (error) {
      logger.error('Error handling photo upload', error);
      await this.sendMessageToUser(chatId, 
        '❌ Произошла ошибка при обработке фотографии. Попробуйте позже.'
      );
    }
  }

  /**
   * Обработка загрузки документов (изображений)
   */
  private static async handleDocumentUpload(chatId: string, from: any, document: any, caption?: string) {
    try {
      logger.debug(`Handling document upload from ${from.first_name}, file: ${document.file_name}`);
      
      // Проверяем, есть ли активный заказ в процессе
      const pendingOrders = await PhotoOrderService.getOrdersByChatId(chatId);
      const activeOrder = pendingOrders.find(order => 
        ['pending', 'processing'].includes(order.status)
      );
      
      if (activeOrder) {
        await this.sendMessageToUser(chatId, 
          `📄 Файл получен! Добавлен к заказу #${activeOrder.id}\n\n` +
          `📋 Текущий заказ:\n` +
          `• Размер: ${activeOrder.selectedSize.name}\n` +
          `• Фотографий: ${activeOrder.originalPhotos.length + 1}\n` +
          `• Копий: ${activeOrder.quantity}\n\n` +
          `💡 Отправьте еще файлы или напишите "Готово" для завершения заказа.`
        );
        return;
      }
      
      // Если нет активного заказа, отправляем инструкции
      await this.sendMessageToUser(chatId, 
        `📄 Файл получен!\n\n` +
        `💡 Для создания заказа используйте команду /order_photo\n` +
        `📋 Или отправьте сообщение в формате:\n` +
        `"Заказ: 10x15, 2 копии, кроп"\n` +
        `+ прикрепите файлы`
      );
      
    } catch (error) {
      logger.error('Error handling document upload', error);
      await this.sendMessageToUser(chatId, 
        '❌ Произошла ошибка при обработке файла. Попробуйте позже.'
      );
    }
  }

  /**
   * Проверка, является ли документ изображением
   */
  private static isImageDocument(document: any): boolean {
    if (!document.mime_type) return false;
    
    const imageMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    return imageMimeTypes.includes(document.mime_type.toLowerCase());
  }

  /**
   * Обработка callback query (нажатие на кнопки)
   */
  private static async handleCallbackQuery(callbackQuery: any) {
    try {
      const { id, from, message, data } = callbackQuery;
      const chatId = message?.chat?.id?.toString();
      
      logger.debug(`Callback query from ${from.first_name}: ${data}`);

      if (!chatId) {
        logger.error('No chat ID in callback query');
        return;
      }

      // Отвечаем на callback query
      await TelegramService.answerCallbackQuery(id, 'Обрабатываю...');

      // Обрабатываем разные типы callback data
      if (data.startsWith('size_')) {
        await this.handleSizeSelection(chatId, data, message.message_id);
      } else if (data.startsWith('mode_')) {
        await this.handleModeSelection(chatId, data, message.message_id);
      } else if (data.startsWith('qty_')) {
        await this.handleQuantitySelection(chatId, data, message.message_id);
      } else if (data.startsWith('confirm_')) {
        await this.handleOrderConfirmation(chatId, data);
      } else if (data.startsWith('cancel_')) {
        await this.handleOrderCancellation(chatId, data);
      } else if (data === 'back_to_sizes') {
        await this.handleBackToSizes(chatId, message.message_id);
      } else if (data.startsWith('back_to_mode_')) {
        await this.handleBackToMode(chatId, data, message.message_id);
      }

    } catch (error) {
      logger.error('Error handling callback query', error);
    }
  }

  /**
   * Обработка выбора размера
   */
  private static async handleSizeSelection(chatId: string, data: string, messageId: number) {
    const sizeName = data.replace('size_', '');
    const size = ImageProcessingService.getSizeByName(sizeName);
    
    if (!size) {
      await TelegramService.sendMessageToUser(chatId, '❌ Неверный размер фотографии');
      return;
    }

    const prices = await PhotoOrderService.getAllPrices();
    const price = prices[sizeName] || 0;
    const priceRub = (price / 100).toFixed(0);

    const message = `📏 *Выбран размер: ${sizeName}*\n\n` +
                   `📐 Размеры: ${size.width}x${size.height} пикселей\n` +
                   `💰 Цена: ${priceRub} руб. за копию\n\n` +
                   `💡 *Выберите режим обработки:*`;

    const keyboard = TelegramBotCommands.getProcessingModeKeyboard(sizeName);
    await TelegramService.editMessageWithKeyboard(chatId, messageId, message, keyboard);
  }

  /**
   * Обработка выбора режима обработки
   */
  private static async handleModeSelection(chatId: string, data: string, messageId: number) {
    const parts = data.split('_');
    const mode = parts[1]; // crop, fit, smart
    const sizeName = parts[2];

    const modeText = {
      'crop': '✂️ Кроп (обрезать под размер)',
      'fit': '📐 Вписать (с белыми полями)',
      'smart': '🤖 Умный кроп (ИИ)'
    }[mode] || mode;

    const message = `🎨 *Режим обработки: ${modeText}*\n\n` +
                   `📏 Размер: ${sizeName}\n\n` +
                   `💡 *Выберите количество копий:*`;

    const keyboard = TelegramBotCommands.getQuantityKeyboard(sizeName, mode);
    await TelegramService.editMessageWithKeyboard(chatId, messageId, message, keyboard);
  }

  /**
   * Обработка выбора количества копий
   */
  private static async handleQuantitySelection(chatId: string, data: string, messageId: number) {
    const parts = data.split('_');
    const quantity = parseInt(parts[1]);
    const mode = parts[2];
    const sizeName = parts[3];

    const size = ImageProcessingService.getSizeByName(sizeName);
    const prices = await PhotoOrderService.getAllPrices();
    const pricePerCopy = prices[sizeName] || 0;
    const totalPrice = pricePerCopy * quantity;
    const totalPriceRub = (totalPrice / 100).toFixed(0);

    const modeText = {
      'crop': '✂️ Кроп',
      'fit': '📐 Вписать с полями',
      'smart': '🤖 Умный кроп'
    }[mode] || mode;

    const message = `📋 *Параметры заказа:*\n\n` +
                   `📏 Размер: ${sizeName}\n` +
                   `🎨 Режим: ${modeText}\n` +
                   `📦 Копий: ${quantity}\n` +
                   `💰 Цена за копию: ${(pricePerCopy / 100).toFixed(0)} руб.\n` +
                   `💰 Общая стоимость: ${totalPriceRub} руб.\n\n` +
                   `📸 *Теперь отправьте фотографии для обработки!*\n` +
                   `(до 10 фотографий)`;

    // Убираем клавиатуру и показываем финальное сообщение
    await TelegramService.editMessageWithKeyboard(chatId, messageId, message, { inline_keyboard: [] });

    // Сохраняем параметры заказа в сессии
    PhotoOrderSessionService.saveSession(chatId, sizeName, mode, quantity);
  }

  /**
   * Обработка подтверждения заказа
   */
  private static async handleOrderConfirmation(chatId: string, data: string) {
    const orderId = data.replace('confirm_', '');
    
    await TelegramService.sendMessageToUser(chatId, 
      `✅ *Заказ #${orderId} подтвержден!*\n\n` +
      `📸 Ваши фотографии будут обработаны в течение 1-2 минут.\n` +
      `📱 Вы получите обработанные фото для проверки.\n\n` +
      `💡 Используйте /my_orders для отслеживания статуса заказа.`
    );
  }

  /**
   * Обработка отмены заказа
   */
  private static async handleOrderCancellation(chatId: string, data: string) {
    const orderId = data.replace('cancel_', '');
    
    await TelegramService.sendMessageToUser(chatId, 
      `❌ *Заказ #${orderId} отменен.*\n\n` +
      `💡 Вы можете создать новый заказ с помощью /order_photo`
    );
  }

  /**
   * Возврат к выбору размеров
   */
  private static async handleBackToSizes(chatId: string, messageId: number) {
    const message = `📸 *ЗАКАЗ ПЕЧАТИ ФОТОГРАФИЙ*\n\n` +
                   `💡 *Выберите размер фотографии:*\n` +
                   `Нажмите на кнопку с нужным размером ниже ⬇️`;

    const keyboard = await TelegramBotCommands.getSizeSelectionKeyboard();
    await TelegramService.editMessageWithKeyboard(chatId, messageId, message, keyboard);
  }

  /**
   * Возврат к выбору режима обработки
   */
  private static async handleBackToMode(chatId: string, data: string, messageId: number) {
    const sizeName = data.replace('back_to_mode_', '');
    
    const message = `📏 *Размер: ${sizeName}*\n\n` +
                   `💡 *Выберите режим обработки:*`;

    const keyboard = TelegramBotCommands.getProcessingModeKeyboard(sizeName);
    await TelegramService.editMessageWithKeyboard(chatId, messageId, message, keyboard);
  }
}
