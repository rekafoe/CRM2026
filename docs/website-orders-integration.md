# Интеграция заказов с сайта (по примеру karandash.by)

Ответы на вопросы по API пула заказов и созданию заказов с сайта.

---

## 1. Как API Order Pool позволяют отправлять заказы с сайта в него?

Заказы с сайта **не «отправляются» отдельно в пул** — они попадают в пул автоматически.

**Схема:**

1. **Создание заказа с сайта**  
   Заказ создаётся через API (см. п. 3) и сохраняется в таблицу `orders` с полем `source = 'website'` и без менеджера (`userId = null`).

2. **Пул заказов**  
   Эндпоинт **`GET /api/order-management/pool`** отдаёт три списка:
   - **unassigned** — заказы без назначения (в т.ч. с сайта со статусом «ожидает»);
   - **assigned** — заказы, уже назначенные на страницу менеджера;
   - **completed** — завершённые.

   В пул попадают заказы из:
   - **Telegram:** таблица `photo_orders` (status = pending / ready_for_approval);
   - **Сайт:** таблица `orders` с **`source = 'website'`** и **`status = 1`** (первый статус, обычно «Ожидает» / «Новый»).

3. **Назначение заказа менеджеру**  
   Менеджер в CRM выбирает заказ из пула и назначает его себе:
   - **`POST /api/order-management/assign`**  
     Body: `{ orderId, orderType: 'website', userId, userName, date }`.  
   В результате создаётся запись в `user_order_page_orders`, заказ переходит в «assigned» и при необходимости обновляется статус (например, на «в работе»).

**Итог:** заказы с сайта оказываются в пуле, если они созданы с `source: 'website'` и имеют статус 1; дальше они отображаются в «Пул заказов» и назначаются через `POST /api/order-management/assign`.

---

## 2. Как лучше хранить заказы с сайта, которые ещё не назначены?

**Рекомендуемый вариант (как сейчас):** одна таблица **`orders`** для всех заказов.

- Заказы с сайта — те же строки в `orders`, с отличиями:
  - **`source = 'website'`**
  - **`userId = NULL`** (никому не назначен)
  - **`status`** = первый статус (обычно id = 1, «Ожидает» / «Новый»)

Назначение «кто взял заказ» хранится отдельно в **`user_order_page_orders`** (связь заказа со страницей заказов менеджера). До назначения запись в этой таблице отсутствует — такие заказы и считаются «не назначенными» и попадают в **unassigned** в пуле.

**Плюсы такого хранения:**

- Один источник правды для заказов (сайт, CRM, Telegram — все в `orders`).
- Фильтры по `source`, `userId`, `status` и отчёты работают единообразно.
- Пул заказов просто выбирает из `orders` заказы с `source = 'website'` и `status = 1` и проверяет отсутствие записи в `user_order_page_orders`.

Отдельная таблица только «для заказов с сайта» не нужна — усложнит отчёты и дублирование логики.

---

## 3. Какой API отвечает за создание заказа через сайт?

**Основной вариант (с авторизацией):**

- **`POST /api/orders`**  
  - Требуется **аутентификация** (Bearer / сессия).  
  - Body может содержать: `customerName`, `customerPhone`, `customerEmail`, `prepaymentAmount`, `date`, `customer_id`.  
  - Сейчас контроллер **не передаёт в сервис поле `source`** — заказ создаётся как `source = 'crm'`. Чтобы заказы с сайта шли в пул и помечались как сайтовые, нужно либо:
  - добавить в body параметр **`source: 'website'`** и пробросить его в `OrderService.createOrder(..., source)`; либо  
  - завести отдельный эндпоинт для сайта (см. ниже).

**Публичный эндпоинт для сайта (реализован):**

