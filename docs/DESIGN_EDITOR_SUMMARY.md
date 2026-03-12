# Редактор макетов — сводка и план

## Сводка сделанного

### Редактор (общее)
- **Рефакторинг:** логика разнесена по модулям (`designEditor/`: types, constants, Sidebar, Panel, PhotoPanel, TextPanel, CollagesPanel, Canvas, Toolbar). Состояние сгруппировано (templateState, pageSpec, ui, photoPanel, pdfExport).
- **Выбор и ресайз на канвасе:** при клике по изображению или тексту показывается Transformer (рамка с ручками). Ресайз без поворота (`rotateEnabled={false}`). Угловые ручки сохраняют пропорции (keepRatio по умолчанию). Для текста сохраняются scaleX/scaleY в state и в designState.
- **Поле для фото:** тип `CanvasPhotoField` (id, x, y, width, height, src?). Кнопка «Поле для фото» в панели «Фото» добавляет пустой прямоугольник на страницу. В поле можно перетащить изображение с компьютера (дроп на Stage → поиск поля под курсором → запись `src` через URL.createObjectURL). Поля можно двигать и ресайзить (Transformer). Сохраняются в designState (в т.ч. src; blob-URL не переживут перезагрузку без загрузки на сервер).

### Модалка выбора изображений
- **ImagePickerModal:** при «Добавить изображение» или клике/дропе на зону загрузки в панели «Фото» открывается модалка (табы: Мои файлы / Фотобанк / ВКонтакте / Яндекс.Диск — активен только «Мои файлы»). Слева — блоки «Дата загрузки», «Мои альбомы» (пока заглушки). В центре — «Загрузить с компьютера» и «Загрузить с телефона» (выбор файлов), список выбранных, кнопка «Выбрать». При выборе файлы добавляются на текущую страницу макета как изображения.

### Коллажи (без хардкода)
- **Backend:** таблица `collage_templates` (id, name, photo_count, layout JSON, padding_default, sort_order, is_active). Миграция `20260325000000_create_collage_templates.ts`. Сервис и роуты `GET/POST /api/collage-templates`, `GET/PUT/DELETE /api/collage-templates/:id`. Layout: `{ cells: [ { x, y, w, h } ] }` (0–1).
- **Frontend:** API `getCollageTemplates({ photo_count?, only_suitable? })`, `getCollageTemplate(id)`. Панель «Коллажи»: выбор «Количество фото» (2–6), тумблер «Оставить только подходящие», слайдер «Размер отступа», сетка шаблонов из API (превью по layoutParsed). Выбранный шаблон хранится в state. Шаблоны добавляются через API (админ/настройки); в БД по умолчанию пусто.

### Ранее (кратко)
- Префлайт (проверка макетов, авто при загрузке, статус в списке файлов).
- Каталог шаблонов, редактор: фон из шаблона, зоны обрезки, текст, мультистраничность, экспорт PNG/PDF (все страницы), мобильная оптимизация, роуты в основном приложении и в админке.
- Интеграция с заказом: «Создать макет» из FilesModal, сохранение PNG и params (designState, designTemplateId).

---

## План реализации (следующие шаги)

| № | Задача | Детали |
|---|--------|--------|
| 1 | **Загрузка изображений в uploads** | При сохранении макета (и при дропе в поле для фото?) загружать изображения из designState (blob/file) на сервер (например `POST /api/orders/:id/files` или отдельный endpoint), получать стабильные URL, подставлять их в designState и в params. При открытии редактора из заказа подставлять эти URL в images/photoFields. |
| 2 | **Применение шаблона коллажа** | По выбранному шаблону из панели «Коллажи» создавать на странице поля для фото по layout.cells (пересчёт x,y,width,height в пиксели с учётом отступа и размера области). Кнопка «Применить» или автоматически при выборе шаблона. |
| 3 | **Список «Мои файлы» в ImagePickerModal** | Backend: хранить загруженные пользователем файлы (привязка к пользователю/сессии). Frontend: в модалке по табу «Мои файлы» подгружать список и показывать превью; выбор — в выбранные, затем «Выбрать». |
| 4 | **Интеграции (Фотобанк, ВК, Яндекс.Диск)** | По мере необходимости: API сторонних сервисов, OAuth, выбор фото из каталога и подстановка URL в макет. |
| 5 | **Сохранение полей для фото в заказе** | При сохранении макета в заказ: если в photoFields есть src (blob), конвертировать в file и загрузить, в designState записать уже URL из ответа. При загрузке макета из params — восстанавливать photoFields с этими URL. |
| 6 | **Админка шаблонов коллажей** | Страница (например в админке) для CRUD `collage_templates`: создание раскладки (превью по cells), задание photo_count, padding_default, сортировка. Либо seed-миграция с набором типовых раскладок. |

---

## Важные файлы

| Назначение | Путь |
|------------|------|
| Редактор (оркестратор) | `frontend/src/pages/admin/DesignEditorPage.tsx` |
| Канвас, Transformer, поля для фото | `frontend/src/pages/admin/designEditor/DesignEditorCanvas.tsx` |
| Панели (Фото, Текст, Коллажи) | `frontend/src/pages/admin/designEditor/panels/` |
| Модалка выбора изображений | `frontend/src/components/ImagePickerModal.tsx` |
| Каталог шаблонов | `frontend/src/pages/admin/DesignTemplatesPage.tsx` |
| Кнопка «Создать макет» | `frontend/src/components/FilesModal.tsx` |
| API шаблонов дизайна | `backend/src/routes/designTemplates.ts` |
| API шаблонов коллажей | `backend/src/routes/collageTemplates.ts`, `backend/src/services/collageTemplateService.ts` |
| Миграция коллажей | `backend/src/migrations/20260325000000_create_collage_templates.ts` |
| Поддержка params при PATCH items | `backend/src/modules/orders/controllers/orderItemController.ts` |
