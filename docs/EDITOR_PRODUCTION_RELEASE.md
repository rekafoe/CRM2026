# Editor production release (сайт + CRM)

Спецификация приоритета 3: клиентский редактор на сайте, CRM как backend для макетов, заказов и production-файлов.

См. также: [client-editor-crm-site-boundary.md](./client-editor-crm-site-boundary.md), [website-orders-integration.md](./website-orders-integration.md), [ADR: группировка открыток](./adr/ADR-editor-postcard-grouping.md).

## Архитектура

- **Сайт (frontend):** Fabric/UI, корзина, checkout, preflight UX.
- **Backend сайта:** `WEBSITE_ORDER_API_KEY`, прокси `POST/PATCH /api/public-editor/*`, `POST /api/orders/from-website`.
- **CRM:** шаблоны, draft, перенос в заказ, `layoutIncomplete`, очередь production PDF, `customer_projects`, imposition.

`POST /api/public-editor/drafts/:token/finalize` — только sandbox/CRM-preview, не боевой checkout.

**Mini App:** тот же контракт (`editorDraftToken`, перенос draft, production, проекты).

## Checkout

- Checkout на сайте → `POST /api/orders/from-website` с позициями.
- В `items[].params` передаётся `editorDraftToken` (или группа — см. ADR).
- CRM: `prepareWebsiteItemsWithEditorDrafts` → `designState` / `photoBatch` в `order_items.params`, файлы draft → `order_files`.
- Смешанная корзина: несколько позиций с разными token + позиции без редактора.

### Флаг неполного макета

При приёме заказа CRM проверяет `designState` (серверный preflight):

| Поле | Тип | Описание |
|------|-----|----------|
| `layoutIncomplete` | boolean | `true` если есть blocking issues |
| `layoutIssues` | array | `{ id, level, pageIndex, message }` |
| `layoutReviewPath` | string | Подсказка: `order-pool:item:{orderItemId}` |

Заказ **не отклоняется** из-за неполного макета.

## Production PDF

- Генерация **только в CRM** (очередь + ручной перезапуск).
- Триггер: заказ `source=website` или `mini_app` со статусом пула (status=1) → job `production_pdf`.
- Формат: **один multipage PDF** на позицию (`artifactType=production_pdf`, версии не удаляются).
- Качество: **Fabric-based raster 300 DPI**, размер страницы в **мм** (`pageSize + 2*bleed`), рендер в headless Chromium через реальный Fabric canvas из `order_items.params.designState`, затем упаковка PNG-страниц в multipage PDF.
- Production PDF по умолчанию — только постраничный (в размер продукта), без автоматической раскладки на SRA3.
- Защита от брака: если страница не загрузила assets/fonts или отрендерилась пустой, почти полностью белой/чёрной либо одноцветной, job должен упасть с понятной ошибкой и не сохранять плохой `production_pdf`.
- Цвет: текущий этап — **RGB raster PDF**. Полноценный vector/CMYK PDF — отдельный следующий этап после стабилизации raster production.
- Сайт **не** обязан прикладывать PDF при checkout.

API:

- `GET /api/orders/:id/items/:itemId/editor-production-manifest`
- `POST /api/orders/:id/items/:itemId/generate-production` (ручной, auth)
- `GET /api/orders/:id/items/:itemId/production-status`

## customer_projects

Хранение макета ~1 год для дубля заказа (не правка отправленного в печать).

| Поле | Описание |
|------|----------|
| `customer_id` | Клиент CRM |
| `design_state_json` | Snapshot designState |
| `source_order_id` / `source_order_item_id` | Источник |
| `editable` | `false` после финализации заказа в печать |
| `expires_at` | +365 дней от создания |

API (CRM auth): `GET /api/customers/:id/projects`

API (website key): `POST /api/public-editor/projects/:id/clone-draft` → новый `editorDraftToken`

## Группировка открыток

См. [ADR-editor-postcard-grouping.md](./adr/ADR-editor-postcard-grouping.md): одна позиция заказа, `params.editorLayoutGroup.slots[]`, multipage PDF.

## photo_batch

Вне scope до отдельного решения о фоторедакторе на сайте.

## Переменные окружения

| Env | Назначение |
|-----|------------|
| `WEBSITE_ORDER_API_KEY` | Backend сайта / miniapp proxy |
| `EDITOR_PRODUCTION_WORKER_ENABLED` | `true` — воркер очереди |
| `EDITOR_PRODUCTION_WORKER_INTERVAL_MS` | Интервал опроса (default 15000) |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium для PDF |

## Чеклист до прода (E2E)

1. **Миграция** `20260619100000_customer_projects_and_production_jobs.ts` на staging/prod.
2. **Env:** `WEBSITE_ORDER_API_KEY`, `EDITOR_PRODUCTION_WORKER_ENABLED=true`, Chromium (`PUPPETEER_EXECUTABLE_PATH`).
3. **Сайт:** proxy public-editor, `editorDraftToken` в корзине, `POST /api/orders/from-website` (без PDF).
4. **CRM smoke:** заказ с 2 token + 1 без token → пул → бейдж «Макет неполный» → preview → блок Production PDF → скачать/перегенерировать.
5. **Группа открыток:** одна позиция с `editorLayoutGroup.slots[]` → multipage PDF + job `imposition_sra3`.
6. **Mini App:** finalize checkout → те же `designState` и jobs.
7. **Проекты:** вкладка «Макеты» у клиента, `clone-draft` для дубля.
8. **Не в проде:** полная SRA3 imposition, CMYK на RIP, `photo_batch` production.