- **`POST /api/orders/from-website`** — создание заказа с сайта без авторизации в CRM.
- **Авторизация:** заголовок **`X-API-Key`** или **`Authorization: Bearer <key>`**. Ключ задаётся в env: **`WEBSITE_ORDER_API_KEY`**. Если переменная не задана — эндпоинт возвращает 503.
- **Body (JSON):**
  - `customerName`, `customerPhone`, `customerEmail` (опционально), `prepaymentAmount` (опционально), `customer_id` (опционально).
  - Обязательно: **`customerName`** или **`customerPhone`**.
  - Опционально: **`items`** — массив позиций заказа (как в `POST /api/orders/with-auto-deduction`). Если передан непустой массив — заказ создаётся с позициями и автоматическим списанием материалов; иначе создаётся пустой заказ.
  - Для каждой позиции в **`items`** можно указать **`priceType`** (только для заказов с сайта): тип цены применяется к полю **`price`** (базовая цена продукта) перед сохранением:
    - **`urgent`** (срочно): +50% — итоговая цена = price × 1.5
    - **`online`** (онлайн): −15% — итоговая цена = price × 0.85
    - **`promo`** (промо): −30% — итоговая цена = price × 0.7
    - **`special`** (спец.предложение): −45% — итоговая цена = price × 0.55  
    Значение сохраняется в `params.priceType` для отображения в CRM.
- Заказ создаётся с **`source = 'website'`**, **`userId = null`** и попадает в пул заказов (unassigned).
- **Номер заказа:** в ответе API возвращается **`order.number`** в формате **`ORD-XXXX`** (порядковый номер по id, например ORD-0897). Сайт **обязан показывать пользователю именно этот номер** из ответа, а не генерировать свой (например `ORD-` + Date.now()) — иначе в CRM заказ будет под другим номером и возникнет путаница.

**Откуда брать номер заказа на клиентской стороне (сайт):**

После успешного создания заказа API возвращает **201** и тело вида:
- `POST /api/orders/from-website` → `{ order, message?, deductionResult? }`
- `POST /api/orders/from-website/with-files` → `{ order, files, message?, deductionResult? }`

В объекте **`order`** есть поле **`number`** — это и есть номер заказа в CRM (например `ORD-0897`). Его нужно показывать пользователю на странице «Заказ оформлен» / в письме / в чеке.

Пример (псевдокод):
```text
const res = await fetch('/api/orders/from-website', { method: 'POST', ... });
const data = await res.json();
if (res.ok && data.order) {
  const orderNumber = data.order.number;  // "ORD-0897"
  // Показать: "Ваш номер заказа: " + orderNumber
}
```

Не использовать свой формат (например `"ORD-" + Date.now()`): в CRM заказ будет под номером из `order.number`, и клиент должен видеть тот же номер.

### Пример запроса на backend

**Создание заказа с позициями (POST /api/orders/from-website):**

```bash
curl -X POST "https://your-backend.example.com/api/orders/from-website" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_WEBSITE_ORDER_API_KEY" \
  -d '{
    "customerName": "Иван Петров",
    "customerPhone": "+375 29 123-45-67",
    "customerEmail": "ivan@example.com",
    "prepaymentAmount": 10.50,
    "items": [
      {
        "type": "Визитки",
        "params": {
          "description": "Визитки 90x50, меловка 300 г/м², 100 шт"
        },
        "price": 25.00,
        "quantity": 1,
        "priceType": "online"
      },
      {
        "type": "Листовки",
        "params": {
          "description": "Листовки A5, 500 шт"
        },
        "price": 45.00,
        "quantity": 1,
        "priceType": "standard"
      }
    ]
  }'
```

**Минимальный запрос (пустой заказ, без позиций):**

```bash
curl -X POST "https://your-backend.example.com/api/orders/from-website" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_WEBSITE_ORDER_API_KEY" \
  -d '{
    "customerName": "Иван Петров",
    "customerPhone": "+375 29 123-45-67"
  }'
```

**Загрузка файла к заказу (POST /api/orders/:id/files или POST /api/orders/from-website/:orderId/files):**

