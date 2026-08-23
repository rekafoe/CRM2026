# Департаменты / точки

Департаменты — орг. единицы и **физические точки** (самовывоз, касса, склад).

## Поля точки

| Поле | Назначение |
|------|------------|
| `name` | Отображаемое имя |
| `code` | Стабильный id (= `pickupId` филиала на сайте: `pickup-dzerzhinskogo-3b`, `pickup-dzerzhinskogo-104`) |
| `address` | Адрес точки |
| `is_pickup_point` | Точка самовывоза |
| `is_active` | Активна |
| `sort_order`, `description` | Как раньше |

## Заказы

- `orders.fulfillment_department_id` — точка исполнения.
- Самовывоз с сайта (`delivery.kind=pickup`, `providerId=code`) проставляет fulfillment автоматически.
- Фильтр пула / поиска: `?department_id=` — заказы с этой точкой (или без точки, но создатель из департамента).

## Отчёты

- Выручка и касса: scope по `fulfillment_department_id`.
- `GET /api/reports/analytics/revenue/by-location`
- `GET /api/reports/analytics/pnl` — точка / общие расходы / итог.
- Расходы: `GET/POST /api/expenses` (admin), `department_id=null` = общие расходы компании.

## Склад (multi)

- `warehouses` привязаны к `department_id`.
- `material_stock (material_id, warehouse_id, quantity)` — остатки по складу; `materials.quantity` синхронизируется как сумма.
- `printers.department_id` — оборудование точки.

## API departments

- `GET/POST /api/departments`, `PUT/DELETE /api/departments/:id` (мутации — admin).
- Тело может включать `code`, `address`, `is_pickup_point`, `is_active`.

## Сайт

Новая точка самовывоза = запись в CRM (`departments.code`) + филиал в `lib/site/branches.ts` на сайте.
Канонические коды: `pickup-dzerzhinskogo-3b` (бывший `pickup-gikalo`) и `pickup-dzerzhinskogo-104`.
