import { TelegramUserService, effectiveBotRole } from './telegramUserService';
import { TelegramService } from './telegramService';
import { getMiniappWebAppUrl } from '../utils/miniappWebAppUrl';
import { buildTelegramActiveOrdersText } from './telegramOrderStatusService';

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
        return `👋 Добро пожаловать! Вы были автоматически добавлены в систему.\n\n` +
               `📋 Доступные команды:\n` +
               `/help - показать все команды\n` +
               `/miniapp - открыть PrintCore App\n\n` +
               `${activeOrdersText}`;
      }

      const r = effectiveBotRole(user.role);
      const roleEmoji = r === 'admin' ? '👑' : r === 'manager' ? '👨‍💼' : '👤';
      const activeOrdersText = await TelegramBotCommands.activeOrdersOrHint(chatId);
      
      return `👋 Привет, ${user.first_name || 'пользователь'}!\n\n` +
             `${roleEmoji} Ваша роль: ${r}\n` +
             `📋 Доступные команды:\n` +
             `/help - показать все команды\n` +
             `/miniapp - открыть PrintCore App\n\n` +
             `${activeOrdersText}`;
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
      const activeOrdersText = await TelegramBotCommands.activeOrdersOrHint(chatId);

      let helpText = `📋 Доступные команды для роли "${effRole}":\n\n`;
      
      availableCommands.forEach(cmd => {
        helpText += `${cmd.command} - ${cmd.description}\n`;
      });

      helpText += `\n${activeOrdersText}`;
      
      return helpText;
    } catch (error) {
      console.error('❌ Error in handleHelp:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
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
        return TelegramBotCommands.handleTextFallback(chatId, userId, text);
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

  static async handleTextFallback(chatId: string, userId: string, text?: string): Promise<string> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return '❌ Пользователь не найден.';
      }
      return TelegramBotCommands.activeOrdersOrHint(chatId);
    } catch (error) {
      console.error('❌ Error in handleTextFallback:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
    }
  }

  /**
   * Кнопка Web App: открывает PrintCore App
   */
  static async handleMiniappWebView(chatId: string, userId: string): Promise<string | null> {
    try {
      const user = await TelegramUserService.getUserByChatId(chatId);
      if (!user) {
        return '❌ Пользователь не найден.';
      }
      const url = getMiniappWebAppUrl();
      if (!url) {
        return (
          '⚠️ *PrintCore App не настроен.*\n\n' +
          'На сервере задайте `MINIAPP_WEBAPP_URL` — полный HTTPS-URL до страницы, ' +
          'например: `https://ваш-api.railway.app/miniapp`'
        );
      }
      const text =
        `*PrintCore App*\n\nНажмите кнопку ниже, чтобы открыть приложение.`;
      await TelegramService.sendMessageWithKeyboard(chatId, text, {
        inline_keyboard: [
          [{ text: '📱 Открыть PrintCore App', web_app: { url } }],
        ],
      });
      return null;
    } catch (error) {
      console.error('❌ Error in handleMiniappWebView:', error);
      return '❌ Произошла ошибка. Попробуйте позже.';
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
