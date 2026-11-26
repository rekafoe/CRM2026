import { TelegramUserService, effectiveBotRole } from './telegramUserService';
import { TelegramService } from './telegramService';
import { getMiniappWebAppUrl, withMiniappOrder, withMiniappRepeat } from '../utils/miniappWebAppUrl';
import {
  buildPickupBranchesText,
  createMiniappPaymentLink,
  findOwnedMiniappOrder,
  formatOwnedOrderStatus,
} from './miniappClientCommandService';
import { buildTelegramActiveOrdersText, listTelegramActiveOrders } from './telegramOrderStatusService';
import { SupportService } from '../modules/support/supportService';

export interface BotCommand {
  command: string;
  description: string;
  roles: string[]; // Какие роли могут использовать команду
  handler: (chatId: string, userId: string, args?: string[]) => Promise<string | null>;
}

const TELEGRAM_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  '/shop': '/miniapp',
};

function resolveTelegramCommandName(firstToken: string): string {
  const base = firstToken.includes('@') ? (firstToken.split('@')[0] as string) : firstToken;
  const key = base.toLowerCase();
  return TELEGRAM_COMMAND_ALIASES[key] ?? key;
}

export class TelegramBotCommands {
  static readonly STATUS_BUTTON_TEXT = 'Показать мои заказы';
  static readonly PRINTCORE_APP_BUTTON_TEXT = 'Открыть PrintCore App';

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
      command: '/miniapp',
      description: 'Открыть PrintCore App',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleMiniappWebView
    },
    {
      command: '/orders',
      description: 'Показать активные заказы',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleOrdersCommand
    },
    {
      command: '/track',
      description: 'Статус заказа: /track <номер>',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleTrackCommand
    },
    {
      command: '/pay',
      description: 'Оплатить заказ: /pay <номер>',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handlePayCommand
    },
    {
      command: '/reorder',
      description: 'Повторить заказ: /reorder <номер>',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleReorderCommand
    },
    {
      command: '/support',
      description: 'Написать в поддержку',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handleSupportCommand
    },
    {
      command: '/pickup',
      description: 'Адреса самовывоза',
      roles: ['client', 'manager', 'admin'],
      handler: TelegramBotCommands.handlePickupCommand
    }
  ];

  private static activeOrdersEmptyHint(): string {
    return 'Активных заказов сейчас нет. Для нового заказа используйте PrintCore App или команду /miniapp.';
  }

  private static async activeOrdersOrHint(chatId: string): Promise<string> {
    const activeOrdersText = await buildTelegramActiveOrdersText(chatId);
    return activeOrdersText || TelegramBotCommands.activeOrdersEmptyHint();
  }

  private static buildMainKeyboard() {
    return {
      keyboard: [
        [{ text: TelegramBotCommands.STATUS_BUTTON_TEXT }],
        [{ text: TelegramBotCommands.PRINTCORE_APP_BUTTON_TEXT }],
        [{ text: '/help' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  static async sendMessageWithMainKeyboard(chatId: string, message: string): Promise<boolean> {
    return TelegramService.sendMessageWithKeyboard(chatId, message, TelegramBotCommands.buildMainKeyboard());
  }

  /**
   * Обработка команды /start
   */
  static async handleStart(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        const activeOrdersText = await TelegramBotCommands.activeOrdersOrHint(chatId);
        return `Добро пожаловать! Вы были автоматически добавлены в систему.\n\n` +
               `Доступные команды:\n` +
               `/help - показать все команды\n` +
               `/miniapp - открыть PrintCore App\n\n` +
               `${activeOrdersText}`;
      }

      const r = effectiveBotRole(user.role);
      const roleEmoji = r === 'admin' ? '' : r === 'manager' ? '' : '';
      const activeOrdersText = await TelegramBotCommands.activeOrdersOrHint(chatId);
      
      return `Привет, ${user.first_name || 'пользователь'}!\n\n` +
             `${roleEmoji} Ваша роль: ${r}\n` +
             `Доступные команды:\n` +
             `/help - показать все команды\n` +
             `/miniapp - открыть PrintCore App\n\n` +
             `${activeOrdersText}`;
    } catch (error) {
      console.error('Error in handleStart:', error);
      return 'Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Обработка команды /help
   */
  static async handleHelp(chatId: string, userId: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      
      if (!user) {
        return 'Пользователь не найден. Обратитесь к администратору.';
      }

      const effRole = effectiveBotRole(user.role);
      const availableCommands = TelegramBotCommands.commands.filter((cmd) =>
        cmd.roles.includes(effRole)
      );
      const activeOrdersText = await TelegramBotCommands.activeOrdersOrHint(chatId);

      let helpText = `Доступные команды для роли "${effRole}":\n\n`;
      
      availableCommands.forEach(cmd => {
        helpText += `${cmd.command} - ${cmd.description}\n`;
      });

      helpText += `\n${activeOrdersText}`;
      
      return helpText;
    } catch (error) {
      console.error('Error in handleHelp:', error);
      return 'Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Обработка входящего сообщения
   */
  static async handleMessage(chatId: string, userId: string, text: string): Promise<string | null> {
    try {
      const normalizedText = text.trim();
      if (normalizedText === TelegramBotCommands.PRINTCORE_APP_BUTTON_TEXT) {
        return TelegramBotCommands.handleMiniappWebView(chatId, userId);
      }
      if (normalizedText === TelegramBotCommands.STATUS_BUTTON_TEXT) {
        return TelegramBotCommands.handleTextFallback(chatId, userId, text);
      }

      if (!text.startsWith('/')) {
        return TelegramBotCommands.handleClientFreeText(chatId, normalizedText);
      }

      const parts = text.trim().split(/\s+/);
      const firstToken = parts[0] || '';
      const command = resolveTelegramCommandName(firstToken);
      const args = parts.slice(1);
      const cmd = TelegramBotCommands.commands.find((c) => c.command === command);

      if (!cmd) {
        return TelegramBotCommands.handleTextFallback(chatId, userId, text);
      }

      // Проверяем права доступа
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return 'Пользователь не найден. Обратитесь к администратору.';
      }

      const effRole = effectiveBotRole(user.role);
      if (!cmd.roles.includes(effRole)) {
        return `У вас нет прав для выполнения команды ${command}.\n\n` +
               `Ваша роль: ${effRole}\n` +
               `Требуемые роли: ${cmd.roles.join(', ')}`;
      }

      // Выполняем команду
      return await cmd.handler(chatId, userId, args);
    } catch (error) {
      console.error('Error in handleMessage:', error);
      return 'Произошла ошибка при обработке команды. Попробуйте позже.';
    }
  }

  static isClientFreeText(text: string): boolean {
    const normalized = text.trim();
    if (!normalized || normalized.startsWith('/')) return false;
    if (normalized === TelegramBotCommands.STATUS_BUTTON_TEXT) return false;
    if (normalized === TelegramBotCommands.PRINTCORE_APP_BUTTON_TEXT) return false;
    return true;
  }

  /**
   * Свободный текст клиента — входящее в чат поддержки. Команды и кнопка заказов сюда не попадают.
   */
  static async handleClientFreeText(chatId: string, text: string): Promise<string> {
    if (!TelegramBotCommands.isClientFreeText(text)) {
      return TelegramBotCommands.handleTextFallback(chatId, '', text);
    }
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) return 'Пользователь не найден.';
      if (effectiveBotRole(user.role) !== 'client') {
        return TelegramBotCommands.activeOrdersOrHint(chatId);
      }
      await SupportService.ingestTelegramChat(chatId, text);
      return 'Сообщение передано менеджеру. Ответим в этом чате.';
    } catch (error) {
      console.error('Error in handleClientFreeText:', error);
      return 'Не удалось передать сообщение. Попробуйте ещё раз.';
    }
  }

  static async handleOrdersCommand(chatId: string): Promise<string> {
    return TelegramBotCommands.activeOrdersOrHint(chatId);
  }

  static async handleTrackCommand(chatId: string, _userId: string, args?: string[]): Promise<string> {
    const reference = args?.[0];
    if (!reference) return 'Укажите номер заказа: /track MAP-123 или /track 123.';
    const order = await findOwnedMiniappOrder(chatId, reference);
    if (!order) return 'Заказ не найден или принадлежит другому пользователю.';
    await TelegramBotCommands.sendOrderLinkButton(chatId, order.id);
    return formatOwnedOrderStatus(order);
  }

  static async handlePayCommand(chatId: string, _userId: string, args?: string[]): Promise<string> {
    const reference = args?.[0];
    if (!reference) return 'Укажите номер заказа: /pay MAP-123 или /pay 123.';
    const order = await findOwnedMiniappOrder(chatId, reference);
    if (!order) return 'Заказ не найден или принадлежит другому пользователю.';
    try {
      const paymentUrl = await createMiniappPaymentLink(chatId, order.id);
      return `Оплата ${order.number || `заказа #${order.id}`}:\n${paymentUrl}`;
    } catch (error: any) {
      if (error?.code === 'MINIAPP_ORDER_PAID') return 'Этот заказ уже оплачен.';
      console.error('Mini App payment command failed:', error?.message || error);
      return error?.message || 'Не удалось сформировать ссылку на оплату. Попробуйте позже.';
    }
  }

  static async handleReorderCommand(chatId: string, _userId: string, args?: string[]): Promise<string> {
    const reference = args?.[0];
    if (!reference) return 'Укажите номер заказа: /reorder MAP-123 или /reorder 123.';
    const order = await findOwnedMiniappOrder(chatId, reference);
    if (!order) return 'Заказ не найден или принадлежит другому пользователю.';
    const base = getMiniappWebAppUrl();
    if (!base) return 'PrintCore App не настроен: задайте MINIAPP_WEBAPP_URL.';
    const url = withMiniappRepeat(base, order.id);
    if (!url) return 'Не удалось сформировать ссылку на повтор заказа.';
    await TelegramService.sendMessageWithKeyboard(chatId, 'Повторить заказ с теми же параметрами:', {
      inline_keyboard: [[{ text: 'Повторить в PrintCore App', web_app: { url } }]],
    });
    return 'Откройте приложение, проверьте параметры и оформите новый заказ.';
  }

  static async handleSupportCommand(chatId: string): Promise<string> {
    return TelegramBotCommands.handleClientFreeText(chatId, 'Нужна помощь оператора');
  }

  static async handlePickupCommand(): Promise<string> {
    return buildPickupBranchesText();
  }

  private static async sendOrderLinkButton(chatId: string, orderId: number): Promise<void> {
    const base = getMiniappWebAppUrl();
    if (!base) return;
    const url = withMiniappOrder(base, orderId);
    if (!url) return;
    await TelegramService.sendMessageWithKeyboard(chatId, 'Открыть заказ в PrintCore App:', {
      inline_keyboard: [[{ text: 'Открыть заказ', web_app: { url } }]],
    });
  }

  static async sendOrderOpenButtons(chatId: string): Promise<void> {
    const base = getMiniappWebAppUrl();
    if (!base) return;
    const orders = await listTelegramActiveOrders(chatId, { limit: 8 });
    const inline_keyboard = orders.flatMap((order) => {
      const url = withMiniappOrder(base, order.id);
      if (!url) return [];
      const label = `Заказ ${order.number || `#${order.id}`}`.slice(0, 64);
      return [[{ text: label, web_app: { url } }]];
    });
    if (inline_keyboard.length === 0) return;
    await TelegramService.sendMessageWithKeyboard(
      chatId,
      'Открыть заказ во вкладке «Заказы»:',
      { inline_keyboard },
    );
  }

  static async handleTextFallback(chatId: string, userId: string, text?: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return 'Пользователь не найден.';
      }
      return TelegramBotCommands.activeOrdersOrHint(chatId);
    } catch (error) {
      console.error('Error in handleTextFallback:', error);
      return 'Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Кнопка Web App: открывает PrintCore App
   */
  static async handleMiniappWebView(chatId: string, userId: string): Promise<string | null> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return 'Пользователь не найден.';
      }
      const url = getMiniappWebAppUrl();
      if (!url) {
        return (
          '*PrintCore App не настроен.*\n\n' +
          'На сервере задайте `MINIAPP_WEBAPP_URL` — полный HTTPS-URL до страницы, ' +
          'например: `https://ваш-api.railway.app/miniapp`'
        );
      }
      const text =
        `*PrintCore App*\n\nНажмите кнопку ниже, чтобы открыть приложение.`;
      await TelegramService.sendMessageWithKeyboard(chatId, text, {
        inline_keyboard: [
          [{ text: 'Открыть PrintCore App', web_app: { url } }],
        ],
      });
      return null;
    } catch (error) {
      console.error('Error in handleMiniappWebView:', error);
      return 'Произошла ошибка. Попробуйте позже.';
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
