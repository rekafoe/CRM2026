# Оптимизация модуля «Варианты услуги»

## Текущие проблемы
- **ServiceVariantsTable.tsx** ~840 строк: один файл тянет и таблицу, и материалы, и сохранение.
- Глубокая вложенность: `typeNames.map` → `level1.entries().map` → `level2.map` с дублированием кнопок и инпутов.
- Много хуков в одном компоненте: варианты, редактирование, модалка диапазонов, операции, локальные изменения.
- Два слоя состояния: «локальные изменения» + «сохранить на сервер» — сложнее отлаживать и понимать.

---

## 1. Вынести блок «Списание материалов» в отдельный компонент
**Файл:** `ServiceVariantsMaterialsSection.tsx`

- Принимает: `variants`, `groupedVariants`, `typeNames`, `materials`, `onUpdateMaterial(variantId, materialId, qtyPerItem)`.
- Вся разметка и логика по группировке типов остаются внутри. В `ServiceVariantsTable` остаётся один импорт и вызов.

**Эффект:** −60–80 строк из основного файла, проще тестировать и менять только материалы.

---

## 2. Вынести строки дерева вариантов в подкомпоненты ✅
**Файлы:** `VariantRowLevel0.tsx`, `VariantRowLevel1.tsx`, `VariantRowLevel2.tsx`.

- Реализовано: каждый компонент отвечает за один уровень строки (имя/параметры, инпуты, кнопки).
- Пропсы и колбэки описаны в `ServiceVariantsTable.types.ts` (`VariantRowLevel0Props`, `VariantRowLevel1Props`, `VariantRowLevel2Props`).

**Эффект:** основной файл сокращён; логику уровня 0/1/2 проще читать и менять по отдельности.

---

## 3. Один хук «варианты + сохранение»
**Файл:** `useVariantsTable.ts` (или расширить существующий)

- Объединить: загрузка вариантов (`useServiceVariants`) + локальные изменения (`useLocalRangeChanges`) + применение на сервер (часть текущего `saveChangesToServer`).
- На выходе: `{ variants, groupedVariants, typeNames, localChanges, operations, save, isSaving, hasUnsavedChanges }`.
- В `ServiceVariantsTable` остаётся только разметка и вызов этого хука.

**Эффект:** меньше хуков в компоненте, одна точка входа для логики «варианты и сохранение».

---

## 4. Упростить модель сохранения ✅
- **Сделано:** один объект `PendingChanges` (`rangeChanges`, `priceChanges`, `variantChanges`) и один колбэк `onSaveChanges(pending: PendingChanges)`. Хук отдаёт `pendingChanges` и `hasUnsavedChanges`; кнопка «Сохранить» вызывает `saveChanges()` → `onSaveChanges(pending)`.
- Убраны лишние `console.log` из хука и таблицы.

---

## 5. Общие вещи
- Вынести тексты подтверждений («Удалить этот вариант?» и т.д.) в константы или i18n.
- Дублирующиеся блоки кнопок (↘ ↓ ×) оформить одним компонентом `VariantRowActions` с пропами `onAddChild`, `onAddSibling`, `onDelete`, и т.д.

---

## Порядок внедрения
1. Вынести **Списание материалов** в `ServiceVariantsMaterialsSection` (низкий риск, быстрый выигрыш).
2. Ввести **VariantRowLevel0 / 1 / 2** (или один `VariantTreeRow`) и заменить ими текущий JSX.
3. Объединить логику в **useVariantsTable** и по необходимости упростить модель сохранения.

После шагов 1–2 основной файл может сократиться до ~350–450 строк и станет проще сопровождать.
