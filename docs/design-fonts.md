# Шрифты макетов (design_fonts)

CRM хранит файлы шрифтов для корректного импорта SVG, production PDF и отдачи сайту через public API.

См. также: [design-template-importer.md](./design-template-importer.md), [client-editor-site-integration.md](./client-editor-site-integration.md).

## Библиотека CRM

Админка: `/adminpanel/design-fonts`

- Загрузите `.woff2` (предпочтительно), `.woff`, `.ttf` или `.otf`
- Поле **family_name** должно совпадать с именем в макете (`font-family` в SVG / `fabricJSON.fontFamily`)
- Примеры: `Happy Time`, `Ceremonious One`

Таблица: `design_fonts`. Файлы: `uploads/design-fonts/`.

## Шрифты в ZIP-импорте

При импорте ZIP со страницами SVG можно приложить папку `fonts/`:

```
template.zip
  page-1.svg
  fonts/HappyTime.woff2
  fonts/CeremoniousOne.woff2
```

Имена файлов сопоставляются с family по эвристике (`HappyTime.woff2` → `Happy Time`). При несовпадении — предупреждение в импорте; уточните имя в библиотеке CRM.

Приоритет: **глобальная библиотека** → **bundled из ZIP**.

## Importer v7

- Порядок слоёв в SVG = порядок объектов в `fabricJSON` (photo/text вперемешку, не «все фото, потом весь текст»)
- Парсинг `font-family` из SVG в текстовые поля `text_*`
- `spec.requiredFonts` — список шрифтов макета после импорта
- `spec.fontsResolved` — `false`, если есть `source: missing`

## Public API для сайта

| Method | Path |
|--------|------|
| GET | `/api/design-templates/public/:id` — в `spec.requiredFonts` |
| GET | `/api/design-fonts/public/:id/content` — файл шрифта |

Сайт (отдельный репозиторий редактора) перед отрисовкой Fabric:

1. Прочитать `requiredFonts` из шаблона
2. Для каждой записи с `url` — `FontFace` + `document.fonts.add()`
3. Дождаться `document.fonts.ready`

Базовый URL — origin CRM (или BFF-прокси сайта).

## Production PDF

CRM при генерации `production_pdf` подставляет `@font-face` из библиотеки и bundled-шрифтов шаблона (Puppeteer + `document.fonts.ready`).

## Лицензии

Ответственность за право использования шрифта — у загружающего в CRM.
