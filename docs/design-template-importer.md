# Импорт дизайн-шаблонов для сайта

> **Для дизайнеров (ТЗ по подготовке файла):** [design-template-designer-guide.md](./design-template-designer-guide.md)

## Назначение

Дизайнер не собирает шаблон вручную в CRM-редакторе. Он готовит исходник в AI/CDR и экспортирует файл для импорта. Backend импортирует этот файл в `designState`, а отдельный сайт использует готовый шаблон через публичные API.

## Рабочие форматы

- Основные форматы текущего этапа: `SVG` для одной страницы или `ZIP` со страницами `SVG`.
- **Multi-size ZIP:** папки размеров (`204x204/`, `148х210/` — латиница/кириллица `x`/`х`). Допустима одна обёртка (`Свадьба/204x204/...`). В каждой папке — SVG одного физического формата. Импорт создаёт один `design_code` и N строк `design_templates`. Источник мм — SVG; имя папки — подсказка.
- Плоский ZIP (SVG в корне) — один макет / один размер, как раньше.
- При импорте с `productId`+`typeId` вариант автоматически линкуется к `sizes[]` продукта по совпадению мм (±1 мм), иначе warning.
- Поле `design_code` в форме импорта — добавить размер к существующей семье без нового кода.
- `PDF` будет поддерживаться отдельным этапом.
- `AI` и `CDR` остаются master-исходниками дизайнера.

## Имена слоёв и объектов

Имя задаётся через `id` или `inkscape:label`. Первый распознанный вариант используется importer-ом.

| Имя | Значение |
|---|---|
| `locked_bg` | Явный заблокированный фон/графика. Фон страницы в `fabricJSON` создаётся только при наличии этого слоя. |
| `photo_1`, `photo_2`, `photo_avatar` | Область для фото клиента. Для первого этапа объект должен быть `rect` с `x`, `y`, `width`, `height`. |
| `text_name`, `text_phone`, `text_title` | Редактируемое текстовое поле. Для первого этапа объект должен быть `text` с координатами `x`, `y`. |
| `text_title_center`, `text_name_right`, `text_center` | То же `text_*`, плюс суффикс выравнивания: `_center` / `_right` / `_left` → в Fabric `textAlign` (`center`/`right`/`left`). **Id поля** остаётся без суффикса (`text_title`, или авто `text_1` для голого `text_center`). |
| `decor_*` | Интерактивный декоративный объект. Поддержаны SVG `rect`, `circle`, `ellipse`, `path`, `polygon`, растровые `<image>` (PNG/JPG), а также заливки `linearGradient` / `radialGradient` через `fill:url(#id)` (Corel). |
| *(без имени)* | `rect`, `circle`, `ellipse`, `path`, `image` без `photo_*` / `text_*` / `locked_bg` автоматически импортируются как `decor_auto_*`. |
| `trim`, `bleed`, `safe` | Опциональные направляющие зон печати. |
| `hidden_*`, `guide_*` | Технические объекты. В клиентский шаблон не попадают. |

## Требования к SVG

- SVG должен иметь `width`/`height` или `viewBox`.
- Для размеров в миллиметрах предпочтительно указывать `width="100mm"` и `height="150mm"`.
- Фото-поля должны быть прямоугольниками.
- Текстовые поля должны быть текстовыми объектами, а не кривыми.
- Если importer не может распознать важный слой, он возвращает предупреждения/ошибки импорта.

### Поведение backend-импортера (CRM)

