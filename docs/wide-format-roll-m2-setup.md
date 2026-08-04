# ШФП рулон: настройка расчёта по m²

Документ для запуска рулонной широкоформатной печати с нативной ценой за м² и ступенями по `total_m2`.

## Что включено

- Профили m² в `print_prices` через поле `m2_pricing_kind`:
  - `uv_flatbed` — УФ-планшет;
  - `roll_wide` — ШФП рулон.
- Отдельные ступени для рулона в `print_price_roll_m2_tiers` (ось `total_m2`).
- Ограничение `supports_bw`: для color-only технологий запрещены ч/б ставки и ч/б режим.
- В шаблоне simplified поддержан режим `roll_m2.mode = "roll_wide_m2"`.

## Feature flag

- Флаг: `FEATURE_ROLL_WIDE_M2`
- Значения:
  - `true` / `1` / `on` — профиль доступен;
  - `false` / `0` / `off` — профиль заблокирован (API вернёт 403).
- По умолчанию: `true`.

## Настройка в CRM

1. Выполнить миграции backend.
2. В `Типы печати`:
   - для рулонной технологии выбрать `pricing_mode = per_m2`;
   - для color-only поставить `supports_bw = Нет`.
3. В `Цены печати` создать/обновить запись:
   - `counter_unit = m2`;
   - `m2_pricing_kind = roll_wide`;
   - заполнить `price_color_per_m2`, `min_charge`;
   - заполнить ступени `roll_m2_tiers` по `total_m2`.
4. В `Шаблон продукта → Упрощённый калькулятор → Печать`:
   - выбрать режим `ШФП рулон (roll_wide_m2)`;
   - выбрать `Технология печати` (per_m2 технология);
   - при этом листовые `print_prices` для размера не используются.

## Контракт калькулятора

- Сайт продолжает использовать:
  - `GET /api/calculator/config/by-product/[productId]`
  - `POST /api/calculator/calculate`
- На стороне CRM расчёт идёт через `SimplifiedPricingService` и `UnifiedPricingService`.
- Для `roll_wide_m2` печать считается по формуле:

```text
total_m2 = (trim_width_mm * trim_height_mm / 1_000_000) * quantity
print_price = max(rate_per_m2(total_m2) * total_m2, min_charge)
```

## Smoke-check после включения

1. **Roll m²**
   - `derive` для технологии возвращает `m2_pricing_kind=roll_wide` и qty-диапазоны, сконвертированные из `total_m2`.
   - Расчёт заказа использует `priceUnit=per_m2`.
2. **UV m²**
   - `uv_flatbed` ветка работает как раньше: слои color/white/varnish, `derive-m2` корректен.
3. **Legacy meters**
   - Технологии с `counter_unit=meters` считают цену как раньше (без регрессии по старым продуктам).

## Поэтапный rollout

1. Включить флаг на staging, настроить 1-2 технологии `roll_wide`.
2. Прогнать smoke-check (roll/uv/meters) и сравнить итоги с ручным расчётом.
3. В проде включить флаг, мигрировать технологии партиями.
4. Для каждой партии оставить fallback: старая запись `counter_unit=meters` до завершения проверки.
