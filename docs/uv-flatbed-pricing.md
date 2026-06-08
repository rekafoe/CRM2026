# УФ-планшет: ценообразование по м²

Документ описывает расчёт УФ-печати на планшетном принтере (стол до 600×900 мм) в simplified-калькуляторе.

**Пошаговая настройка в CRM (для администратора):** [uv-flatbed-setup-guide.md](./uv-flatbed-setup-guide.md)

См. также: [pricing-architecture.md](./pricing-architecture.md), [dynamic-layout-bleed.md](./dynamic-layout-bleed.md).

## Бизнес-модель

- **Площадь** — по фактическому обрезу (`trim_size`), без оплаты целого стола.
- **Слои независимы**: цвет, белый, лак — чекбокс + число проходов (1–5).
- **Минимум** — нижняя граница стоимости печати на одну позицию заказа (`min_charge` в центре цен).

### Формула

```
piece_area_m2 = (width_mm × height_mm) / 1_000_000
total_m2 = piece_area_m2 × quantity

для каждого включённого слоя:
  rate = lookupM2Tier(layer, total_m2) ?? price_*_per_m2
  layer_cost += rate × piece_area_m2 × passes × quantity

print_price = max(Σ layer_cost, min_charge)
```

Ступени (`print_price_m2_tiers`) задаются **отдельно на каждый слой** по оси `total_m2` (суммарная площадь тиража).

## Центр цен

Одна запись в `print_prices`:

| Поле | Назначение |
|------|------------|
| `technology_code` | `uv` |
| `counter_unit` | `m2` |
| `price_color_per_m2`, `price_white_per_m2`, `price_varnish_per_m2` | Базовые ставки (fallback без ступеней) |
| `min_charge` | Минимум за позицию |
| `max_width_mm`, `max_height_mm` | Лимит стола (валидация, с учётом поворота) |

Таблица `print_price_m2_tiers`: `layer`, `min_m2`, `max_m2`, `price_per_m2`.

Настройка: **Админка → Принтеры → Цены печати → Изменить** (режим «Кв. метры (УФ-планшет)»).

Превью: `GET /api/pricing/print-prices/derive-m2?width_mm=&height_mm=&quantity=&uv_print=`.

## Шаблон продукта

В `template.simplified`:

```json
{
  "uv_print": {
    "mode": "flatbed_m2",
    "layers": ["color", "white", "varnish"],
    "default_passes": { "color": 1, "white": 1, "varnish": 1 },
    "dimensions_mode": "custom_only"
  },
  "use_layout": false,
  "include_material_cost": false,
  "sizes": [{ "id": "anchor", "label": "—", "width_mm": 100, "height_mm": 100, "print_prices": [], "allowed_material_ids": [], "material_prices": [], "finishing": [] }]
}
```

Для подтипов продукта — тот же блок в `typeConfigs[typeId].uv_print`.

`dimensions_mode`:

- `custom_only` — только W×H в калькуляторе;
- `presets_and_custom` — пресеты из `sizes` + произвольный размер.

Ставки в шаблоне **не дублируются** — только какие слои показывать и дефолты проходов.

## API расчёта

`POST /api/pricing/calculate` — в `configuration`:

```json
{
  "print_technology": "uv",
  "trim_size": { "width": 100, "height": 210 },
  "uv_print": {
    "color": { "enabled": true, "passes": 1 },
    "white": { "enabled": false, "passes": 1 },
    "varnish": { "enabled": true, "passes": 2 }
  }
}
```

Ветка УФ включается, если в шаблоне `uv_print.mode === 'flatbed_m2'`.

Ответ: строки в `operations` по слоям + `printDetails.uvPrint` в simplified-результате.

## Универсальный продукт «УФ-печать»

1. `product_type`: `universal`, `calculator_type`: `simplified`
2. `uv_print` как выше, `dimensions_mode: custom_only`
3. Технический якорь в `sizes` (не показывается клиенту при custom_only)
4. `use_layout: false`, `include_material_cost: false` (или опциональный материал)
5. В центре цен — запись `uv` с `counter_unit: m2`

## Готовый продукт (ПВХ + фольга + УФ)

Тот же `uv_print` + пресеты в `sizes` + `allowed_material_ids` (ПВХ) + `finishing` (фольга из `post_processing_services`). Центральные ставки УФ общие для всех продуктов.

## Калькулятор CRM

`ImprovedPrintingCalculatorModal` при `flatbed_m2`:

- показывает `UvPrintSection` (W×H, слои, проходы);
- скрывает `PrintingSettingsSection` (color/bw);
- сохраняет `uv_print` и `trim_size` в `params.specifications` позиции заказа.

## Тесты

`backend/src/__tests__/uvFlatbedPricing.test.ts` — unit-тесты `UvFlatbedPricingService`.
