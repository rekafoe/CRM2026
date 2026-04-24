import express from 'express'
import path from 'path'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { initDB } from './config/database'
import { config, corsDynamicOrigin, getCorsAllowedOrigins } from './config/app'
import { uploadsDir } from './config/upload'
import { authMiddleware, errorHandler, asyncHandler } from './middleware'
import { uploadsApiKeyMiddleware } from './middleware/uploadsApiKey'
import { blockSensitiveStaticPath } from './middleware/blockSensitiveStaticPath'
import { performanceMiddleware, performanceLoggingMiddleware } from './middleware/performance'
import { compressionMiddleware } from './middleware/compression'
import { authRateLimit, generalRateLimit } from './middleware/rateLimiter'
import routes from './routes'
import { TelegramService } from './services/telegramService'
import { StockMonitoringService } from './services/stockMonitoringService'
import { AutoOrderService } from './services/autoOrderService'
import { UserNotificationService } from './services/userNotificationService'
import { EarningsService } from './services/earningsService'
import { startOrderFilesCleanup } from './services/orderFilesCleanupService'
import { startStorageMonitor } from './services/storageMonitorService'
import { logger } from './utils/logger'
import { startMailOutboxWorker } from './services/mailOutboxWorker'
import { startSmsDebounceWorker } from './services/smsDebounceWorker'
import { startCampaignWorker } from './modules/campaigns/services/campaignWorker'
import { AuthController } from './controllers'
import { swaggerSpec } from './config/swagger'
import { registerMiniappPublicPage } from './routes/miniappPublicPage'

// Проверяем, что swaggerSpec загружен
if (!swaggerSpec) {
  logger.warn('Swagger spec не загружен, документация может быть недоступна')
}

// Load environment variables
dotenv.config()

const app = express()
const miniappAssetsDir = path.resolve(__dirname, '..', 'public', 'miniapp')

function assertProductionSecurityEnv(): void {
  if (config.nodeEnv !== 'production') return

  const websiteApiKey = String(process.env.WEBSITE_ORDER_API_KEY || '').trim()
  if (!websiteApiKey) {
    throw new Error('WEBSITE_ORDER_API_KEY must be set in production')
  }

  if (config.jwtSecret === 'change-me-in-production') {
    logger.warn('JWT_SECRET uses default value in production. Set a strong secret.')
  }
}

// За прокси (Railway и др.) req.protocol должен быть https
app.set('trust proxy', 1)

// Базовые заголовки: не отдаём HTML-политикой ломаем API/Swagger (JSON).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS ДО generalRateLimit: иначе при 429 ответ уходит без Access-Control-Allow-Origin → в консоли «blocked by CORS», хотя причина — лимит запросов.
const corsAllowed = getCorsAllowedOrigins()
logger.info('CORS allowed origins', { origins: corsAllowed })
app.use(
  cors({
    origin: corsDynamicOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Accept'],
    optionsSuccessStatus: 204,
  })
)

app.use(generalRateLimit)

// Swagger JSON endpoint (ДО compressionMiddleware)
// Отдаём спецификацию с server URL из запроса, чтобы «Try it out» шёл к API, а не к /api-docs/
app.get('/api-docs.json', (req, res) => {
  try {
    // Только один server с корнем API (без /api-docs), чтобы «Try it out» шёл к API
    const baseUrl = `${req.protocol}://${req.get('host') || ''}`.replace(/\/api-docs\/?$/, '').replace(/\/$/, '')
    const spec = {
      ...swaggerSpec,
      servers: [{ url: baseUrl, description: 'API (this server)' }],
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.json(spec)
  } catch (error: any) {
    logger.error('Ошибка при отправке Swagger JSON', { error: error.message })
    res.status(500).json({ error: 'Ошибка загрузки Swagger документации' })
  }
})

// Swagger UI (ДО compressionMiddleware, чтобы избежать проблем с заголовками)
// Не передаём swaggerSpec в setup(), чтобы UI загружал спецификацию с /api-docs.json,
// где подставляется server URL из запроса — иначе «Try it out» идёт на /api-docs/... и возвращает HTML
try {
  // swaggerUrl — откуда UI загружает spec (в библиотеке используется именно он, не swaggerOptions.url)
  const swaggerUiOptions = {
    swaggerUrl: '/api-docs.json',
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CRM API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
    },
  }
  
  app.use(
    '/api-docs',
    (req, res, next) => {
      if (req.path === '/api-docs' || req.path === '/api-docs/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      }
      next()
    },
    swaggerUi.serve,
    swaggerUi.setup(null as any, swaggerUiOptions)
  )
  
  logger.info('Swagger UI настроен на /api-docs')
  logger.info('Swagger JSON доступен на /api-docs.json')
} catch (error: any) {
  logger.error('Ошибка при настройке Swagger UI', { error: error.message, stack: error.stack })
}

// Статика картинок ДО compression — иначе у части клиентов/HTTP2 прокси возможны ERR_HTTP2_PROTOCOL_ERROR на PNG.
// Файлы заказов (orders/) НЕ отдаются — только через GET /api/orders/:id/files/:fileId/download
const blockOrdersPath = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  const p = (_req.path || '').replace(/^\/+/, '')
  if (p.startsWith('orders/') || p.startsWith('orders\\')) {
    res.status(404).json({ error: 'Not Found' })
    return
  }
  next()
}
app.use(
  '/uploads',
  blockOrdersPath,
  blockSensitiveStaticPath,
  asyncHandler(uploadsApiKeyMiddleware),
  express.static(uploadsDir)
)
app.get('/api/uploads', (req, res) => {
  res.status(400).json({
    error: 'Filename required',
    message: 'Use /api/uploads/{filename} — e.g. /api/uploads/photo-123.jpg',
  })
})
app.get('/api/uploads/', (req, res) => {
  res.status(400).json({
    error: 'Filename required',
    message: 'Use /api/uploads/{filename} — e.g. /api/uploads/photo-123.jpg',
  })
})
app.use(
  '/api/uploads',
  blockOrdersPath,
  blockSensitiveStaticPath,
  asyncHandler(uploadsApiKeyMiddleware),
  express.static(uploadsDir)
)
app.use(
  '/miniapp-assets',
  express.static(miniappAssetsDir, {
    fallthrough: true,
    maxAge: '1h',
  })
)

