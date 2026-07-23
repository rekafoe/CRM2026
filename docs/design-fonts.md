# Шрифты макетов (design_fonts)

CRM хранит файлы шрифтов для корректного импорта SVG, production PDF и отдачи сайту через public API.

См. также: [design-template-importer.md](./design-template-importer.md), [design-template-designer-guide.md](./design-template-designer-guide.md) (§4 — экспорт из Corel), [client-editor-site-integration.md](./client-editor-site-integration.md).

## Библиотека CRM

Админка: `/adminpanel/design-fonts`

Сделано:

- Загрузите один файл, несколько файлов или **целую папку** (до 100 за раз)
- Форматы: `.woff2` (предпочтительно), `.woff`, `.ttf`, `.otf`
- Для **TTF/OTF** `family_name` и **алиасы** (`name_aliases`) читаются из name table файла; если Corel/SVG пишет `CeremoniousOne`, а в библиотеке `Ceremonious One` — сопоставление идёт автоматически
- Без метаданных в файле — имя из названия файла (`ceremoniousone.ttf` → `Ceremonious One`)
- Превью на карточке грузит **свой файл** через `GET /api/design-fonts/:id/content` (отдельное имя в CSS, без коллизий `family_name`)
- Повторная загрузка с тем же `family_name` **обновляет файл** (не ошибка UNIQUE)
- Дубликаты в одной пакетной загрузке пропускаются (отчёт по каждому файлу)
- Для одного файла с другим написанием — «Изменить имя» перед загрузкой
- Имя должно совпадать с `font-family` в SVG / `fabricJSON.fontFamily`

API пакетной загрузки: `POST /api/design-fonts/batch` (поле `files[]`).

В редакторе макета шрифты из библиотеки CRM показываются в панели «Текст → Изменить шрифт»
(секция **Библиотека CRM**) и в выпадающих списках шрифта. Публичный список: `GET /api/design-fonts/public/list`.

После загрузки FontFace холст Fabric **пересчитывает** текстовые объекты (`reloadTextFonts`) — иначе в UI остаётся системный fallback (Times/Arial), хотя в списке выбран правильный `family_name`.

Таблица: `design_fonts`. Файлы: `uploads/design-fonts/`.

## Контракт: SVG → fabricJSON (приоритет)

| Приоритет | Источник | Действие |
|---|---|---|
| 1 | `font-family` в SVG (не пустой) | Оставляем как есть. **Arial из Corel не перезаписывается** именем слоя |
| 2 | Имя слоя `text_<шрифт>` при **пустом** family | Точный матч с `family_name` / aliases библиотеки CRM (или файл из ZIP `fonts/`) |
| 3 | Иначе | **Arial** по умолчанию |

Примеры:

- SVG `font-family:'Voguella'` → в редакторе Voguella (нужен файл в библиотеке).
- SVG `font-family:'Arial'`, слой `text_voguella` → остаётся **Arial** (Corel-заглушка важнее имени).
- SVG без family, слой `text_voguella` → Voguella из библиотеки.
- SVG без family, слой `text_1` → Arial.

Сопоставление по имени слоя — **точное** (compact key), без substring: `text_time` не матчит Happy Time.

## Шрифты в ZIP-импорте

При импорте ZIP со страницами SVG можно приложить папку `fonts/`:

```
template.zip
  page-1.svg
  fonts/HappyTime.woff2
  fonts/CeremoniousOne.woff2
```

Имена файлов сопоставляются с family по эвристике (`HappyTime.woff2` → `Happy Time`).

В `fabricJSON` в первую очередь попадает **`font-family` из SVG**. Папка `fonts/` и библиотека CRM:

- подключают файлы для превью/PDF;
- при **пустом** family могут подставить шрифт по имени слоя `text_*` (см. контракт выше).

Приоритет файлов: **глобальная библиотека** → **bundled из ZIP**.

## Importer v7+

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

CRM при генерации `production_pdf` подставляет `@font-face` из библиотеки и bundled-шрифтов шаблона (Puppeteer + `document.fonts.ready`). Для `client_png` шрифты уже растрированы на сайте.

## Лицензии

Ответственность за право использования шрифта — у загружающего в CRM.
