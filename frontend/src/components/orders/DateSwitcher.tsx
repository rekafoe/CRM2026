import React, { useState, useMemo } from 'react';

const DAYS_PER_PAGE = 14;

interface DateSwitcherProps {
  currentDate: string;
  onDateChange: (newDate: string) => void;
  onClose: () => void;
  userDates: Array<{ date: string; orderCount: number }>;
}

export const DateSwitcher: React.FC<DateSwitcherProps> = ({ 
  currentDate, 
  onDateChange, 
  onClose,
  userDates
}) => {
  const [currentPage, setCurrentPage] = useState(0);

  // Сортируем даты пользователя по убыванию (новые сначала)
  const sortedUserDates = useMemo(
    () => [...userDates].sort((a, b) => b.date.localeCompare(a.date)),
    [userDates]
  );

  const totalPages = Math.max(1, Math.ceil(sortedUserDates.length / DAYS_PER_PAGE));
  const paginatedDates = useMemo(() => {
    const start = currentPage * DAYS_PER_PAGE;
    return sortedUserDates.slice(start, start + DAYS_PER_PAGE);
  }, [sortedUserDates, currentPage]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateString === today.toISOString().split('T')[0]) {
      return 'Сегодня';
    } else if (dateString === yesterday.toISOString().split('T')[0]) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
      });
    }
  };

  const handleDateSelect = (date: string) => {
    onDateChange(date);
    onClose();
  };

  return (
    <div className="date-switcher">
      <h3 className="date-switcher-title">📅 Выберите дату</h3>

      <div className="date-switcher-grid">
        {sortedUserDates.length > 0 ? (
          paginatedDates.map(({ date, orderCount }) => (
            <button
              key={date}
              onClick={() => handleDateSelect(date)}
              className={`date-switcher-option ${
                date === currentDate
                  ? 'date-switcher-option--active'
                  : 'date-switcher-option--inactive'
              }`}
            >
              <div className="date-switcher-option__title">{formatDate(date)}</div>
              <div className="date-switcher-option__meta">
                {date} • {orderCount} заказ{orderCount === 1 ? '' : orderCount < 5 ? 'а' : 'ов'}
              </div>
            </button>
          ))
        ) : (
          <div className="date-switcher-empty">
            <div className="date-switcher-empty__title">📅 Нет данных о работе</div>
            <div className="date-switcher-empty__subtitle">Вы еще не создавали заказы</div>
          </div>
        )}
      </div>

      {sortedUserDates.length > DAYS_PER_PAGE && (
        <div className="date-switcher-pagination">
          <button
            type="button"
            className="date-switcher-pagination__btn"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            aria-label="Предыдущая страница"
          >
            ← Назад
          </button>
          <span className="date-switcher-pagination__info">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="date-switcher-pagination__btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            aria-label="Следующая страница"
          >
            Вперёд →
          </button>
        </div>
      )}

      <div className="date-switcher-footer">
        <button
          onClick={onClose}
          className="date-switcher-cancel"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
