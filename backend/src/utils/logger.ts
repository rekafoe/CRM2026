// Production-ready logger для backend
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  
  private constructor() {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.logLevel = process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    
    if (envLevel === 'DEBUG') this.logLevel = LogLevel.DEBUG;
    else if (envLevel === 'INFO') this.logLevel = LogLevel.INFO;
    else if (envLevel === 'WARN') this.logLevel = LogLevel.WARN;
    else if (envLevel === 'ERROR') this.logLevel = LogLevel.ERROR;
  }
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const base = `[${level}] ${timestamp} - ${message}`;
    if (data) {
      // В production минимизируем вывод
      if (process.env.NODE_ENV === 'production') {
        return `${base} ${JSON.stringify(data)}`;
      }
      return `${base}\n${JSON.stringify(data, null, 2)}`;
    }
    return base;
  }

  info(message: string, data?: any): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  error(message: string, data?: any): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, data));
    }
  }
}

export const logger = Logger.getInstance();

