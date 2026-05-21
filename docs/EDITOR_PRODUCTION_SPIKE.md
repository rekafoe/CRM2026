# Spike: рендер designState → production PDF

## Критерии

- Размер страницы в мм (trim + bleed).
- Визуальное совпадение с клиентским редактором (фото-поля, текст, фон).
- Приемлемое время на позицию (цель &lt; 30 с для 20 стр. на Railway).

## Варианты

| Вариант | Плюсы | Минусы |
|---------|-------|--------|
| Headless Chromium + HTML из Fabric JSON | Близко к браузеру, уже есть `puppeteer` | RGB PDF, тяжёлый runtime |
| Расширение jsPDF в CRM frontend | Уже есть в `EditorItemPreviewModal` | Нет на сервере без headless |
| node-canvas + ручной layout | Быстро | Расхождение с Fabric |

## Выбор (MVP)

**Puppeteer + HTML-сборка** ([`editorProductionRenderService.ts`](../backend/src/services/editorProductionRenderService.ts)):

- Обход `fabricJSON` на backend: изображения, текст, фон.
- Страница = HTML с размерами mm + bleed.
- `page.pdf({ width, height, printBackground: true })`.
- Слияние страниц через `pdf-lib`.

CMYK: PDF остаётся RGB на этапе CRM; конвертация CMYK — на стороне RIP/типографии или отдельный шаг (Ghostscript), если потребуется позже.

## Эталон для регрессии

- Шаблон открытка 90×50, bleed 2 mm, 1 фото + текст.
- Сравнение PNG-страницы CRM export vs preview в Order Pool.
