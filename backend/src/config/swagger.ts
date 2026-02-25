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
            size_id: { type: 'string', description: 'ID размера по умолчанию' },
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
