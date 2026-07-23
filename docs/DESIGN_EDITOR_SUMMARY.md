# Редактор макетов

> **Интеграция на отдельный сайт:** полный гайд для команд сайта — [client-editor-site-integration.md](./client-editor-site-integration.md) (BFF, `ClientEditorRouter`, checkout с `editorDraftToken`). Ниже — обзор редактора в CRM (админ + public API).

## Назначение

Редактор работает с печатными макетами на базе `designState`. Важно разделять три сущности:

- `design_templates.spec.designState` — master-шаблон: фон, размеры, prepress, фото-поля и текстовые плейсхолдеры.
- `editor_drafts.payload.designState` — пользовательская вариация макета на отдельном сайте до оформления заказа.
- `order_items.params.designState` — финальная вариация макета, привязанная к позиции заказа.

Клиентская правка не должна записываться обратно в `design_templates`. Шаблон остаётся исходной формой для новых клиентов, а конкретный печатный файл генерируется из draft/order item.

## Текущая архитектура

- CRM-редактор находится в `frontend/src/pages/admin/DesignEditorPage.tsx`.
- Canvas и основные операции Fabric.js находятся в `frontend/src/pages/admin/designEditor/DesignEditorCanvas.tsx`.
- Состояние редактора сериализуется как `DesignState` из `frontend/src/pages/admin/designEditor/types.ts`.
- Загрузка страницы/разворота и фон шаблона вынесены в `frontend/src/pages/admin/designEditor/designPageLoader.ts`.
- Геометрия страницы, safe zone и bleed рассчитываются в `frontend/src/pages/admin/designEditor/designGeometry.ts`.
- Каталог и импорт шаблонов: `frontend/src/pages/admin/DesignTemplatesPage.tsx`, инструкция — `docs/design-templates-catalog.md`.

Редакторы разделены по ответственности:

- **Master-редактор** — `frontend/src/pages/admin/DesignEditorPage.tsx` (+ `designEditor/`). Роут: `/adminpanel/design-editor/:templateId` (кнопка «Макет» в каталоге). Полный canvas как у клиента; Save **абсолютно** перезаписывает `design_templates.spec.designState`. Клиенты на сайте получают уже эту версию.
- **Клиентский редактор** — `features/clientEditor/` + `publicDesignEditor/` (вендор на сайт). Пишет только `editor_drafts` / заказ, **не** master.
- Проверка клиентского UX — на сайте (`printcore.by/.../order/editor`).

Sync ядра CRM → сайт: `node tools/sync-design-editor.mjs` (см. скрипт).

## Импорт шаблонов

Дизайнер не собирает шаблон вручную в CRM. Он готовит исходник в AI/CDR и экспортирует рабочий SVG. Backend импортирует SVG в `design_templates.preview_url`, `spec.import` и `spec.designState`.

Рабочий контракт SVG описан в `docs/design-template-importer.md`:

- `locked_bg` — заблокированный фон/графика.
- `photo_*` — прямоугольные области для фото клиента.
- `text_*` — редактируемые текстовые поля.
- `trim`, `bleed`, `safe` — направляющие печатных зон.
- `hidden_*`, `guide_*` — технические объекты, которые не попадают в клиентский шаблон.

Importer v3 вырезает интерактивные/технические слои из превью, чтобы фон не дублировал фото-поля и линии prepress. Распознанные поля попадают в `spec.designState`.

## Public Editor API

Интеграция галереи на сайте (4 экрана, `productId` / `typeId` / `sizeId`, примеры curl): [site-design-gallery-integration.md](./site-design-gallery-integration.md).

Отдельный сайт не использует CRM UI. Он получает master-шаблоны и работает с пользовательским draft через отдельные endpoint-ы:

