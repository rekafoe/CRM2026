import { TelegramUserService, effectiveBotRole } from './telegramUserService';
import { MaterialService } from './materialService';
import { TelegramService } from './telegramService';
import { PDFReportService } from './pdfReportService';
import { PhotoOrderService } from './photoOrderService';
import { ImageProcessingService } from './imageProcessingService';
import { getDb } from '../db';
import {
  buildPrintcorePoligraphyUrlKeyboard,
  getPrintcorePoligraphyIntroText
} from '../utils/printcorePoligraphyBotLinks';
import { getMiniappWebAppUrl } from '../utils/miniappWebAppUrl';

export interface BotCommand {
  command: string;
  description: string;
  roles: string[]; // Какие роли могут использовать команду
  handler: (chatId: string, userId: string, args?: string[]) => Promise<string>;
}

/** Пользователи часто пишут слитно, без _ — приводим к каноническому имени */
const TELEGRAM_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  '/orderphoto': '/order_photo',
  '/myorders': '/my_orders',
  '/stockpdf': '/stock_pdf',
  '/stockreport': '/stock_report',
  '/print': '/poligrafy',
  '/printcore': '/poligrafy',
  '/polygraphy': '/poligrafy',
  '/shop': '/miniapp',
};

function resolveTelegramCommandName(firstToken: string): string {
  const base = firstToken.includes('@') ? (firstToken.split('@')[0] as string) : firstToken;
  const key = base.toLowerCase();
  return TELEGRAM_COMMAND_ALIASES[key] ?? key;
}

export class TelegramBotCommands {
  private static commands: BotCommand[] = [
    {
      command: '/start',
      description: 'Начать работу с ботом',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleStart
    },
    {
      command: '/help',
      description: 'Показать доступные команды',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleHelp
    },
    {
      command: '/stock',
      description: 'Проверить остатки материалов (только для менеджеров и админов)',
      roles: ['manager', 'admin'],
      handler: TelegramBotCommands.handleStockCheck
    },
    {
      command: '/stock_pdf',
      description: 'Получить отчет об остатках в PDF (только для админов)',
      roles: ['admin'],
      handler: TelegramBotCommands.handleStockPDF
    },
    {
      command: '/stock_report',
      description: 'Получить подробный отчет об остатках текстом (только для админов)',
      roles: ['admin'],
      handler: TelegramBotCommands.handleStockReport
    },
    {
      command: '/profile',
      description: 'Показать информацию о профиле',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleProfile
    },
    {
      command: '/order_photo',
      description: 'Заказать печать фотографий',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleOrderPhoto
    },
    {
      command: '/my_orders',
      description: 'Показать мои заказы фото',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleMyOrders
    },
    {
      command: '/poligrafy',
      description: 'Ссылки на полиграфию на сайте printcore.by',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handlePoligrafySiteLinks
    },
    {
      command: '/miniapp',
      description: 'Открыть витрину Mini App (кнопка web_app)',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleMiniappWebView
    }
  ];

  /**
   * Обработка команды /start
   */
  static async handleStart(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return `👋 Добро пожаловать! Вы были автоматически добавлены в систему.\n\n` +
               `📋 Доступные команды:\n` +
               `/help - показать все команды\n` +
               `/profile - информация о профиле\n` +
               `/poligrafy - полиграфия на сайте (кнопки-ссылки)\n` +
               `/miniapp - витрина Mini App (кнопка в Telegram)\n\n` +
               `💡 Для получения дополнительных возможностей обратитесь к администратору.`;
      }

      const r = effectiveBotRole(user.role);
      const roleEmoji = r === 'admin' ? '👑' : r === 'manager' ? '👨‍💼' : '👤';
      
