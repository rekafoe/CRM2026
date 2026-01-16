import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import swaggerUi from 'swagger-ui-express'
import { initDB } from './config/database'
import { config } from './config/app'
import { uploadsDir } from './config/upload'
import { authMiddleware, errorHandler, asyncHandler } from './middleware'
import { performanceMiddleware, performanceLoggingMiddleware } from './middleware/performance'
import { compressionMiddleware } from './middleware/compression'
import { cachePresets } from './middleware/httpCache'
import routes from './routes'
import { TelegramService } from './services/telegramService'
import { StockMonitoringService } from './services/stockMonitoringService'
import { AutoOrderService } from './services/autoOrderService'
import { UserNotificationService } from './services/userNotificationService'
import { EarningsService } from './services/earningsService'
import { logger } from './utils/logger'
import { AuthController } from './controllers'
import { swaggerSpec } from './config/swagger'

// Проверяем, что swaggerSpec загружен
if (!swaggerSpec) {
  logger.warn('Swagger spec не загружен, документация может быть недоступна')
}

// Load environment variables
dotenv.config()

const app = express()

// Middleware
app.use(cors({ origin: config.corsOrigin }))

// Swagger JSON endpoint (ДО compressionMiddleware)
app.get('/api-docs.json', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.json(swaggerSpec)
  } catch (error: any) {
    logger.error('Ошибка при отправке Swagger JSON', { error: error.message })
    res.status(500).json({ error: 'Ошибка загрузки Swagger документации' })
  }
})

// Swagger UI (ДО compressionMiddleware, чтобы избежать проблем с заголовками)
try {
  const swaggerUiOptions = {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CRM API Documentation',
    swaggerOptions: {
      url: '/api-docs.json',
      persistAuthorization: true,
    },
  }
  
  // Стандартный способ: массив middleware
  // swaggerUi.serve обрабатывает статические файлы (CSS, JS, и т.д.)
  // swaggerUi.setup обрабатывает главную HTML страницу
  app.use(
    '/api-docs',
    (req, res, next) => {
      // Устанавливаем заголовки для предотвращения кэширования HTML
      if (req.path === '/api-docs' || req.path === '/api-docs/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      }
      next()
    },
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, swaggerUiOptions)
  )
  
  logger.info('Swagger UI настроен на /api-docs')
  logger.info('Swagger JSON доступен на /api-docs.json')
} catch (error: any) {
  logger.error('Ошибка при настройке Swagger UI', { error: error.message, stack: error.stack })
}

app.use(compressionMiddleware) // Сжатие ответов
app.use(performanceMiddleware) // Мониторинг производительности
app.use(performanceLoggingMiddleware) // Логирование производительности
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Static files
app.use('/uploads', express.static(uploadsDir))

// Health check (before auth middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Root endpoint (before auth middleware) — нужен для Railway/внешних проверок и чтобы GET / не возвращал 401
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'crm-backend', timestamp: new Date().toISOString() })
})

// Backward compatibility: некоторые клиенты шлют POST /login вместо /api/auth/login
app.post('/login', asyncHandler(AuthController.login))

// Authentication middleware
app.use(authMiddleware)

// Routes
app.use('/api', routes)

// Error handling
app.use(errorHandler)

// Initialize database and start server
async function startServer() {
  try {
    await initDB()
    logger.info('Database initialized')
    
    // Инициализация сервисов уведомлений
    const telegramConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
      enabled: process.env.TELEGRAM_ENABLED === 'true'
    }
    
    TelegramService.initialize(telegramConfig)
    
    const stockMonitoringConfig = {
      enabled: process.env.STOCK_MONITORING_ENABLED !== 'false',
      checkInterval: parseInt(process.env.STOCK_CHECK_INTERVAL || '30'),
      lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '120'),
      criticalStockThreshold: parseInt(process.env.CRITICAL_STOCK_THRESHOLD || '100'),
      autoOrderEnabled: process.env.AUTO_ORDER_ENABLED === 'true',
      autoOrderThreshold: parseInt(process.env.AUTO_ORDER_THRESHOLD || '80')
    }
    
    StockMonitoringService.initialize(stockMonitoringConfig)
    
    const autoOrderConfig = {
      enabled: process.env.AUTO_ORDER_ENABLED === 'true',
      minOrderAmount: parseFloat(process.env.MIN_ORDER_AMOUNT || '100'),
      maxOrderAmount: parseFloat(process.env.MAX_ORDER_AMOUNT || '10000'),
      orderFrequency: (process.env.ORDER_FREQUENCY as 'daily' | 'weekly' | 'monthly') || 'weekly',
      preferredDeliveryDays: process.env.PREFERRED_DELIVERY_DAYS?.split(',').map(Number) || [1, 2, 3, 4, 5],
      autoApproveOrders: process.env.AUTO_APPROVE_ORDERS === 'true',
      notificationEnabled: process.env.ORDER_NOTIFICATIONS_ENABLED !== 'false'
    }
    
    AutoOrderService.initialize(autoOrderConfig)
    
    // Инициализация сервиса пользовательских уведомлений
    await UserNotificationService.initialize()

    const earningsConfig = {
      enabled: process.env.EARNINGS_ENABLED !== 'false',
      intervalMinutes: parseInt(process.env.EARNINGS_INTERVAL_MINUTES || '60')
    }

    EarningsService.initialize(earningsConfig)
    
    const port = process.env.PORT || 3001
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`)
      logger.info(`Uploads directory: ${uploadsDir}`)
      logger.info(`Telegram notifications: ${telegramConfig.enabled ? 'enabled' : 'disabled'}`)
      logger.info(`Stock monitoring: ${process.env.STOCK_MONITORING_ENABLED !== 'false' ? 'enabled' : 'disabled'}`)
      logger.info(`Auto ordering: ${process.env.AUTO_ORDER_ENABLED === 'true' ? 'enabled' : 'disabled'}`)
      logger.info(`Earnings recalculation: ${earningsConfig.enabled ? 'enabled' : 'disabled'} (${earningsConfig.intervalMinutes}m)`)
    })
  } catch (error) {
    logger.error('Failed to start server', { error })
    process.exit(1)
  }
}

startServer()