- `GET /api/design-templates/public?productId=...&typeId=...&sizeId=...` — список активных шаблонов.
- `GET /api/design-templates/public/:id` — один активный шаблон с `spec.designState`.
- `POST /api/public-editor/drafts` — создать draft для выбранного шаблона/продукта.
- `GET /api/public-editor/drafts/:token` — получить draft.
- `PATCH /api/public-editor/drafts/:token` — сохранить пользовательскую вариацию (`designState`, `photoBatch`, `selectedParams`).
- `POST /api/public-editor/drafts/:token/files` — загрузить файл клиента в draft; ответ содержит стабильный `url` для записи в Fabric JSON.
- `GET /api/public-editor/drafts/:token/files/:fileId/content` — стабильная ссылка на файл draft для браузерного рендера изображения.
- `POST /api/public-editor/drafts/:token/finalize` — создать заказ `source=website`, перенести draft в позицию заказа и привязать файлы.

Изменяющие draft endpoint-ы `/api/public-editor/*` защищены `WEBSITE_ORDER_API_KEY`. Ключ должен использовать backend отдельного сайта, не браузер. Ссылка на содержимое draft-файла доступна по секретному token/id, чтобы браузер мог отрисовать изображение без передачи API-ключа.

При `finalize` сервис переносит:

- `payload.designState` → `order_items.params.designState`;
- `payload.photoBatch` → `order_items.params.photoBatch`;
- `payload.selectedParams` → `order_items.params.selectedEditorParams`;
- `editorDraftToken` и `designTemplateId` → params позиции заказа;
- draft-файлы → `order_files`.

## Контракт `designState`

`designState` хранит сериализуемое состояние макета:

```json
{
  "templateId": 123,
  "pageWidth": 90,
  "pageHeight": 55,
  "pageCount": 1,
  "sceneScale": 1,
  "prepress": {
    "bleedMm": 2,
    "safeZoneMm": 5,
    "showBleed": true,
    "showTrim": true,
    "showSafeZone": true,
    "cutMarks": true
  },
  "pages": [
    {
      "fabricJSON": {}
    }
  ]
}
```

В `pages[].fabricJSON` сохраняется Fabric.js JSON. Для пользовательских файлов нельзя сохранять временные `blob:` URL как долговременное состояние: файлы нужно загрузить в draft/order files, а в `designState` хранить стабильную ссылку или имя файла.

## Режимы продуктов

Режим редактора задаётся явно в `config_data.simplified.design_editor_mode`:

- `none` — редактор не открывается, клиент загружает готовый макет или просит разработку.
- `single` — один печатный макет: открытка, постер, визитка, одиночное фото с дизайном.
- `multipage` — страницы/развороты для фотокниг, календарей, буклетов и каталогов.
- `photo_batch` — пакетная фотопечать для набора фото; это отдельный сценарий с сеткой фото, кропом, поворотом, количеством и массовыми действиями.
- `souvenir_3d` — сувенирка (майка/кружка): Fabric-зона печати + 3D-превью; печать только плоский PDF. См. [souvenir-3d-editor.md](./souvenir-3d-editor.md).

## Client Editor Modes

Клиентский входной компонент — `ClientEditorRouter` из `frontend/src/features/clientEditor/`. Он принимает `productId`, `typeId`, `sizeId`, `templateId` и режим продукта:

- `single` показывает сценарий «Заполнить макет» и сохраняет `draft.payload.designState`;
- `multipage` показывает сценарий «Собрать многостраничный макет», использует общий controller навигации страниц/разворотов и сохраняет `draft.payload.designState`;
- `photo_batch` показывает сценарий «Загрузить фото на печать», грузит файлы в draft и сохраняет `draft.payload.photoBatch`.
- `souvenir_3d` показывает Fabric + 3D-превью (`Souvenir3dEditor`); в заказ — тот же `designState`, печать без 3D.

Sandbox CRM открывается по `/adminpanel/public-design-editor-preview/:templateId`. Режим можно выбрать query-параметром `mode`: `?mode=single`, `?mode=multipage`, `?mode=photo_batch` или `?mode=souvenir_3d`.

## Prepress

