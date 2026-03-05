# Плейсхолдеры шаблона товарного чека

Шаблон товарного чека хранится в БД (`receipt_templates`) для каждой организации. Используйте плейсхолдеры в формате `{{имя}}`.

## Доступные плейсхолдеры

| Плейсхолдер | Описание |
|-------------|----------|
| `{{companyName}}` | Название организации |
| `{{unp}}` | УНП |
| `{{legalAddress}}` | Юридический адрес |
| `{{phone}}` | Телефон |
| `{{receiptNumber}}` | Номер чека (или ______ для бланка) |
| `{{orderNumber}}` | Номер заказа |
| `{{orderDate}}` | Дата заказа (например: 28 февраля 2026 г.) |
| `{{itemsTable}}` | HTML-таблица позиций (или пустые строки для бланка) |
| `{{totalStr}}` | Итоговая сумма (или пусто для бланка) |
| `{{summaryLine}}` | Строка «Всего наименований N, на сумму X бел. руб. (сумма прописью)» |
| `{{manager}}` | Менеджер (или «Менеджер: ________________» для бланка) |

## Пример минимального шаблона

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Товарный чек {{receiptNumber}}</title>
  <style>
    body { font-family: Arial; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #333; padding: 4px; }
  </style>
</head>
<body>
  <div>Товарный чек № {{receiptNumber}} к заказу № {{orderNumber}} от {{orderDate}}</div>
  <div>Организация {{companyName}}</div>
  <div>УНП {{unp}}</div>
  <table>
    <thead><tr><th>№</th><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
    <tbody>{{itemsTable}}</tbody>
  </table>
  <div>Итого: {{totalStr}}</div>
  <div>{{summaryLine}}</div>
  <div>{{manager}}</div>
</body>
</html>
```

## Выбор организации для чека

- **По заказу**: если у заказа задан `organization_id`, используется эта организация.
- **По умолчанию**: иначе — организация с `is_default = 1`.
- **Бланк**: при генерации бланка можно передать `?organization_id=1` в URL.

## Где редактировать

Админ-панель → **Организации и чеки** → для каждой организации кнопка «Шаблон чека».
