# Решение проблем со Swagger

## Проверка установки

Убедитесь, что пакеты установлены:
```bash
cd backend
npm list swagger-ui-express swagger-jsdoc
```

Если пакеты не установлены:
```bash
npm install swagger-ui-express swagger-jsdoc @types/swagger-ui-express @types/swagger-jsdoc
```

## Проверка доступности

1. **Проверьте JSON endpoint:**
   ```
   http://localhost:3001/api-docs.json
   ```
   Должен вернуть JSON со спецификацией API.

2. **Проверьте UI endpoint:**
   ```
   http://localhost:3001/api-docs
   ```
   Должен открыть Swagger UI интерфейс.

## Диагностика

### Проверка логов

При запуске сервера должны появиться логи:
- `Swagger документация успешно загружена` - документация загружена
- `Swagger UI настроен на /api-docs` - UI настроен

Если есть ошибки, они будут в логах с префиксом `Ошибка при загрузке Swagger документации`.

### Проверка путей

Swagger ищет JSDoc комментарии в файлах:
- `src/routes/*.ts`
- `src/modules/**/routes/*.ts`
- `src/controllers/*.ts`

Убедитесь, что в этих файлах есть аннотации `@swagger`.

### Пример аннотации

```typescript
/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Тестовый роут
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: Успех
 */
router.get('/test', handler)
```

## Частые проблемы

### 1. Swagger UI показывает "Failed to load API definition"

**Решение:** Проверьте `/api-docs.json` - если он возвращает ошибку, проблема в генерации спецификации. Проверьте логи сервера.

### 2. Документация пустая (нет роутов)

**Решение:** 
- Убедитесь, что в файлах роутов есть JSDoc комментарии с `@swagger`
- Проверьте, что пути в `swagger.ts` правильные
- Проверьте логи - там будет информация о количестве найденных путей

### 3. Ошибка "Cannot find module 'swagger-jsdoc'"

**Решение:** Установите пакеты:
```bash
npm install
```

### 4. Swagger UI не открывается (404)

**Решение:** 
- Убедитесь, что сервер запущен
- Проверьте, что роут `/api-docs` зарегистрирован ДО middleware авторизации
- Проверьте логи сервера на наличие ошибок

## Тестирование

1. Запустите сервер:
   ```bash
   npm run dev
   ```

2. Откройте в браузере:
   - `http://localhost:3001/api-docs.json` - должен вернуть JSON
   - `http://localhost:3001/api-docs` - должен открыть UI

3. Проверьте логи сервера на наличие ошибок
