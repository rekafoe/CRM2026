# S3-файлы заказов с сайта

Документ описывает целевую схему для тяжёлых заказов из редактора сайта: клиент загружает/обрабатывает много JPG, backend сайта собирает производственные PDF на SRA3 и хранит файлы в S3/object storage, а CRM получает только метаданные и ссылку на скачивание.

## Цель

Текущий multipart endpoint CRM подходит для небольших макетов, но не для пачек на сотни/тысячи фото и PDF на сотни МБ или ГБ:

- `POST /api/orders/:orderId/files` принимает файл через `multer.memoryStorage()`;
- тело файла буферизуется в памяти backend CRM;
- большие загрузки могут упереться в RAM, таймауты reverse proxy и лимиты хостинга;
- CRM не должна быть основным каналом передачи гигабайтных файлов.

Целевой подход:

1. Сайт создаёт заказ в CRM.
2. Backend сайта обрабатывает фото и генерирует артефакты.
3. Backend сайта загружает артефакты в своё S3/object storage.
4. Backend сайта регистрирует внешние файлы в CRM через JSON API.
5. CRM показывает файлы в заказе, выдаёт ссылку только авторизованному пользователю и логирует факт доступа.

## Текущий и целевой режимы

### Старый режим

Используется до перехода backend сайта на S3:

```http
POST /api/orders/from-website
POST /api/orders/from-website/:orderId/files
```

или:

```http
POST /api/orders/from-website/with-files
```

Ограничения старого режима:

- поле файла в multipart должно называться `file`;
- один файл по умолчанию ограничен `UPLOAD_MAX_FILE_SIZE_BYTES`;
- если env не задан, лимит равен 25 МБ;
- для очень больших файлов этот режим использовать не нужно.

### Целевой S3-режим

CRM не принимает файл телом запроса. CRM принимает запись о файле:

```http
POST /api/orders/:orderId/external-files
```

Физический файл лежит в S3, а CRM хранит:

- `storage`;
- `externalProvider`;
- `externalBucket`;
- `externalKey`;
- `externalUrl` (signed URL, если backend сайта уже сгенерировал ссылку);
- `externalStatus`;
- `artifactType`;
- `partNumber`;
- `checksum`;
- `size`;
- безопасные поля для UI.

## Безопасность

Обычный список файлов заказа:

```http
GET /api/orders/:orderId/files
```

не раскрывает:

- `externalUrl`;
- `externalKey`;
- `externalBucket`;
- `metadata`.

Вместо этого UI получает безопасные признаки:

- `hasExternalUrl`;
- `hasExternalKey`;
- `hasExternalBucket`;
- `hasExternalMetadata`.

Ссылка на скачивание выдаётся только отдельным авторизованным действием:

```http
GET /api/orders/:orderId/files/:fileId/external-link
```

Требования:

- endpoint доступен только CRM-пользователю с валидным JWT;
- `WEBSITE_ORDER_API_KEY` не используется для получения ссылки;
- сайт должен передавать временный signed URL, а не вечную публичную ссылку;
- рекомендуемый TTL signed URL: 5-15 минут;
- каждая выдача ссылки пишется в `order_file_access_logs`.

## Журнал доступа

CRM логирует:

- скачивание локального файла;
- выдачу внешней ссылки.

Таблица:

```text
order_file_access_logs
```

Основные поля:

- `orderId`;
- `fileId`;
- `userId`;
- `action`: `download` или `external_link`;
- `storage`;
- `ip`;
- `userAgent`;
- `createdAt`.

Админский endpoint:

```http
GET /api/orders/:orderId/files/:fileId/access-logs
```

UI: в модалке файлов заказа у администратора есть кнопка журнала скачиваний.

## Статусы внешнего файла

| Статус | Когда ставить | Поведение CRM |
|--------|---------------|---------------|
| `processing` | Файл или часть ещё генерируется/загружается в S3 | Показывает «Готовится», скачивание недоступно |
| `ready` | Файл полностью загружен, ссылка/размер/checksum готовы | Показывает «Готов», скачивание доступно |
| `failed` | Генерация или загрузка упала | Показывает ошибку подготовки, скачивание недоступно |

## Типы артефактов

Рекомендуемые значения `artifactType`:

| Тип | Назначение |
|-----|------------|
| `original_jpg` | Исходное фото клиента, если его нужно видеть в CRM |
| `processed_jpg` | Обработанный JPG после редактора/кропа |
| `sra3_pdf` | Производственный PDF с раскладкой на SRA3 |
| `manifest` | JSON-манифест пачки/экспорта |
| `preview` | Лёгкое превью результата |

## S3 key convention

Рекомендуемая структура ключей:

```text
orders/{crmOrderId}/originals/{uuid-or-index}.jpg
orders/{crmOrderId}/processed/{uuid-or-index}.jpg
orders/{crmOrderId}/production/sra3-part-{partNumber}.pdf
orders/{crmOrderId}/manifest.json
orders/{crmOrderId}/previews/{name}.jpg
```

Пример:

```text
orders/4745/production/sra3-part-001.pdf
orders/4745/production/sra3-part-002.pdf
orders/4745/manifest.json
```

Для больших производственных PDF не собирать один файл на десятки гигабайт. Рекомендуется делить экспорт на части:

- по размеру: примерно 500-1000 МБ на часть;
- или по фиксированному числу SRA3-листов;
- `partNumber` должен соответствовать номеру части.

## Регистрация файла в CRM

Endpoint:

```http
POST /api/orders/:orderId/external-files
X-API-Key: <WEBSITE_ORDER_API_KEY>
Content-Type: application/json
```