app.use(compressionMiddleware) // Сжатие ответов (не затрагивает маршруты выше)
app.use(performanceMiddleware) // Мониторинг производительности
app.use(performanceLoggingMiddleware) // Логирование производительности
const bodyLimit = process.env.REQUEST_BODY_LIMIT || '2mb'
app.use(express.json({ limit: bodyLimit }))
app.use(express.urlencoded({ extended: true, limit: bodyLimit }))

// Health check (before auth middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Root endpoint (before auth middleware) — нужен для Railway/внешних проверок и чтобы GET / не возвращал 401
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'crm-backend', timestamp: new Date().toISOString() })
})

// Telegram Mini App: публичная HTML-страница (до authMiddleware)
registerMiniappPublicPage(app)

// Backward compatibility: некоторые клиенты шлют POST /login вместо /api/auth/login
app.post('/login', authRateLimit, asyncHandler(AuthController.login))
app.post('/api/auth/login', authRateLimit)

// Authentication middleware
app.use(authMiddleware)

// Routes
app.use('/api', routes)

// Error handling
app.use(errorHandler)

// Initialize database and start server
async function startServer() {
  try {
    assertProductionSecurityEnv()
    await initDB()
    logger.info('Database initialized')
    
    // Инициализация сервисов уведомлений
    const telegramConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
      enabled: process.env.TELEGRAM_ENABLED === 'true',
      useWebhook: process.env.TELEGRAM_USE_WEBHOOK === 'true',
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

    const orderFilesCleanupConfig = {
      enabled: process.env.ORDER_FILES_CLEANUP_ENABLED !== 'false',
      intervalMs: parseInt(process.env.ORDER_FILES_CLEANUP_INTERVAL_HOURS || '24', 10) * 60 * 60 * 1000,
    }
    startOrderFilesCleanup(orderFilesCleanupConfig)

    const storageMonitorConfig = {
      enabled: process.env.STORAGE_MONITOR_ENABLED !== 'false',
      intervalMs: parseInt(process.env.STORAGE_MONITOR_INTERVAL_MINUTES || '60', 10) * 60 * 1000,
    }
    startStorageMonitor(storageMonitorConfig)
    
    const port = process.env.PORT || 3001
    const documentTemplatesDir = process.env.DOCUMENT_TEMPLATES_DIR
    if (documentTemplatesDir) {
      logger.info(`Document templates: using persistent dir (DOCUMENT_TEMPLATES_DIR) = ${require('path').resolve(documentTemplatesDir)}`)
    } else {
      logger.warn('Document templates: DOCUMENT_TEMPLATES_DIR not set — uploaded templates will be lost on redeploy. Set DOCUMENT_TEMPLATES_DIR to a volume path (e.g. /data/document-templates) on Railway.')
    }
    if (!process.env.UPLOADS_DIR) {
      logger.warn('UPLOADS_DIR not set — images (products, categories, subtypes) will be lost on redeploy. Create a Railway Volume, mount it (e.g. /data/uploads), set UPLOADS_DIR=/data/uploads.')
    }
    app.listen(port, () => {
      startMailOutboxWorker()
      startSmsDebounceWorker()
      startCampaignWorker()
      logger.info(`Server running on port ${port}`)
      logger.info(`Uploads directory: ${uploadsDir}`)
      const tgMode = !telegramConfig.enabled
        ? 'disabled'
        : telegramConfig.useWebhook
          ? 'enabled (webhook, no local polling)'
          : 'enabled (long polling)'
      logger.info(`Telegram: ${tgMode}`)
      logger.info(`Stock monitoring: ${process.env.STOCK_MONITORING_ENABLED !== 'false' ? 'enabled' : 'disabled'}`)
      logger.info(`Auto ordering: ${process.env.AUTO_ORDER_ENABLED === 'true' ? 'enabled' : 'disabled'}`)
      logger.info(`Earnings recalculation: ${earningsConfig.enabled ? 'enabled' : 'disabled'} (${earningsConfig.intervalMinutes}m)`)
      logger.info(`Order files cleanup: ${orderFilesCleanupConfig.enabled ? 'enabled (1.5 weeks retention)' : 'disabled'}`)
      logger.info(`Storage monitor: ${storageMonitorConfig.enabled ? 'enabled (80% threshold)' : 'disabled'}`)
    })
  } catch (error) {
    logger.error('Failed to start server', { error })
    process.exit(1)
  }
}

startServer()
