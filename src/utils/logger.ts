// Уровни логирования
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

// Конфигурация логирования
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  maxStorageEntries: number;
  enableRemoteLogging: boolean;
  remoteEndpoint?: string;
}

// Интерфейс для записи лога
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  userId?: string;
  sessionId?: string;
}

class Logger {
  private config: LoggerConfig;
  private sessionId: string;
  private logs: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableStorage: true,
      maxStorageEntries: 1000,
      enableRemoteLogging: false,
      ...config,
    };
    
    this.sessionId = this.generateSessionId();
    this.loadStoredLogs();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadStoredLogs(): void {
    if (!this.config.enableStorage) return;
    
    try {
      const stored = localStorage.getItem('app_logs');
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load stored logs:', error);
    }
  }

  private saveLogs(): void {
    if (!this.config.enableStorage) return;
    
    try {
      // Ограничиваем количество записей
      if (this.logs.length > this.config.maxStorageEntries) {
        this.logs = this.logs.slice(-this.config.maxStorageEntries);
      }
      
      localStorage.setItem('app_logs', JSON.stringify(this.logs));
    } catch (error) {
      console.warn('Failed to save logs:', error);
    }
  }

  private async sendToRemote(entry: LogEntry): Promise<void> {
    if (!this.config.enableRemoteLogging || !this.config.remoteEndpoint) return;
    
    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      console.warn('Failed to send log to remote:', error);
    }
  }

  private log(level: LogLevel, category: string, message: string, data?: any): void {
    if (level > this.config.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
    };

    // Добавляем в массив
    this.logs.push(entry);

    // Выводим в консоль
    if (this.config.enableConsole) {
      const levelName = LogLevel[level];
      const prefix = `[${levelName}] [${category}]`;
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(prefix, message, data);
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, data);
          break;
        case LogLevel.INFO:
          console.info(prefix, message, data);
          break;
        case LogLevel.DEBUG:
          console.debug(prefix, message, data);
          break;
      }
    }

    // Сохраняем в localStorage
    this.saveLogs();

    // Отправляем на сервер (асинхронно)
    if (this.config.enableRemoteLogging) {
      this.sendToRemote(entry).catch(() => {
        // Игнорируем ошибки отправки
      });
    }
  }

  private getCurrentUserId(): string | undefined {
    try {
      return localStorage.getItem('crmUserId') || undefined;
    } catch {
      return undefined;
    }
  }

  // Публичные методы
  error(category: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  warn(category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  info(category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  debug(category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  // Специальные методы для API
  apiError(endpoint: string, error: any, requestData?: any): void {
    this.error('API', `Request to ${endpoint} failed`, {
      endpoint,
      error: error.message || error,
      status: error.response?.status,
      requestData,
    });
  }

  apiSuccess(endpoint: string, responseData?: any): void {
    this.info('API', `Request to ${endpoint} successful`, {
      endpoint,
      responseData,
    });
  }

  // Методы для работы с логами
  getLogs(level?: LogLevel, category?: string): LogEntry[] {
    let filtered = this.logs;
    
    if (level !== undefined) {
      filtered = filtered.filter(entry => entry.level === level);
    }
    
    if (category) {
      filtered = filtered.filter(entry => entry.category === category);
    }
    
    return filtered;
  }

  clearLogs(): void {
    this.logs = [];
    if (this.config.enableStorage) {
      localStorage.removeItem('app_logs');
    }
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Обновление конфигурации
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Создаем экземпляр логгера
export const logger = new Logger({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableStorage: true,
  maxStorageEntries: 500,
  enableRemoteLogging: false, // Можно включить в продакшене
});

// Хук для использования в React компонентах
export const useLogger = (category: string) => {
  return {
    error: (message: string, data?: any) => logger.error(category, message, data),
    warn: (message: string, data?: any) => logger.warn(category, message, data),
    info: (message: string, data?: any) => logger.info(category, message, data),
    debug: (message: string, data?: any) => logger.debug(category, message, data),
  };
};

// Утилиты для работы с логами
export const logUtils = {
  // Получить логи за последние N часов
  getRecentLogs: (hours: number = 24): LogEntry[] => {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return logger.getLogs().filter(entry => 
      new Date(entry.timestamp) > cutoff
    );
  },

  // Получить ошибки за последние N часов
  getRecentErrors: (hours: number = 24): LogEntry[] => {
    return logUtils.getRecentLogs(hours).filter(entry => entry.level === LogLevel.ERROR);
  },

  // Получить статистику логов
  getLogStats: (): { total: number; errors: number; warnings: number; info: number; debug: number } => {
    const logs = logger.getLogs();
    return {
      total: logs.length,
      errors: logs.filter(l => l.level === LogLevel.ERROR).length,
      warnings: logs.filter(l => l.level === LogLevel.WARN).length,
      info: logs.filter(l => l.level === LogLevel.INFO).length,
      debug: logs.filter(l => l.level === LogLevel.DEBUG).length,
    };
  },
};


