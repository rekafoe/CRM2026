# Динамическая раскладка: лист материала и дозаливка (simplified)

## Зафиксированные решения

1. **Канал расчёта:** только `SimplifiedPricingService` / `POST /api/pricing/calculate`.
2. **Геометрия укладки:** на печатный лист материала (`materials.sheet_width` × `sheet_height`) кладётся ячейка **trim + 2×bleed** по каждой оси (симметричная дозаливка). Без `bleed_mm` в запросе используется цепочка: `configuration.bleed_mm` → `simplified.default_bleed_mm` → `simplified.prepress.bleedMm` → `0`.
3. **Лист:** при валидных размерах листа у выбранного материала раскладка считается только по ним. Если у материала нет `sheet_width`/`sheet_height`: при `allow_optimal_sheet_fallback !== false` — поведение как раньше (`findOptimalSheetSize`); при `allow_optimal_sheet_fallback === false` — ошибка 400.
4. **Произвольный trim:** при `simplified.allow_custom_trim === true` клиент передаёт `trim_size` и якорь тарифов: `pricing_size_id` или `size_id` (или `simplified.custom_trim_pricing_size_id` в шаблоне). Строка размера для тарифов берётся по якорю; для раскладки — фактический `trim_size`. В ответе API в `productSize` (unified) отдаётся фактический trim.
5. **Многостраничные продукты:** логика `sheetsPerItem` / тираж не менялась; на одну печатную поверхность применяется та же раскладка (trim + bleed на листе материала), что и для листовой продукции.

6. **Ответ `POST /api/pricing/calculate` (unified):** в `layout` включается `bleedMm` — фактическая дозаливка после цепочки из п. 2; дублируется полем `layoutBleedMm` на верхнем уровне ответа. На верхнем уровне также заполняются `itemsPerSheet` и `cutsPerSheet`, если раскладка включена.

## Поля шаблона `simplified`

| Поле | Назначение |
|------|------------|
| `allow_custom_trim` | Разрешить произвольный `trim_size` с ценообразованием по якорю |
| `custom_trim_pricing_size_id` | Якорь по умолчанию, если клиент не передал `pricing_size_id` / `size_id` |
| `default_bleed_mm` | Дефолт дозаливки для расчёта (опционально; иначе `prepress.bleedMm`) |
| `allow_optimal_sheet_fallback` | `false` — без размеров листа у материала не подбирать SRA3/A3/A4 |

## Поля `configuration` (calculate)

| Поле | Назначение |
|------|------------|
| `trim_size` | Обрезной формат (мм) |
| `bleed_mm` | Дозаливка с каждой стороны (мм) |
| `pricing_size_id` | ID строки размера в шаблоне для тарифов при `allow_custom_trim` |

См. также [api-calculate-request-example.md](./api-calculate-request-example.md).

**УФ-планшет:** при `uv_print.mode === 'flatbed_m2'` раскладка на лист не используется (`use_layout: false`); площадь считается по `trim_size`. См. [uv-flatbed-pricing.md](./uv-flatbed-pricing.md).