```bash
curl -X POST "https://your-backend.example.com/api/orders/915/files" \
  -H "X-API-Key: YOUR_WEBSITE_ORDER_API_KEY" \
  -F "file=@/path/to/maket.pdf"
```

**Структура элемента в `items`:**
- **`type`** (обязательно) — строка или ID продукта: название/тип позиции (например `"Визитки"`, `"Листовки"` или id из каталога).
- **`params`** (опционально) — объект или JSON-строка: произвольные параметры (например `description`, `readyDate`). Сохраняются в БД и отображаются в CRM.
- **`price`** (обязательно) — число: цена за единицу (базовая; к ней применяется `priceType`, если передан).
- **`quantity`** (обязательно) — число: количество.
- **`priceType`** (опционально) — строка: `standard` (без изменения), `urgent`, `online`, `promo`, `special`. Можно передать в элементе или внутри `params`.

### Пример: фото «Премиум - Квадратные фото» с заполненными полями

Чтобы в Order Pool отображались описание, размер, тип бумаги и прочие детали — передайте полный `params`:

```bash
curl -X POST "https://api.printcore.by/api/orders/from-website" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_WEBSITE_ORDER_API_KEY" \
  -d '{
    "customerName": "Мария Иванова",
    "customerPhone": "+375 29 555-12-34",
    "customerEmail": "maria@example.com",
    "prepaymentAmount": 4.80,
    "items": [
      {
        "type": "Премиум - Квадратные фото",
        "params": {
          "description": "Квадратные фото 10×10 см, матовая бумага, 4 шт",
          "specifications": {
            "format": "10×10",
            "paperType": "glossy",
            "paperDensity": 250,
            "sides": 1,
            "quantity": 4
          },
          "formatInfo": "100×100 мм",
          "parameterSummary": [
            { "label": "Формат печати", "value": "10×10 см" },
            { "label": "Материал", "value": "Матовая бумага 250 г/м²" },
            { "label": "Плотность", "value": "250 г/м²" }
          ],
          "layout": {
            "sheetsNeeded": 1,
            "itemsPerSheet": 4,
            "sheetSize": "SRA3"
          },
          "sheetsNeeded": 1,
          "piecesPerSheet": 4
        },
        "price": 1.20,
        "quantity": 4,
        "priceType": "standard"
      }
    ]
  }'
```

**Поля `params`, которые отображаются в Order Pool:**

| Поле | Назначение |
|------|------------|
| `description` | Текст под названием (вместо «Без описания») |
| `specifications.format` | Размер/формат — «Формат печати: 10×10» |
| `specifications.paperType` | Тип бумаги (glossy, matte и т.д.) |
| `specifications.paperDensity` | Плотность (г/м²) |
| `specifications.sides` | Стороны печати (1 или 2) |
| `formatInfo` | Альтернатива для формата, если нет `specifications.format` |
| `parameterSummary` | Чипы: формат, материал, плотность |
| `layout.sheetsNeeded` | Количество листов |
| `layout.itemsPerSheet` | Штук на листе |
| `layout.sheetSize` | Формат листа (SRA3, A4 и т.д.) |
| `priceType` | Тип цены (срочно, онлайн, промо и т.д.) |

**Вариант: 4 разных фото как 4 отдельные позиции** (если каждое фото — своя строка):

```json
{
  "customerName": "Мария Иванова",
  "customerPhone": "+375 29 555-12-34",
  "prepaymentAmount": 4.80,
  "items": [
    {
      "type": "Премиум - Квадратные фото",
      "params": {
        "description": "Фото 1 — 10×10 см, матовая бумага",
        "specifications": { "format": "10×10", "paperType": "glossy", "paperDensity": 250, "sides": 1 },
        "parameterSummary": [{ "label": "Формат печати", "value": "10×10 см" }]
      },
      "price": 1.20,
      "quantity": 1,
      "priceType": "standard"
    },
    {
      "type": "Премиум - Квадратные фото",
      "params": {
        "description": "Фото 2 — 10×10 см, матовая бумага",
        "specifications": { "format": "10×10", "paperType": "glossy", "paperDensity": 250, "sides": 1 },
        "parameterSummary": [{ "label": "Формат печати", "value": "10×10 см" }]
      },
      "price": 1.20,
      "quantity": 1,
      "priceType": "standard"
    }
  ]
}
```