Общие prepress-поля:

- `bleedMm` — насколько изображение выходит наружу от финального trim-размера.
- `safeZoneMm` — насколько внутрь от trim-размера нужно держать важные объекты.
- `showBleed`, `showTrim`, `showSafeZone` — отображение зон в редакторе.
- `cutMarks` — дефолт для production export.

`DesignEditorPage` читает настройки из `spec.designState.prepress` или `spec.prepress`, передаёт их в canvas и сохраняет обратно в `designState`. Сейчас trim-формат остаётся рабочим размером canvas, а bleed отображается визуально вокруг trim. В режиме разворотов центральный стык страниц дополнительно подсвечивается как зона, куда нельзя ставить текст и фото. Расширение рабочей области до bleed box нужно делать отдельной миграционно-безопасной задачей.

## Photo Batch

CRM-экран доступен по `/photo-batch-editor?orderId=...&orderItemId=...&productId=...&typeId=...`. Он сохраняет результат в `params.photoBatch` позиции заказа. Клиентский сценарий `photo_batch` сохраняет тот же контракт в `draft.payload.photoBatch`.

Канонический контракт пачки — группы по размеру:

```json
{
  "groups": [
    {
      "groupSizeId": "10x15",
      "groupLabel": "10×15",
      "targetSizeMm": { "width": 100, "height": 150 },
      "quantity": 30,
      "items": [
        {
          "fileId": 123,
          "originalName": "IMG_0012.jpg",
          "quantity": 1,
          "fitMode": "cover",
          "rotation": 0,
          "crop": { "x": 0.12, "y": 0.04, "w": 0.76, "h": 0.92 }
        }
      ]
    }
  ],
  "totalFiles": 30,
  "totalQuantity": 30
}
```

Размер (`groupSizeId`, `targetSizeMm`) хранится на группе, не на каждом элементе. Для фотопечати crop хранится как параметры к оригиналу, а не как новый растрированный файл. Production export должен группировать файлы по размеру/позиции и генерировать ZIP/PDF/manifest для печати.

## Что уже есть

