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
      {
        url: 'https://api.your-domain.com',
        description: 'Production server',
      },
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
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    // Пути относительно корня backend (где запускается сервер)
    path.join(process.cwd(), 'src/routes/*.ts'),
    path.join(process.cwd(), 'src/modules/**/routes/*.ts'),
    path.join(process.cwd(), 'src/controllers/*.ts'),
    // Альтернативные пути через __dirname (для скомпилированного кода)
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../modules/**/routes/*.ts'),
    path.join(__dirname, '../controllers/*.ts'),
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