У каждой позиции свой `description` — в Order Pool не будет «Без описания».

**Ответ 201 (успех):**
```json
{
  "order": {
    "id": 915,
    "number": "ORD-0897",
    "customerName": "Иван Петров",
    "customerPhone": "+375 29 123-45-67",
    "source": "website",
    ...
  },
  "message": "Заказ с сайта создан",
  "deductionResult": { ... }
}
```

### Заказ и файлы в одном запросе

- **`POST /api/orders/from-website/with-files`** — создание заказа с сайта и прикрепление файлов в одном запросе.
- **Авторизация:** тот же **`X-API-Key`** или **`Authorization: Bearer <WEBSITE_ORDER_API_KEY>`**.
- **Тело запроса:** **`multipart/form-data`**.
  - Поля: `customerName`, `customerPhone`, `customerEmail` (опционально), `prepaymentAmount`, `customer_id`, `items` (опционально; если есть — JSON-строка массива позиций, как в `from-website`).
  - Файлы: поле **`file`** (можно несколько полей с именем `file`; до 20 файлов).
- Ответ 201: `{ order, files: [...], message, deductionResult? }`. Файлы опциональны — можно отправить 0 файлов, тогда `files: []`.

### Файлы клиента (отдельная загрузка к уже созданному заказу)

- **`POST /api/orders/from-website/:orderId/files`** — загрузка файла к заказу, созданному с сайта.
- **Авторизация:** тот же заголовок **`X-API-Key`** или **`Authorization: Bearer <WEBSITE_ORDER_API_KEY>`**.
- **Тело запроса:** `multipart/form-data`, поле **`file`** — сам файл.
- Разрешена только для заказов с **`source = 'website'`** (для остальных — 403).
- Ответ: 201 и объект файла (`id`, `orderId`, `filename`, `originalName`, `mime`, `size`, `uploadedAt`, …).

**Сценарии:** (1) Один запрос: `POST /api/orders/from-website/with-files` (multipart с полями заказа и полем `file`/файлами). (2) Два шага: сайт создаёт заказ через `POST /api/orders/from-website`, получает `order.id` и **`order.number`**, затем для каждого файла вызывает `POST /api/orders/from-website/{order.id}/files`. Чтобы заказ в пуле приходил **с файлами**, сайт должен либо использовать `with-files`, либо после создания заказа загружать файлы по `order.id`. **Позиции заказа:** если в `items` передаётся `type` как ID продукта (число), в CRM при отображении он подменяется на название продукта из каталога; описание берётся из `params.description` или «Без описания».

---

## Каталог продуктов для сайта (описания подтипов)

API продуктов возвращает данные для отображения каталога на сайте. Swagger: `/api-docs` (тег **Website Catalog**).

**`GET /api/products/categories`** — список категорий (Визитки, Брошюры и т.д.).

**`GET /api/products`** — список продуктов (id, name, category_id, description, icon и т.д.).

**`GET /api/products/:id/schema`** — полная схема продукта. В `data.template.simplified` содержатся:
- **`types`** — подтипы продукта (ProductTypeSubtype). Каждый подтип может иметь:
  - `id`, `name`, `default`
  - `briefDescription` — краткое описание для карточки
  - `fullDescription` — полное описание для страницы продукта
  - `characteristics` — массив строк (характеристики)
  - `advantages` — массив строк (преимущества)
- **`typeConfigs`** — конфиг по типам (размеры, цены, материалы).

