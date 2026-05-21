# ADR: группировка одинаковых открыток в одной позиции заказа

## Статус

Принято (реализация в CRM + контракт для сайта).

## Контекст

Клиент может оформить 10 разных макетов открыток с **одинаковыми** параметрами печати (формат, бумага). Печать физически — раскладка на SRA3 (2 листа), а не 10 отдельных прогонов. Цена должна соответствовать `quantity=10`, а не 10 строкам заказа.

## Решение

**Одна позиция заказа** с `quantity` (например 10) и группой макетов в `params`:

```json
{
  "editorLayoutGroup": {
    "groupKey": "10x15-matte",
    "slots": [
      { "editorDraftToken": "draft_a", "label": "Открытка 1" },
      { "editorDraftToken": "draft_b", "label": "Открытка 2" }
    ]
  },
  "quantity": 10
}
```

### CRM при `from-website`

1. Для каждого `slot` загрузить draft, проверить `status=draft`.
2. Собрать **сводный** `designState`:
   - `pages[]` = конкатенация страниц всех слотов (порядок = порядок slots).
   - `pageCount` = длина массива.
3. Записать в `params`: `designState`, `editorLayoutGroup`, `editorDraftMode`, `designTemplateId` (из первого слота).
4. `attachEditorDraftsToOrderItems`: привязать файлы **всех** draft к **одной** `orderItemId`, все draft → `finalized`.

### Production PDF

Один multipage PDF: каждая страница = одна открытка (страница слота). `quantity` влияет на печать/imposition, не на число страниц PDF.

### Imposition (фаза 6)

Отдельный job `imposition_sra3` читает готовые `production_pdf` и параметры группы; раскладка — отдельный `artifactType=imposition_pdf`.

## Альтернативы (отклонены)

| Вариант | Почему нет |
|---------|------------|
| 10 позиций × 1 token | Неверная цена и учёт материалов |
| 1 сборный draft на сайте | Дублирование merge-логики вне CRM |
| Только `quantity` без slots | Нельзя хранить 10 разных макетов |

## Ответственность сайта

- Группировать в корзине перед checkout.
- Передавать `editorLayoutGroup` + итоговую цену/`priceType`.
- CRM не пересчитывает цену (сайт — источник истины на checkout).
