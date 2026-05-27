# Каталог шаблонов (`/adminpanel/design-templates`)

Рабочее место дизайнера и менеджера макетов в CRM. Master-шаблоны хранятся в `design_templates`; клиент на сайте получает копию через draft, не меняя master.

См. также:

- [site-design-gallery-integration.md](./site-design-gallery-integration.md) — **матрица id, 4 экрана сайта, примеры public API** (для команды сайта)
- [design-template-importer.md](./design-template-importer.md)
- [DESIGN_EDITOR_SUMMARY.md](./DESIGN_EDITOR_SUMMARY.md)
- [client-editor-crm-site-boundary.md](./client-editor-crm-site-boundary.md)

## Основной поток (рекомендуется)

1. **Импорт шаблона** — SVG или ZIP со страницами по конвенции слоёв (`photo_*`, `text_*`, `trim`/`bleed`/`safe`).
2. Опционально **исходник** (AI/CDR/PDF) — сохраняется в `spec.import`, в карточке без SVG шаблон будет **draft** (неактивен).
3. Указать **Product ID / Type ID / Size ID** при импорте или в карточке шаблона — для `GET /api/design-templates/public`.
4. **Шаблон** — админский редактор master (`/adminpanel/design-editor/:id`).
5. **Клиент** — sandbox публичного редактора (`/adminpanel/public-design-editor-preview/:id`).

Ручное «Добавить шаблон» без импорта — только для простых фонов (PNG/JPG) и последующей сборки в редакторе.

## Статусы в каталоге

| Статус | Значение |
|--------|----------|
| **Активен** | `is_active` и есть `spec.designState` — виден в public API |
| **Неактивен** | Выключен вручную |
| **Draft** | Нет `designState` (только исходник или пустой spec) — на сайт не отдавать |

## Автор макета и внутренняя плата (ЗП)

Поля в `design_templates` (суммы в **бел. руб.**):

| Поле | Смысл |
|------|--------|
| `author_user_id` | Пользователь CRM — автор master-шаблона |
| `usage_fee` | База за использование макета на 1 ед. (пример: 3,00) — **уже в цене продукта**, клиенту отдельно не показывается |
| `author_percent` | % автору **от `usage_fee`**, не от суммы позиции заказа |

**Начисление ЗП автора:** при пересчёте `order_item_earnings` за день, если в `items.params` есть `designTemplateId` и у шаблона заданы автор, `usage_fee > 0` и `author_percent > 0`, создаётся вторая строка с `earning_type = 'design_author'`:

- `user_id` = `author_user_id`
- `order_item_total` = `usage_fee × quantity`
- `amount` = `order_item_total × author_percent / 100`

Пример: `usage_fee = 3`, `author_percent = 10`, qty = 1 → **0,30 бел. руб.** автору; **% оператора** по позиции считается отдельно (`earning_type = 'operator'`), как раньше.

Public API (`GET /api/design-templates/public`) **не отдаёт** `author_user_id`, `usage_fee`, `author_percent`.

## Привязка к продукту

**Источник правды:** таблица `product_subtype_designs` с полями `product_id`, `type_id`, **`size_id`** (строка = `sizes[].id` из конфига подтипа), `design_template_id`.

- Вкладка **«Привязки к продуктам»** на [`/adminpanel/design-templates`](../frontend/src/pages/admin/DesignTemplatesPage.tsx) — матрица размеров подтипа без захода в карточку продукта; deep link: `?tab=bindings&productId=&typeId=`.
- Для **каждого размера** выбранного подтипа в карточке продукта (вкладка «Дизайн» в [SubtypeDesignsCard](../frontend/src/features/productTemplate/components/SubtypeDesignsCard.tsx)) должен быть **хотя бы один** активный шаблон. Кнопка **«Полная матрица в каталоге»** открывает ту же вкладку с предзаполненным продуктом/подтипом.
- Подтипы изолированы: «Стандартные» (`type_id=1`) и «Крафт» (`type_id=2`) — **разные** списки привязок; макеты не перетекают автоматически.
- Сайт: `GET /api/design-templates/public?productId=&typeId=` — все макеты подтипа; с `&sizeId=` — только для этого размера.
- Всегда передавать **и** `productId`, **и** `typeId`; запрос только с `productId` отдаёт весь каталог (ошибка интеграции).
- Поля `productId`, `typeId`, `sizeId` в `spec` шаблона синхронизируются при привязке (дублируют связь для отладки).
- Импорт SVG: при указании product + type обязательно укажите **sizeId**, иначе привязка к продукту не создаётся (только запись в каталоге).

Подробная матрица id и smoke curl: [site-design-gallery-integration.md](./site-design-gallery-integration.md).

## Действия на карточке

- **Шаблон** — master в Fabric.
- **Клиент** — проверка UX заполнения.
- **Ссылка (привязки)** — вкладка «Привязки», если в spec есть product/type.
- **Карандаш** — метаданные, автор, плата в бел. руб., превью, размеры.
- **Копия** — дубликат (fee/percent копируются, автор — текущий пользователь).
- Переключатель **активен** — без открытия модалки.

На карточке каталога: автор, строка вида `3,00 бел. руб. · 10% → 0,30 бел. руб./ед.` (подсказка «не в цене клиента»).

## Что не делает каталог

- Не редактирует пользовательские draft и заказы.
- Не заменяет повторный импорт SVG в существующий шаблон (пока только новый импорт или правки в редакторе).