      return `👋 Привет, ${user.first_name || 'пользователь'}!\n\n` +
             `${roleEmoji} Ваша роль: ${r}\n` +
             `📋 Доступные команды:\n` +
             `/help - показать все команды\n` +
             `/profile - информация о профиле\n` +
             `/poligrafy - полиграфия на сайте (кнопки-ссылки)\n` +
             `/miniapp - витрина Mini App (кнопка в Telegram)\n\n` +
             `💡 Для получения дополнительных возможностей используйте /help`;
    } catch (error) {
      console.error('❌ Error in handleStart:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /help
   */
  static async handleHelp(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден. Обратитесь к администратору.';
      }

      const effRole = effectiveBotRole(user.role);
      const availableCommands = TelegramBotCommands.commands.filter((cmd) =>
        cmd.roles.includes(effRole)
      );

      let helpText = `📋 Доступные команды для роли "${effRole}":\n\n`;
      
      availableCommands.forEach(cmd => {
        helpText += `${cmd.command} - ${cmd.description}\n`;
      });

      helpText += `\n💡 Время: ${new Date().toLocaleString('ru-RU')}`;
      
      return helpText;
    } catch (error) {
      console.error('❌ Error in handleHelp:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /stock
   */
  static async handleStockCheck(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден.';
      }

      if (!['manager', 'admin'].includes(effectiveBotRole(user.role))) {
        return '❌ У вас нет прав для выполнения этой команды.';
      }

      console.log(`📊 User ${user.first_name} (${user.role}) requested stock check at ${new Date().toLocaleString()}`);

      // Получаем актуальные данные об остатках
      const materials = await MaterialService.getLowStockMaterials();
      const allMaterials = await MaterialService.getAllMaterials();

      if (materials.length === 0) {
        return `✅ Все материалы в норме!\n\n` +
               `📊 Общее количество материалов: ${allMaterials.length}\n` +
               `⏰ Проверено: ${new Date().toLocaleString('ru-RU')}`;
      }

      let message = `🚨 Материалы с низкими остатками:\n\n`;
      
      materials.forEach((material: any, index: number) => {
        const status = material.quantity <= 0 ? '🔴 НЕТ В НАЛИЧИИ' : 
                      material.quantity <= material.min_quantity ? '🟡 НИЗКИЙ ОСТАТОК' : '🟢 В НОРМЕ';
        
        message += `${index + 1}. ${material.name}\n`;
        message += `   📦 Остаток: ${material.quantity} ${material.unit}\n`;
        message += `   ⚠️ Минимум: ${material.min_quantity} ${material.unit}\n`;
        message += `   ${status}\n\n`;
      });

      message += `📊 Всего материалов с проблемами: ${materials.length}\n`;
      message += `📋 Общее количество материалов: ${allMaterials.length}\n`;
      message += `⏰ Проверено: ${new Date().toLocaleString('ru-RU')}`;

      return message;
    } catch (error) {
      console.error('❌ Error in handleStockCheck:', error);
      return '❌ Произошла ошибка при проверке остатков. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /stock_pdf
   */
  static async handleStockPDF(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден.';
      }

      if (effectiveBotRole(user.role) !== 'admin') {
        return '❌ Эта команда доступна только администраторам.';
      }

      console.log(`📄 Admin ${user.first_name} requested stock PDF at ${new Date().toLocaleString()}`);

      // Генерируем PDF отчет
      const reportBuffer = await PDFReportService.generateStockReport(user.first_name || 'Admin');
      
      // Сохраняем отчет в файл
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `stock-report-${timestamp}.pdf`;
      const filePath = await PDFReportService.saveReportToFile(reportBuffer, filename);
      
      // Отправляем файл пользователю
      const fileSent = await TelegramService.sendDocumentToUser(chatId, filePath, `📊 Отчет об остатках материалов\n\n⏰ Сгенерирован: ${new Date().toLocaleString('ru-RU')}\n👤 Администратор: ${user.first_name}`);
      
      if (fileSent) {
        return `✅ PDF отчет об остатках материалов отправлен!\n\n` +
               `⏰ Время генерации: ${new Date().toLocaleString('ru-RU')}\n` +
               `👤 Сгенерировал: ${user.first_name} (${user.role})\n` +
               `📄 Файл: ${filename}`;
      } else {
        // Если файл не отправился, отправляем текстовый отчет
        console.log('📄 File sending failed, sending text report instead...');
        const textReport = await TelegramBotCommands.handleStockReport(chatId, userId);
        return `❌ Не удалось отправить PDF файл. Отправляю текстовый отчет:\n\n${textReport}`;
      }
    } catch (error) {
      console.error('❌ Error in handleStockPDF:', error);
      return '❌ Произошла ошибка при генерации PDF. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /stock_report
   */
  static async handleStockReport(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден.';
      }

      if (effectiveBotRole(user.role) !== 'admin') {
        return '❌ Эта команда доступна только администраторам.';
      }

      console.log(`📊 Admin ${user.first_name} requested detailed stock report at ${new Date().toLocaleString()}`);

      // Получаем все материалы
      const allMaterials = await MaterialService.getAllMaterials();
      
      // Сортируем по статусу (проблемные сначала)
      const sortedMaterials = allMaterials.sort((a: any, b: any) => {
        const getStatus = (material: any) => {
          if (material.quantity <= 0) return 0; // out_of_stock
          if (material.quantity <= material.min_quantity) return 1; // critical
          if (material.quantity <= material.min_quantity * 1.5) return 2; // low
          return 3; // ok
        };
        return getStatus(a) - getStatus(b);
      });

      // Подсчитываем статистику
      const stats = {
        total: allMaterials.length,
        out_of_stock: allMaterials.filter((m: any) => m.quantity <= 0).length,
        critical: allMaterials.filter((m: any) => m.quantity > 0 && m.quantity <= m.min_quantity).length,
        low: allMaterials.filter((m: any) => m.quantity > m.min_quantity && m.quantity <= m.min_quantity * 1.5).length,
        ok: allMaterials.filter((m: any) => m.quantity > m.min_quantity * 1.5).length
      };

      let report = `📊 *ПОДРОБНЫЙ ОТЧЕТ ОБ ОСТАТКАХ МАТЕРИАЛОВ*\n\n`;
      report += `⏰ Сгенерирован: ${new Date().toLocaleString('ru-RU')}\n`;
      report += `👤 Администратор: ${user.first_name}\n\n`;
      
      report += `📈 *СТАТИСТИКА:*\n`;
      report += `🔴 Нет в наличии: ${stats.out_of_stock}\n`;
      report += `🟡 Критический уровень: ${stats.critical}\n`;
      report += `🟠 Низкий остаток: ${stats.low}\n`;
      report += `🟢 В норме: ${stats.ok}\n`;
      report += `📦 Всего материалов: ${stats.total}\n\n`;

      // Показываем проблемные материалы
      const problematicMaterials = sortedMaterials.filter((m: any) => 
        m.quantity <= m.min_quantity * 1.5
      );

      if (problematicMaterials.length > 0) {
        report += `🚨 *МАТЕРИАЛЫ ТРЕБУЮЩИЕ ВНИМАНИЯ:*\n\n`;
        
        problematicMaterials.forEach((material: any, index: number) => {
          const status = material.quantity <= 0 ? '🔴 НЕТ В НАЛИЧИИ' : 
                        material.quantity <= material.min_quantity ? '🟡 КРИТИЧЕСКИЙ' : '🟠 НИЗКИЙ';
          
          report += `${index + 1}. *${material.name}*\n`;
          report += `   📦 Остаток: ${material.quantity} ${material.unit}\n`;
          report += `   ⚠️ Минимум: ${material.min_quantity} ${material.unit}\n`;
          report += `   ${status}\n`;
          if (material.supplier_name) {
            report += `   🏢 Поставщик: ${material.supplier_name}\n`;
          }
          report += `\n`;
        });
      } else {
        report += `✅ *ВСЕ МАТЕРИАЛЫ В НОРМЕ!*\n\n`;
      }

      // Показываем материалы в норме (первые 10)
      const okMaterials = sortedMaterials.filter((m: any) => 
        m.quantity > m.min_quantity * 1.5
      ).slice(0, 10);

      if (okMaterials.length > 0) {
        report += `🟢 *МАТЕРИАЛЫ В НОРМЕ* (показаны первые 10):\n\n`;
        
        okMaterials.forEach((material: any, index: number) => {
          report += `${index + 1}. ${material.name} - ${material.quantity} ${material.unit}\n`;
        });
        
        if (stats.ok > 10) {
          report += `\n... и еще ${stats.ok - 10} материалов в норме`;
        }
      }

      report += `\n\n💡 *Рекомендации:*\n`;
      if (stats.out_of_stock > 0) {
        report += `• Срочно заказать ${stats.out_of_stock} материалов\n`;
      }
      if (stats.critical > 0) {
        report += `• Пополнить ${stats.critical} материалов с критическим уровнем\n`;
      }
      if (stats.low > 0) {
        report += `• Планировать заказ ${stats.low} материалов с низким остатком\n`;
      }

      return report;
    } catch (error) {
      console.error('❌ Error in handleStockReport:', error);
      return '❌ Произошла ошибка при генерации отчета. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /profile
   */
  static async handleProfile(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден.';
      }

      const r = effectiveBotRole(user.role);
      const roleEmoji = r === 'admin' ? '👑' : r === 'manager' ? '👨‍💼' : '👤';
      
      const notificationsStatus = user.notifications_enabled ? '✅ Включены' : '❌ Отключены';
      
      let preferences = '';
      if (user.notification_preferences) {
        preferences = `\n📋 Настройки уведомлений:\n`;
        preferences += `• Низкие остатки: ${user.notification_preferences.low_stock ? '✅' : '❌'}\n`;
        preferences += `• Новые заказы: ${user.notification_preferences.new_orders ? '✅' : '❌'}\n`;
        preferences += `• Системные: ${user.notification_preferences.system_alerts ? '✅' : '❌'}`;
      }

      return `👤 Информация о профиле:\n\n` +
             `👤 Имя: ${user.first_name || 'Не указано'}\n` +
             `📝 Username: @${user.username || 'Не указан'}\n` +
             `${roleEmoji} Роль: ${r}\n` +
             `📱 Chat ID: ${user.chat_id}\n` +
             `🔔 Уведомления: ${notificationsStatus}\n` +
             `📅 Регистрация: ${new Date(user.created_at).toLocaleString('ru-RU')}` +
             preferences;
    } catch (error) {
      console.error('❌ Error in handleProfile:', error);
      return '❌ Произошла ошибка при получении профиля. Попробуйте позже.';
    }
  }

  /**
   * Обработка входящего сообщения
   */
  static async handleMessage(chatId: string, userId: string, text: string): Promise<string | null> {
    try {
      // Проверяем, является ли сообщение командой
      if (!text.startsWith('/')) {
        return null; // Не команда, пропускаем
      }

      const parts = text.trim().split(/\s+/);
      const firstToken = parts[0] || '';
      const command = resolveTelegramCommandName(firstToken);
      const args = parts.slice(1);
      const cmd = TelegramBotCommands.commands.find((c) => c.command === command);

      if (!cmd) {
        return `❌ Неизвестная команда: ${command}\n\n` +
               `Используйте /help для просмотра доступных команд.`;
      }

      // Проверяем права доступа
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return '❌ Пользователь не найден. Обратитесь к администратору.';
      }

      const effRole = effectiveBotRole(user.role);
      if (!cmd.roles.includes(effRole)) {
        return `❌ У вас нет прав для выполнения команды ${command}.\n\n` +
               `Ваша роль: ${effRole}\n` +
               `Требуемые роли: ${cmd.roles.join(', ')}`;
      }

      // Выполняем команду
      return await cmd.handler(chatId, userId, args);
    } catch (error) {
      console.error('❌ Error in handleMessage:', error);
      return '❌ Произошла ошибка при обработке команды. Попробуйте позже.';
    }
  }

  /**
   * Ссылки на разделы полиграфии на сайте (тестовый обход без Mini App).
   */
  static async handlePoligrafySiteLinks(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return '❌ Пользователь не найден.';
      }
      await TelegramService.sendMessageWithKeyboard(
        chatId,
        getPrintcorePoligraphyIntroText(),
        buildPrintcorePoligraphyUrlKeyboard()
      );
      return '🖨️ Сообщение со ссылками отправлено.';
    } catch (error) {
      console.error('❌ Error in handlePoligrafySiteLinks:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Кнопка Web App: открывает MINIAPP_WEBAPP_URL (HTTPS, тот же хост что у API, если не задано иное)
   */
  static async handleMiniappWebView(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return '❌ Пользователь не найден.';
      }
      const url = getMiniappWebAppUrl();
      if (!url) {
        return (
          '⚠️ *Mini App не настроен.*\n\n' +
          'На сервере задайте `MINIAPP_WEBAPP_URL` — полный HTTPS-URL до страницы, ' +
          'например: `https://ваш-api.railway.app/miniapp`'
        );
      }
      const text =
        `*Витрина PrintCore (Mini App)*\n\n` + `Нажмите кнопку ниже. После открытия проверяется *initData* и сессия API.`;
      await TelegramService.sendMessageWithKeyboard(chatId, text, {
        inline_keyboard: [
          [{ text: '📱 Открыть витрину', web_app: { url } }],
        ],
      });
      return '📱 Сообщение с кнопкой Mini App отправлено.';
    } catch (error) {
      console.error('❌ Error in handleMiniappWebView:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /order_photo
   */
  static async handleOrderPhoto(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден.';
      }

      const message = `📸 *Заказ печати фото*\n\n` +
                     `1) Выберите размер — дальше пришлите фото в чат.\n` +
                     `По умолчанию: вписать с полями, 1 копия.\n\n` +
                     `👤 ${user.first_name || 'Клиент'}\n\n` +
                     `*Размер:*`;

      // Отправляем сообщение с inline клавиатурой
      await TelegramService.sendMessageWithKeyboard(chatId, message, TelegramBotCommands.getSizeSelectionKeyboard());

      return '📸 Отправлено меню выбора размера';
    } catch (error) {
      console.error('❌ Error in handleOrderPhoto:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Создание клавиатуры для выбора размера
   */
  static getSizeSelectionKeyboard() {
    const sizes = ImageProcessingService.getAvailableSizes();
    const prices = PhotoOrderService.getAllPrices();

    const keyboard = {
      inline_keyboard: sizes.map(size => {
        const price = prices[size.name] || 0;
        const priceRub = (price / 100).toFixed(0);
        return [{
          text: `📏 ${size.name} - ${priceRub} руб.`,
          callback_data: `size_${size.name}`
        }];
      })
    };

    return keyboard;
  }

  /**
   * Обработка команды /my_orders
   */
  static async handleMyOrders(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return '❌ Пользователь не найден.';
      }

      const orders = await PhotoOrderService.getOrdersByChatId(chatId);

      if (orders.length === 0) {
        return `📋 У вас пока нет заказов фотографий.\n\n` +
               `💡 Используйте /order_photo для создания нового заказа.`;
      }

      let message = `📋 *ВАШИ ЗАКАЗЫ ФОТОГРАФИЙ*\n\n`;
      message += `👤 Клиент: ${user.first_name || 'Не указано'}\n`;
      message += `📊 Всего заказов: ${orders.length}\n\n`;

      orders.forEach((order, index) => {
        const statusEmoji = {
          'pending': '⏳',
          'processing': '🔄',
          'ready_for_approval': '👀',
          'approved': '✅',
          'rejected': '❌',
          'completed': '🎉'
        }[order.status] || '❓';

        const statusText = {
          'pending': 'Ожидает',
          'processing': 'Обрабатывается',
          'ready_for_approval': 'Готов к подтверждению',
          'approved': 'Подтвержден',
          'rejected': 'Отклонен',
          'completed': 'Выполнен'
        }[order.status] || 'Неизвестно';

        const totalPriceRub = (order.totalPrice / 100).toFixed(0);

        message += `${index + 1}. ${statusEmoji} *Заказ #${order.id}*\n`;
        message += `   📏 Размер: ${order.selectedSize.name}\n`;
        message += `   📸 Фото: ${order.originalPhotos.length} шт.\n`;
        message += `   📦 Копий: ${order.quantity}\n`;
        message += `   💰 Стоимость: ${totalPriceRub} руб.\n`;
        message += `   📊 Статус: ${statusText}\n`;
        message += `   📅 Создан: ${new Date(order.createdAt).toLocaleString('ru-RU')}\n\n`;
      });

      message += `💡 *УПРАВЛЕНИЕ ЗАКАЗАМИ:*\n`;
      message += `• Для подтверждения заказа ответьте "Подтвердить #номер"\n`;
      message += `• Для отмены заказа ответьте "Отменить #номер"\n`;
      message += `• Для просмотра деталей ответьте "Детали #номер"`;

      return message;
    } catch (error) {
      console.error('❌ Error in handleMyOrders:', error);
      return '❌ Произошла ошибка при получении заказов. Попробуйте позже.';
    }
  }

  /**
   * Получение списка команд для настройки бота
   */
  static getBotCommands(): Array<{command: string, description: string}> {
    return TelegramBotCommands.commands.map((cmd) => ({
      command: cmd.command,
      description: cmd.description
    }));
  }
}
