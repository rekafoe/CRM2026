# Настройка Swagger для CRM Backend

## Установка

Установите необходимые пакеты:

```bash
cd backend
npm install swagger-ui-express swagger-jsdoc @types/swagger-ui-express @types/swagger-jsdoc
```

## Использование

После установки пакетов и запуска сервера:

1. **Swagger UI** будет доступен по адресу: `http://localhost:3001/api-docs`
2. **Swagger JSON** будет доступен по адресу: `http://localhost:3001/api-docs.json`

## Добавление документации к новым роутам

Добавьте JSDoc комментарии с аннотациями Swagger перед вашими роутами:

```typescript
/**
 * @swagger
 * /api/pricing/test:
 *   get:
 *     summary: Тестовый роут
 *     description: Описание роута
 *     tags: [Pricing]
 *     security: []  # Если роут не требует авторизации
 *     responses:
 *       200:
 *         description: Успешный ответ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get('/test', handler)
```

## Структура документации

- **Конфигурация Swagger**: `src/config/swagger.ts`
- **Интеграция**: `src/index_old.ts`
- **Примеры аннотаций**: 
  - `src/routes/auth.ts`
  - `src/routes/pricing.ts`
  - `src/routes/orders.ts`

## Теги для группировки

Используйте теги для группировки роутов в Swagger UI:
- `[Auth]` - Авторизация
- `[Pricing]` - Ценообразование
- `[Orders]` - Заказы
- `[Products]` - Продукты
- `[Materials]` - Материалы
- и т.д.

## Авторизация в Swagger UI

1. Используйте роут `/api/auth/login` для получения JWT токена
2. Нажмите кнопку "Authorize" в Swagger UI
3. Введите токен в формате: `Bearer YOUR_TOKEN_HERE`
4. Теперь все запросы будут автоматически включать заголовок авторизации