Можно отправить один файл:

```json
{
  "storage": "s3",
  "provider": "s3",
  "bucket": "site-orders",
  "key": "orders/4745/production/sra3-part-001.pdf",
  "url": "https://signed-url.example/...",
  "filename": "4745-sra3-part-001.pdf",
  "mime": "application/pdf",
  "size": 734003200,
  "status": "ready",
  "artifactType": "sra3_pdf",
  "partNumber": 1,
  "checksum": "sha256:..."
}
```

Или несколько файлов:

```json
{
  "files": [
    {
      "storage": "s3",
      "provider": "s3",
      "bucket": "site-orders",
      "key": "orders/4745/production/sra3-part-001.pdf",
      "filename": "4745-sra3-part-001.pdf",
      "mime": "application/pdf",
      "size": 734003200,
      "status": "ready",
      "artifactType": "sra3_pdf",
      "partNumber": 1,
      "checksum": "sha256:..."
    },
    {
      "storage": "s3",
      "provider": "s3",
      "bucket": "site-orders",
      "key": "orders/4745/production/sra3-part-002.pdf",
      "filename": "4745-sra3-part-002.pdf",
      "mime": "application/pdf",
      "size": 682622976,
      "status": "ready",
      "artifactType": "sra3_pdf",
      "partNumber": 2,
      "checksum": "sha256:..."
    }
  ]
}
```

Ответ:

```json
{
  "files": [
    {
      "id": 123,
      "orderId": 4745,
      "filename": "4745-sra3-part-001.pdf",
      "storage": "s3",
      "externalStatus": "ready",
      "artifactType": "sra3_pdf",
      "partNumber": 1,
      "hasExternalUrl": true,
      "hasExternalKey": true,
      "hasExternalBucket": true
    }
  ]
}
```

Важно: ответ для UI не должен раскрывать `url`, `key`, `bucket`.

## Processing -> Ready

Если файл готовится долго, backend сайта может сначала зарегистрировать `processing`:

```json
{
  "storage": "s3",
  "provider": "s3",
  "bucket": "site-orders",
  "key": "orders/4745/production/sra3-part-001.pdf",
  "filename": "4745-sra3-part-001.pdf",
  "status": "processing",
  "artifactType": "sra3_pdf",
  "partNumber": 1
}
```

После генерации и загрузки в S3:

```http
PATCH /api/orders/:orderId/external-files/:fileId
X-API-Key: <WEBSITE_ORDER_API_KEY>
Content-Type: application/json
```

```json
{
  "url": "https://signed-url.example/...",
  "size": 734003200,
  "status": "ready",
  "checksum": "sha256:..."
}
```

Если генерация упала:

```json
{
  "status": "failed",
  "metadata": {
    "error": "PDF render failed"
  }
}
```

## Идемпотентность и ретраи

Регистрация идемпотентна:

- если передан `key`, повторный `POST` с тем же `key` обновит существующую запись;
- если `key` не передан, используется `url`;
- если backend сайта не получил ответ CRM из-за сети, webhook можно безопасно повторить.

Рекомендуемый retry policy:

- 1-я попытка сразу;
- 2-я через 5 секунд;
- 3-я через 30 секунд;
- 4-я через 2 минуты;
- далее ручная проверка/очередь ошибок.

## Curl-примеры

Создать заказ:

```bash
curl -X POST "https://crm.example.com/api/orders/from-website" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WEBSITE_ORDER_API_KEY" \
  -d '{
    "customerName": "Иван Петров",
    "customerPhone": "+375 29 123-45-67",
    "items": [
      {
        "type": "Стандарт - Печать фото стандартных размеров",
        "params": {
          "description": "10х15, 690 шт, SRA3 export"
        },
        "price": 0.22,
        "quantity": 690,
        "priceType": "standard"
      }
    ]
  }'
```

Зарегистрировать готовый PDF:

```bash
curl -X POST "https://crm.example.com/api/orders/4745/external-files" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WEBSITE_ORDER_API_KEY" \
  -d '{
    "storage": "s3",
    "provider": "s3",
    "bucket": "site-orders",
    "key": "orders/4745/production/sra3-part-001.pdf",
    "url": "https://signed-url.example/...",
    "filename": "4745-sra3-part-001.pdf",
    "mime": "application/pdf",
    "size": 734003200,
    "status": "ready",
    "artifactType": "sra3_pdf",
    "partNumber": 1,
    "checksum": "sha256:..."
  }'
```

Получить ссылку на скачивание из CRM UI/API:

```bash
curl -X GET "https://crm.example.com/api/orders/4745/files/123/external-link" \
  -H "Authorization: Bearer $CRM_TOKEN"
```

## Что CRM уже поддерживает

- Миграции для метаданных внешних файлов.
- `POST /api/orders/:orderId/external-files`.
- `PATCH /api/orders/:orderId/external-files/:fileId`.
- Безопасный список файлов без раскрытия `url/key/bucket`.
- Выдача ссылки только по `external-link`.
- Audit log скачиваний и выдачи ссылок.
- UI статусов внешних файлов.
- Admin UI журнала скачиваний.

## Что не входит в текущий этап

- CRM сама не генерирует signed URL по S3 credentials.
- CRM не скачивает большие файлы к себе на volume.
- CRM не сканирует S3-префиксы.
- Префлайт внешних файлов недоступен, пока файл физически не лежит на диске CRM.

Если позже понадобится, можно добавить отдельный S3-сервис в CRM:

- env с S3 endpoint/access key/secret;
- генерация signed URL по `bucket/key`;
- фоновая синхронизация/скачивание файлов;
- preflight через временное скачивание части/файла.