- Каталог шаблонов и импорт SVG.
- Админский редактор master-шаблона без клиентского режима заполнения.
- Sandbox-страница клиентского редактора для проверки пользовательского экземпляра.
- Многостраничный клиентский режим по умолчанию открывается в режиме разворотов (`spread_mode`); сохранённый draft может вернуть режим отдельных страниц.
- Загрузка шаблона из `spec.designState`.
- Фото-поля, текстовые поля, изображения, фон, страницы/развороты.
- Выделенные объекты в canvas можно двигать стрелками (`Shift` ускоряет шаг); базовый шаг адаптируется к размеру макета. Копирование/вставка объектов доступны через `Ctrl+C` и `Ctrl+V`.
- Правая панель клиентского редактора: фото (загрузка, библиотека, постановка в поля) и текстовые поля текущего фрагмента (preflight, фокус на canvas). После выхода из правки текста, если надпись пустая или осталась шаблонной («Текст», «Ваш текст» и т.п.), показывается жёлтое предупреждение над макетом. На мобиле — вкладки dock «Макет / Фото / Текст / Проверка». Вкладка «Проверка» (десктоп — панель задач внизу сайдбара): список ошибок preflight, переход на разворот по клику. Модалка перед заказом: миниатюры по полосе страниц/разворотов (как в навигаторе), для разворотов — две страницы рядом.
- Инструменты макета (иконки над canvas): добавление текста/заголовка, фото-полей, фигур; слой «Слои/объект» — удаление/дублирование/порядок для текста, пустых фото-полей и фигур в basic-режиме.
- Полоса страниц (клиент): светлая тема, компактные превью, кнопка «+ разворот»; кеш миниатюр в sessionStorage по fingerprint страницы.
- Нормализация нечётного числа внутренних страниц при открытии multipage в режиме разворотов (без лишнего dirty); добавление страниц учитывает `pageCountLimits.step`: если переплёт требует кратность 4, редактор автоматически добавляет недостающие пустые страницы до следующего допустимого количества и показывает информационную модалку. Добавление разворота стартует как +2 страницы, но также доводится до допустимой кратности.
- Клиентский текст (`textFieldClientAdded`, basic): компактный блок **Textbox** внутри safe zone, который можно растянуть углами; длинные надписи переносятся по строкам; preflight предупреждает, если текст выходит за trim или safe zone (вкладка «Проверка»). Шаблонный однострочный `i-text` из SVG по-прежнему можно сузить ресайзом или кеглем.
- Клиентские фото-поля (`photoFieldClientAdded`): при добавлении ширина = 30% ширины страницы (`pageWidthPx`), высота по соотношению сторон; пустое поле — **один Fabric `rect`** с `isPhotoField` (как поля из SVG-импорта), белая заливка и пунктирная обводка; ресайз углами с запеканием в `width/height` и `photoFieldFw/Fh` (draft на `object:scaling`, флаг жеста до `object:modified`). После загрузки фото заполненное поле — группа с frame-rect + cover; ресайз углами на холсте меняет **размер ячейки на макете**, но сохраняет выбранный в «Настроить кадр» фрагмент исходника (`resolvePanZoomFromPhotoFieldCropSource`). В модалке угол рамки меняет только масштаб (zoom) внутри фиксированного `photoFieldFw×Fh`, а не размер поля на странице. Legacy-группы с иконкой камеры по-прежнему поддерживаются через `bakeEmptyPhotoFieldScaleInPlace` + `relayoutEmptyPhotoFieldChrome`. Поля из шаблона без ручного ресайза.
- Фото-поля сохраняют ручной размер при заполнении фото; в клиентском редакторе нужное поле можно заполнить через выбор из фотопанели или drag-and-drop, при drag-and-drop поле подсвечивается. Даблтап по заполненному полю открывает кадрирование с рамкой видимой области и затемнением срезаемого. Заполненные поля отключают bitmap-cache Fabric и сохраняют размеры исходника для контроля качества.
- Prepress-зоны: bleed, trim, safe zone; в режиме разворотов показывается предупреждение на центральном стыке страниц.
- Smart Guides при перетаскивании объектов: стабильная drag-сессия, hysteresis и привязка к safe zone, центрам страниц/разворотов, ручным направляющим и краям/центрам объектов.
- Коллажи из `collage_templates`.
- Экспорт всех страниц в PDF из CRM-редактора.
- CRM-вход «Создать макет» из `FilesModal` отключён, чтобы операторы не попадали в старый смешанный flow.
- Public editor draft API для отдельного сайта.

## Smoke: sandbox клиентского редактора

Проверка в CRM: `/adminpanel/public-design-editor-preview/:templateId` (`?mode=multipage` / `single`).

| Сценарий | Ожидание |
|---|---|
| Multipage, развороты | Открытие → F5 → миниатюры из кеша; «+ разворот» сразу +2 стр.; полоса без тёмной админ-темы |
| Guided flow | «Следующее фото» / текст → переход на страницу; checkout-preview → клик по ошибке открывает разворот |
| Инструменты | + Текст / + Заголовок / фото-поле (~30% ширины страницы) / фигура; новый текстовый блок стартует компактно внутри safe zone; ресайз фото-поля и текстовых блоков углами (кегль запекается в fontSize); «Слои/объект» → Удалить |
| Mobile | Dock Макет/Фото/Текст/Проверка; вкладка «Текст» — компактное превью макета сверху + список полей; при выборе текста на «Макете» — поле ввода в панели над холстом, макет виден ниже |
| Autosave | Правка поля → через debounce сохранение draft; нормализация разворота при загрузке не помечает dirty |

## Инварианты стабильности canvas/pagestrip

