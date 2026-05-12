import swaggerJsdoc from 'swagger-jsdoc'
import path from 'path'
import { config } from './app'
import { logger } from '../utils/logger'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CRM Backend API',
      version: '1.0.0',
      description: 'API документация для CRM системы управления заказами, продуктами и ценообразованием',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
      (() => {
        const raw =
          process.env.PUBLIC_API_URL ||
          process.env.RAILWAY_STATIC_URL ||
          'https://crm2026-production.up.railway.app'
        const url = raw.replace(/\/api-docs\/?$/, '') || raw
        return { url, description: 'Production server (Railway)' }
      })(),
      {
        url: 'https://api.printcore.by',
        description: 'printcore.by (если настроен)',
      },
    ],
    tags: [
      { name: 'Products', description: 'Продукты и каталог' },
      { name: 'Website Catalog', description: 'API для каталога на сайте (printcore.by)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT токен авторизации. Получите токен через /api/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Сообщение об ошибке',
            },
            stack: {
              type: 'string',
              description: 'Стек ошибки (только в development)',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Сообщение об успехе',
            },
          },
        },
        ExternalOrderFileInput: {
          type: 'object',
          description: 'Метаданные внешнего файла заказа (S3/object storage). Нужен key или url.',
          properties: {
            orderItemId: { type: 'integer', nullable: true, description: 'ID позиции заказа, если файл относится к конкретной позиции' },
            storage: { type: 'string', example: 's3' },
            provider: { type: 'string', example: 's3' },
            bucket: { type: 'string', example: 'site-orders' },
            key: { type: 'string', example: 'orders/4745/production/sra3-part-001.pdf' },
            url: { type: 'string', format: 'uri', description: 'Временный signed URL, рекомендуемый TTL 5-15 минут' },
            filename: { type: 'string', example: '4745-sra3-part-001.pdf' },
            originalName: { type: 'string', nullable: true },
            mime: { type: 'string', example: 'application/pdf' },
            size: { type: 'integer', example: 734003200 },
            status: { type: 'string', enum: ['processing', 'ready', 'failed'], example: 'ready' },
            artifactType: {
              type: 'string',
              enum: ['original_jpg', 'processed_jpg', 'sra3_pdf', 'manifest', 'preview'],
              example: 'sra3_pdf',
            },
            checksum: { type: 'string', example: 'sha256:...' },
            partNumber: { type: 'integer', nullable: true, example: 1 },
            metadata: { type: 'object', nullable: true, additionalProperties: true },
          },
        },
        ExternalOrderFile: {
          type: 'object',
          description: 'Файл заказа, безопасный для CRM UI. url/key/bucket не раскрываются в списке.',
          properties: {
            id: { type: 'integer' },
            orderId: { type: 'integer' },
            orderItemId: { type: 'integer', nullable: true },
            filename: { type: 'string' },
            originalName: { type: 'string', nullable: true },
            mime: { type: 'string', nullable: true },
            size: { type: 'integer', nullable: true },
            uploadedAt: { type: 'string' },
            approved: { type: 'integer' },
            approvedAt: { type: 'string', nullable: true },
            approvedBy: { type: 'integer', nullable: true },
            storage: { type: 'string', example: 's3' },
            externalProvider: { type: 'string', nullable: true, example: 's3' },
            externalStatus: { type: 'string', enum: ['processing', 'ready', 'failed'], example: 'ready' },
            artifactType: { type: 'string', nullable: true, example: 'sra3_pdf' },
            checksum: { type: 'string', nullable: true },
            partNumber: { type: 'integer', nullable: true },
            hasExternalUrl: { type: 'boolean' },
            hasExternalKey: { type: 'boolean' },
            hasExternalBucket: { type: 'boolean' },
            hasExternalMetadata: { type: 'boolean' },
          },
        },
        OrderFileAccessLog: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            orderId: { type: 'integer' },
            fileId: { type: 'integer' },
            userId: { type: 'integer', nullable: true },
            userName: { type: 'string', nullable: true },
            userEmail: { type: 'string', nullable: true },
            action: { type: 'string', enum: ['download', 'external_link'] },
            storage: { type: 'string', nullable: true },
            ip: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
            createdAt: { type: 'string' },
          },
        },
        ProductTypeSubtype: {
          type: 'object',
          description: 'Подтип продукта (например: Визитки стандартные цветные, Визитки ламинированные)',
          properties: {
            id: { type: 'integer', description: 'Уникальный числовой ID подтипа' },
            name: { type: 'string', description: 'Название подтипа' },
            default: { type: 'boolean', description: 'Подтип по умолчанию' },
            briefDescription: { type: 'string', description: 'Краткое описание для карточки на сайте' },
            fullDescription: { type: 'string', description: 'Полное описание для страницы продукта' },
            image_url: { type: 'string', description: 'URL изображения подтипа для сайта' },
            characteristics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Характеристики (размер, печать, бумага и т.д.)',
            },
            advantages: {
              type: 'array',
              items: { type: 'string' },
              description: 'Преимущества',
            },
          },
        },
        SubtypeInitialDefaults: {
          type: 'object',
          description: 'Начальные значения калькулятора для подтипа (переопределение авто-значений)',
          properties: {
            size_id: { type: 'number', description: 'ID размера по умолчанию' },
            quantity: { type: 'integer', description: 'Тираж по умолчанию' },
            material_id: { type: 'integer', description: 'ID материала по умолчанию' },
            sides_mode: { type: 'string', enum: ['single', 'duplex', 'duplex_bw_back'], description: 'Сторонность по умолчанию' },
          },
        },
        ProductCategory: {
          type: 'object',
          description: 'Категория продуктов',
          properties: {
            id: { type: 'integer', description: 'ID категории' },
            name: { type: 'string', description: 'Название' },
            icon: { type: 'string', description: 'Эмодзи / короткий символ' },
            image_url: { type: 'string', description: 'URL изображения категории для сайта' },
            description: { type: 'string', description: 'Описание' },
            sort_order: { type: 'integer', description: 'Порядок сортировки' },
            is_active: { type: 'integer', description: '1 = активна' },
            min_price: { type: 'number', nullable: true, description: 'Мин. цена за ед. (при withMinPrice=1)' },
          },
        },
        Product: {
          type: 'object',
          description: 'Продукт',
          properties: {
            id: { type: 'integer', description: 'ID продукта' },
            category_id: { type: 'integer', description: 'ID категории' },
            name: { type: 'string', description: 'Название' },
            description: { type: 'string', description: 'Описание' },
            icon: { type: 'string', description: 'Эмодзи / короткий символ' },
            image_url: { type: 'string', description: 'URL изображения продукта для сайта' },
            is_active: { type: 'integer', description: '1 = активен' },
            calculator_type: { type: 'string', description: 'Тип калькулятора (product/operation/simplified)' },
            product_type: { type: 'string', description: 'Тип продукта (sheet_single/multi_page/universal)' },
            min_price: { type: 'number', nullable: true, description: 'Мин. цена за ед. (при withMinPrice=1)' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    // Разработка: исходники .ts (ts-node)
    path.join(process.cwd(), 'src/routes/*.ts'),
    path.join(process.cwd(), 'src/modules/**/routes/*.ts'),
    path.join(process.cwd(), 'src/controllers/*.ts'),
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../modules/**/routes/*.ts'),
    path.join(__dirname, '../controllers/*.ts'),
    // Прод (Railway и др.): скомпилированные .js. __dirname при загрузке из dist/.../config/swagger.js даёт путь к папке с роутами
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../modules/**/routes/*.js'),
    // Вариант когда cwd=backend и сборка в dist/ или в dist/backend/src/
    path.join(process.cwd(), 'dist/routes/*.js'),
    path.join(process.cwd(), 'dist/modules/**/routes/*.js'),
    path.join(process.cwd(), 'dist/backend/src/routes/*.js'),
    path.join(process.cwd(), 'dist/backend/src/modules/**/routes/*.js'),
  ],
}

let swaggerSpec: any

try {
  // Логируем пути для отладки
  logger.info('Загрузка Swagger документации', {
    cwd: process.cwd(),
    __dirname,
    apiPaths: options.apis,
  })
  
  swaggerSpec = swaggerJsdoc(options)
  
  // Логируем результат
  const pathsCount = Object.keys(swaggerSpec.paths || {}).length
  logger.info('Swagger документация успешно загружена', {
    pathsCount,
    hasPaths: !!swaggerSpec.paths,
    hasComponents: !!swaggerSpec.components,
    samplePaths: Object.keys(swaggerSpec.paths || {}).slice(0, 5),
  })
} catch (error: any) {
  logger.error('Ошибка при загрузке Swagger документации', { 
    error: error.message, 
    stack: error.stack,
    cwd: process.cwd(),
    __dirname,
  })
  // Создаем минимальную спецификацию в случае ошибки
  swaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'CRM Backend API',
      version: '1.0.0',
      description: 'Ошибка загрузки документации. Проверьте логи сервера.',
    },
    paths: {},
  }
}

export { swaggerSpec }