- Принимается **SVG** или **ZIP со страницами SVG** (контракт по именам в `id`, `inkscape:label` или `data-name`).
- **Плоский ZIP:** файлы `.svg` сортируются по имени (`page-2` перед `page-10`) → один `designState`. Все страницы одного физического размера.
- **ZIP с папками размеров** (`204x204/page-1.svg`, …): каждая папка → отдельный шаблон семьи; общий авто `design_code`.
- Название при импорте необязательно — публичный ID = `design_code`.
- У **`<g id="photo_…">`**: вложенный **`<rect>` без собственного id** получает то же имя — типичный экспорт из Illustrator/Inkscape.
- Если и у группы, и у `rect` есть имена, в приоритете **прямое имя rect**.
- **Импортёр v7:** порядок интерактивных слоёв в `fabricJSON` совпадает с порядком `photo_*` / `text_*` в SVG (z-order); `font-family` читается из SVG в текстовые поля.
- **Многострочный текст:** несколько `<tspan>` в одном `<text id="text_…">` или несколько `<text>` внутри `<g id="text_…">` объединяются в **один** блок с переносами `\n` (в редакторе — `textbox`).
- **Смешанные шрифты в одном поле:** несколько `<tspan>` / `<text>` с разными `font-family` в одном `text_*` → в `fabricJSON` один **`textbox`** и массив **`textStyleRuns`** (`{ start, end, fontFamily, … }`). Fabric `styles` в сохранённом JSON **не хранятся** — собираются в рантайме редактора для превью; при правке текста поле ведёт себя как обычный textbox.
- **Corel DRAW:** последовательности `_x0020_` (пробел), `_x002c_` (запятая) и т.п. в тексте и именах слоёв декодируются автоматически.
- **Поворот текста:** `transform="rotate(…)"` и матрицы поворота на `<g>` / `<text>` переносятся в Fabric как `angle` (вертикальные подписи дат и т.п.).
- **Выравнивание:** `text-anchor` и CSS `text-align` на `<text>`, `<tspan>` и родительской `<g>` → `originX` / `textAlign` в Fabric (`start` / `center` / `end`).
- **Обогащение Corel:** атрибуты `data-crm-font`, `data-crm-align`, `data-crm-frame-w-mm`, `data-crm-x-mm` / `data-crm-y-mm`, `data-crm-ascent` на `text_*` имеют приоритет над эвристиками; ширина/baseline при наличии TTF из design-fonts считаются по метрикам (см. [design-template-designer-guide.md](./design-template-designer-guide.md) §12).
- **Цвет текста:** SVG-атрибут `fill`, CSS `fill` / `color` (в т.ч. классы Corel `.fil0 { fill: #FFFFFF }`) → `fill` в Fabric; без цвета в SVG — тёмно-серый `#111827`.
- **Фото-поля `photo_*`:** при открытии в редакторе пустые ячейки показывают серый фон, синюю пунктирную рамку и иконку камеры по центру (импорт из SVG даёт rect, редактор дорисовывает chrome).
- **Диагностические коды warning-ов:** parser добавляет префиксы вида `[CODE]` (например `TXT_NO_VALID_NODE`, `PHOTO_NO_VALID_RECT`, `TRANSFORM_UNSUPPORTED`) для детерминированной диагностики проблемных слоёв.
- **Parser report:** в `spec.import.pages[].parserReport` сохраняется структурированный отчёт по слоям (`status`, `reasonCode`, `bboxSvg`, `bboxScene`), агрегаты (`countsByStatus`, `countsByReasonCode`) и тайминги стадий (`sanitize/scan/geometry/text/assemble/total`).
- **Trace-режим:** при `trace=true` в admin import/reimport в `spec.import.pages[].trace.timeline` сохраняется сжатый трейс решений парсера (по умолчанию trace не пишется).
- **Импортёр v8:** из текста каждой SVG-страницы перед сохранением в uploads **вырезаются** интерактивные поля (`photo_*`, `text_*`, `decor_*`), технические имена (`hidden_*`, `guide_*`), **`trim` / `bleed` / `safe`**. Если есть явный `locked_bg`, он остаётся фоном страницы (`isBackground`), иначе фон в `fabricJSON` не создаётся.
- При невозможности распарсить `text_*`, `photo_*` или `decor_*` в интерактивный объект слой остаётся в `strippedSvg`, а в warning фиксируется причина (`TXT_NO_VALID_NODE`, `PHOTO_NO_VALID_RECT`, `DECOR_NO_VALID_SHAPE`).
- Объекты без префикса (`photo_*`, `text_*`, `decor_*`) и без `locked_bg`: **rect / circle / ellipse / path / image (png/jpg)** импортируются как **`decor_auto_*`**; прочие теги остаются в фоне с предупреждением.
- **Hard limits:** importer останавливает сверхтяжёлые файлы с кодированными ошибками (`SVG_SIZE_LIMIT_EXCEEDED`, `SVG_COMPLEXITY_LIMIT_EXCEEDED`, `SVG_GROUP_DEPTH_LIMIT_EXCEEDED`, `SVG_NODE_COUNT_LIMIT_EXCEEDED`) вместо зависаний.
- Прямые `rect` **`trim`** / **`bleed`** / **`safe`** служат источником **`designState.prepress`** (дозаливка и безопасная зона **оцениваются** из взаимного положения прямоугольников; значения нужно сверять с производством). Если направляющих в SVG не было — блок `prepress` не записывается.
- Объекты с нестандартными именами → предупреждение «не используется».

## Результат импорта

Importer создаёт или обновляет запись в `design_templates`:

- `preview_url` указывает на **первую SVG-страницу после вырезания** указанных слоёв (исходный файл не подменяет превью);
- `spec.width_mm`, `spec.height_mm`, `spec.page_count`;
- `spec.import` содержит метаданные импорта: `importerVersion: 7`, список `pages`, `normalizedFiles`, распознанные `guideRectsMmParsed`, предупреждения и ошибки;
- `spec.requiredFonts` — шрифты, используемые в `designState`, со статусом `global` / `bundled` / `missing` (см. [design-fonts.md](./design-fonts.md));
- `spec.designState` содержит массив страниц Fabric (фото- и текстовые поля), при наличии направляющих — **`prepress`**, а фон каждой страницы подставляется из её очищенного SVG.

## Публичный сайт

Отдельный сайт не использует CRM UI и не требует CRM-авторизации. Он получает master-шаблоны через public editor API, создаёт editor draft, загружает пользовательские файлы в draft и финализирует заказ с `source = website`.

Импортированный `design_templates.spec.designState` нельзя изменять под конкретного клиента. Пользовательская вариация макета сохраняется в `editor_drafts.payload.designState`, а после finalize переносится в `order_items.params.designState`. Подробный контракт публичного редактора описан в `docs/website-orders-integration.md` и `docs/DESIGN_EDITOR_SUMMARY.md`.
