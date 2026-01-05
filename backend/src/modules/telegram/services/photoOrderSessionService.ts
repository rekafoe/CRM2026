import { logger } from '../../../utils/logger';

interface PhotoOrderSession {
  chatId: string;
  sizeName: string;
  mode: string;
  quantity: number;
  timestamp: number;
}

export class PhotoOrderSessionService {
  private static sessions: Map<string, PhotoOrderSession> = new Map();
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут

  /**
   * Сохранение параметров заказа в сессии
   */
  static saveSession(chatId: string, sizeName: string, mode: string, quantity: number): void {
    const session: PhotoOrderSession = {
      chatId,
      sizeName,
      mode,
      quantity,
      timestamp: Date.now()
    };

    this.sessions.set(chatId, session);
    logger.debug(`Saved photo order session for ${chatId}: ${sizeName}, ${mode}, ${quantity}`);
  }

  /**
   * Получение параметров заказа из сессии
   */
  static getSession(chatId: string): PhotoOrderSession | null {
    const session = this.sessions.get(chatId);
    
    if (!session) {
      return null;
    }

    // Проверяем, не истекла ли сессия
    if (Date.now() - session.timestamp > this.SESSION_TIMEOUT) {
      this.sessions.delete(chatId);
      logger.debug(`Photo order session expired for ${chatId}`);
      return null;
    }

    return session;
  }

  /**
   * Удаление сессии
   */
  static clearSession(chatId: string): void {
    this.sessions.delete(chatId);
    logger.debug(`Cleared photo order session for ${chatId}`);
  }

  /**
   * Очистка истекших сессий
   */
  static cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [chatId, session] of this.sessions.entries()) {
      if (now - session.timestamp > this.SESSION_TIMEOUT) {
        this.sessions.delete(chatId);
        logger.debug(`Cleaned up expired session for ${chatId}`);
      }
    }
  }

  /**
   * Получение всех активных сессий
   */
  static getActiveSessions(): PhotoOrderSession[] {
    this.cleanupExpiredSessions();
    return Array.from(this.sessions.values());
  }
}