- `pageLoadKey` в React и реально нарисованная страница Fabric должны сходиться через очередь transition: последний запрошенный ключ нельзя пропускать из-за устаревшего эффекта.
- `pageTransitionGate` отражает только реальные save/load операции. После любой ошибки или отмены перехода gate и `pageTransitionLockRef` должны возвращаться в idle.
- Page actions (`goTo`, `add`, `insert`, `delete`) выполняются последовательно и ждут idle canvas. Пользовательский клик не должен молча теряться из-за busy transition.
- Команды добавления объектов (`addText`, `addPhotoField`, `addShape`) должны ждать завершения page transition перед записью в Fabric, иначе объект может появиться на старой странице и исчезнуть после load.
- В basic-режиме первый клик по текстовому полю только выделяет объект; перетаскивание не должно начинаться на том же pointer sequence.

## Ограничения и следующие задачи

| Задача | Детали |
|---|---|
| Клиентский UI public editor | Есть sandbox-контейнер в CRM и adapter-слой `publicDesignEditorAdapter`; для прода отдельного сайта нужен backend-прокси, чтобы не отдавать `WEBSITE_ORDER_API_KEY` в браузер. |
| Стабильные URL файлов | Draft upload возвращает `url`, а клиентский слой передаёт его в canvas через `resolveImageFileUrl`. |
| Автосохранение draft | `PublicDesignEditor` сохраняет полный `designState` через adapter с debounce; ручное сохранение остаётся как явное действие, при грязном draft включена защита `beforeunload`. |
| Finalize draft | В sandbox есть форма имени/телефона/email, которая сохраняет draft и вызывает finalize; на прод-сайте эту форму должен заменить checkout сайта. |
| Production export | Генерировать печатный PNG/PDF/JPEG из `order_items.params.designState`, а не из master-шаблона. |
| Восстановление заказа | При повторном открытии позиции заказа восстанавливать макет из `order_items.params.designState`. |
| Photo batch export | Нужен серверный ZIP/PDF по группам размера с `manifest.json`, опциональной раскладкой на лист и метками реза. |

## Важные файлы

| Назначение | Путь |
|---|---|
| Клиентский product router | `frontend/src/features/clientEditor/ClientEditorRouter.tsx` |
| Клиентская фотопечать через draft | `frontend/src/features/clientEditor/ClientPhotoBatchEditor.tsx` |
| CRM-редактор | `frontend/src/pages/admin/DesignEditorPage.tsx` |
| Canvas и операции Fabric.js | `frontend/src/pages/admin/designEditor/DesignEditorCanvas.tsx` |
| Smart Guides / snapping | `frontend/src/pages/admin/designEditor/smartGuides/` |
| Типы `DesignState` | `frontend/src/pages/admin/designEditor/types.ts` |
| Загрузка страниц/фона | `frontend/src/pages/admin/designEditor/designPageLoader.ts` |
| Геометрия canvas/prepress | `frontend/src/pages/admin/designEditor/designGeometry.ts` |
| Клиентский редактор экземпляра | `frontend/src/features/publicDesignEditor/` |
| Панели редактора | `frontend/src/pages/admin/designEditor/panels/` |
| Модалка выбора изображений | `frontend/src/components/ImagePickerModal.tsx` |
| Каталог/импорт шаблонов | `frontend/src/pages/admin/DesignTemplatesPage.tsx` |
| API шаблонов | `backend/src/routes/designTemplates.ts`, `backend/src/services/designTemplateService.ts` |
| Importer SVG | `backend/src/services/designTemplateImporterService.ts`, `backend/src/services/designTemplateSvgParse.ts` |
| Public editor API | `backend/src/routes/publicEditor.ts`, `backend/src/services/publicEditorDraftService.ts` |
| Миграция drafts | `backend/src/migrations/20260424001000_create_public_editor_drafts.ts` |
| Коллажи | `backend/src/routes/collageTemplates.ts`, `backend/src/services/collageTemplateService.ts` |
| Вход из заказа | `frontend/src/components/FilesModal.tsx` |
