# Общие компоненты CRM системы

Переиспользуемые компоненты для всего приложения.

## 📦 Компоненты

### LoadingState
Универсальный компонент для отображения состояния загрузки.

```tsx
import { LoadingState } from '../components/common';

<LoadingState message="Загрузка данных..." size="medium" />
<LoadingState message="Подождите..." size="large" fullScreen />
```

**Props:**
- `message?`: string - сообщение для пользователя
- `size?`: 'small' | 'medium' | 'large' - размер спиннера
- `fullScreen?`: boolean - на весь экран

---

### ErrorState
Универсальный компонент для отображения ошибок.

```tsx
import { ErrorState } from '../components/common';

<ErrorState 
  title="Ошибка загрузки"
  message="Не удалось загрузить данные"
  onRetry={() => refetch()}
/>
```

**Props:**
- `title?`: string - заголовок ошибки
- `message`: string - сообщение об ошибке
- `onRetry?`: () => void - callback для повторной попытки
- `fullScreen?`: boolean - на весь экран

---

### EmptyState
Компонент для пустых состояний (нет данных).

```tsx
import { EmptyState } from '../components/common';

<EmptyState 
  icon="📭"
  title="Материалов не найдено"
  description="Добавьте новые материалы или измените фильтры"
  action={{
    label: "Добавить материал",
    onClick: () => openAddModal()
  }}
/>
```

**Props:**
- `icon?`: string - emoji иконка
- `title`: string - заголовок
- `description?`: string - описание
- `action?`: { label: string, onClick: () => void } - кнопка действия

---

### ImprovedToast
Улучшенные уведомления с поддержкой действий.

```tsx
import { ImprovedToast, ToastContainer } from '../components/common';

<ImprovedToast
  message="Материал успешно добавлен"
  type="success"
  duration={5000}
  action={{
    label: "Отменить",
    onClick: () => undo()
  }}
  onClose={() => removeToast(id)}
/>
```

**Props:**
- `message`: string - текст уведомления
- `type?`: 'success' | 'error' | 'warning' | 'info' - тип
- `duration?`: number - длительность показа (мс)
- `action?`: { label: string, onClick: () => void } - действие
- `onClose`: () => void - callback при закрытии

---

## 🛠️ Утилиты

### formatters.ts
Утилиты для форматирования данных.

```tsx
import { formatCurrency, formatDate, formatPhone } from '../utils/formatters';

formatCurrency(123.45); // "123,45 BYN"
formatDate(new Date()); // "27.09.2025"
formatPhone("+375291234567"); // "+375 (29) 123-45-67"
```

**Функции:**
- `formatCurrency(amount, currency?)` - форматирование валюты
- `formatNumber(num, decimals?)` - форматирование чисел
- `formatDate(date, format?)` - форматирование дат
- `formatRelativeTime(date)` - относительное время ("5 мин назад")
- `formatFileSize(bytes)` - размер файла ("1.5 MB")
- `formatPhone(phone)` - форматирование телефона
- `truncateText(text, maxLength?)` - усечение текста
- `capitalize(text)` - первая буква заглавная

---

## 🎯 Хуки

### useDebounce
Задержка обновления значения для оптимизации поиска.

```tsx
import { useDebounce } from '../hooks/useDebounce';

const [searchQuery, setSearchQuery] = useState('');
const debouncedQuery = useDebounce(searchQuery, 500);

// debouncedQuery обновится через 500мс после последнего изменения
```

---

### useHotkeys
Горячие клавиши для быстрого доступа.

```tsx
import { useHotkeys, CRM_HOTKEYS } from '../hooks/useHotkeys';

useHotkeys([
  { ...CRM_HOTKEYS.NEW_ORDER, callback: () => createNewOrder() },
  { ...CRM_HOTKEYS.OPEN_CALCULATOR, callback: () => openCalculator() },
  { key: 's', ctrl: true, callback: () => save() }
]);
```

**Предустановленные:**
- `Ctrl+N` - Создать новый заказ
- `Ctrl+K` - Открыть калькулятор
- `Ctrl+F` - Поиск
- `Ctrl+M` - Материалы
- `Ctrl+S` - Сохранить
- `Ctrl+R` - Обновить данные
- `Escape` - Отмена/Закрыть

---

## 📚 Примеры использования

### Полный пример компонента со всеми состояниями

```tsx
import { LoadingState, ErrorState, EmptyState } from '../components/common';
import { useDebounce } from '../hooks/useDebounce';

function MaterialsList() {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const { data, isLoading, error, refetch } = useMaterials({ search: debouncedQuery });

  if (isLoading) {
    return <LoadingState message="Загрузка материалов..." />;
  }

  if (error) {
    return (
      <ErrorState 
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  if (data?.length === 0) {
    return (
      <EmptyState
        title="Материалов не найдено"
        description="Добавьте новые материалы"
        action={{
          label: "Добавить",
          onClick: () => openAddModal()
        }}
      />
    );
  }

  return (
    <div>
      {/* Отображение материалов */}
    </div>
  );
}
```