Редактирование этих полей — в CRM, в шаблоне продукта, блок «Типы продукта» → «Контент для сайта».

### Примеры запросов с сайта printcore.by

**Базовый URL API** — замените на ваш (например `https://api.printcore.by` или URL CRM на Railway).

#### 1. Получить категории (страница «Наша продукция»)

```bash
curl -X GET "https://api.printcore.by/api/products/categories?activeOnly=true"
```

```javascript
// fetch (браузер / Next.js)
const res = await fetch('https://api.printcore.by/api/products/categories?activeOnly=true');
const categories = await res.json();
// [{ id: 1, name: "Визитки", sort_order: 1, icon: "..." }, ...]
```

#### 2. Получить продукты (все или по категории)

```bash
# Все активные продукты
curl -X GET "https://api.printcore.by/api/products?activeOnly=true"

# Продукты категории «Визитки» (categoryId=1)
curl -X GET "https://api.printcore.by/api/products/category/1?activeOnly=true"
```

```javascript
const products = await fetch('https://api.printcore.by/api/products?activeOnly=true').then(r => r.json());
// [{ id: 58, name: "Визитки", category_id: 1, category_name: "Визитки", ... }, ...]
```

#### 3. Получить подтипы и контент для страницы продукта

```bash
# Схема продукта «Визитки» (productId=58) — подтипы, описания, калькулятор
curl -X GET "https://api.printcore.by/api/products/58/schema"
```

```javascript
const res = await fetch('https://api.printcore.by/api/products/58/schema');
const { data } = await res.json();

// Подтипы с описаниями для карточек и страницы
const subtypes = data?.template?.simplified?.types ?? [];
// [{ id: "type_xxx", name: "Визитки стандартные цветные", briefDescription: "Цветные на плотной бумаге",
//    fullDescription: "Классические цветные визитки...", characteristics: ["Размер: 90×50 мм", ...],
//    advantages: ["Высокое качество печати", ...] }, ...]

// Конфиг калькулятора по подтипу
const typeConfigs = data?.template?.simplified?.typeConfigs ?? {};
```

#### 4. Типичный сценарий для printcore.by

1. **Главная каталога** — `GET /api/products/categories?activeOnly=true` → сетка категорий.
2. **При клике на категорию** — `GET /api/products/category/{categoryId}?activeOnly=true` → список продуктов.
3. **При клике на продукт** — `GET /api/products/{productId}/schema` → подтипы с `briefDescription`, цены «от» из `typeConfigs`.
4. **При клике на подтип** — страница продукта: `fullDescription`, `characteristics`, `advantages` + калькулятор из `typeConfigs`.

---

## Краткая схема для интеграции типа karandash.by

1. **Сайт** при оформлении заказа вызывает API создания заказа (после появления публичного эндпоинта или с API-ключом), с `source: 'website'`, без `userId`.
2. Заказ сохраняется в **`orders`** (`source = 'website'`, `userId = null`, `status = 1`).
3. В CRM в разделе **«Пул заказов»** запрос **`GET /api/order-management/pool`** подтягивает эти заказы в блок **unassigned**.
4. Менеджер нажимает «Взять» → **`POST /api/order-management/assign`** с `orderType: 'website'` и своими `userId`, `userName`, `date`.
5. Заказ появляется на странице заказов менеджера и уходит из unassigned.

Если нужно, могу предложить конкретные изменения в коде (роут, контроллер, проверка API-ключа) для публичного создания заказов с сайта.

---

## Планы: система уведомлений клиенту (TODO)

**Запланировано:** реализовать систему уведомлений для клиента — оповещение о готовности заказа по email и при необходимости по SMS (например, при переходе заказа в статус «Готов» / «Передан в ПВЗ»). Подробнее по настройке почтового агента и SMS см. **[Настройка уведомлений клиентам (email/SMS)](./customer-notifications-setup.md)**.
