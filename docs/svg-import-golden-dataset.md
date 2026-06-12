# Golden Dataset для SVG импорта

## Назначение

Этот набор фиксирует эталонные Corel/Illustrator SVG-кейсы для контроля визуальной точности импортера.

Цель: при изменениях парсера проверять, что после `parseImportedSvgLayers` и сборки сцены контент не теряется, а визуальные отклонения остаются в пределах порога.

## Где лежат фикстуры

- `backend/__tests__/fixtures/svg-golden/corel-cover-basic.svg`
- `backend/__tests__/fixtures/svg-golden/illustrator-mixed-text.svg`
- `backend/__tests__/fixtures/svg-golden/corel-rotated-right-align.svg`

## Что покрывает набор

- базовая обложка с `photo_*` и `text_*`;
- смешанные шрифты в одном текстовом блоке (`tspan` + `textStyleRuns`);
- повороты текста и right/center alignment;
- `preserveAspectRatio` с не-default выравниванием.

## Автотесты

- `backend/__tests__/designTemplateSvgParse.test.ts` — структурные инварианты парсинга.
- `backend/__tests__/designTemplateSvgVisualRegression.test.ts` — визуальный regression (pixel mismatch threshold).
- `backend/__tests__/profileSvgImporter.test.ts` — smoke-check профайлера и формата отчёта.

## Профилирование

- Базовый запуск: `cd backend && npm run profile:svg-import`
- Параметры:
  - `--dir <path>` — каталог с SVG;
  - `--pattern <regex>` — фильтр файлов (по умолчанию `\\.svg$`);
  - `--top <N>` — сколько самых медленных файлов выводить.
- В отчёте: `p50`, `p95`, `max`, а также top-N тяжёлых файлов и стадийные тайминги (`scan`, `text`, `total`).

## Правила обновления

1. Добавлять только реальные кейсы Corel/Illustrator, которые уже ломали импорт или критичны для production.
2. При добавлении фикстуры обязательно добавить ожидаемые инварианты в тест.
3. Если меняется порог визуального diff, фиксировать причину в PR.
