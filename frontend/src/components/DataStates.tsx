import React from 'react';
import { LoadingState, CardSkeleton, ListSkeleton, TableSkeleton, EmptyState } from './LoadingStates';
import { ErrorDisplay, CompactError, CriticalError } from './ErrorStates';

// Пропсы для компонента состояний данных
interface DataStatesProps {
  // Состояние загрузки
  loading: boolean;
  loadingText?: string;
  
  // Ошибка
  error: any;
  errorTitle?: string;
  onRetry?: () => void;
  onDismissError?: () => void;
  
  // Данные
  data: any[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  
  // Дети (контент)
  children: React.ReactNode;
  
  // Настройки скелетона
  skeletonType?: 'card' | 'list' | 'table';
  skeletonCount?: number;
  
  // Стили
  className?: string;
  errorClassName?: string;
  emptyClassName?: string;
}

// Основной компонент для состояний данных
export const DataStates: React.FC<DataStatesProps> = ({
  loading,
  loadingText = 'Загрузка данных...',
  error,
  errorTitle,
  onRetry,
  onDismissError,
  data,
  emptyTitle = 'Нет данных',
  emptyDescription = 'Данные не найдены',
  emptyAction,
  children,
  skeletonType = 'card',
  skeletonCount = 3,
  className = '',
  errorClassName = '',
  emptyClassName = ''
}) => {
  // Показываем скелетон во время загрузки
  if (loading) {
    return (
      <div className={className}>
        {skeletonType === 'card' && (
          <CardSkeleton count={skeletonCount} />
        )}
        {skeletonType === 'list' && (
          <ListSkeleton count={skeletonCount} />
        )}
        {skeletonType === 'table' && (
          <TableSkeleton rows={skeletonCount} />
        )}
      </div>
    );
  }

  // Показываем ошибку
  if (error) {
    return (
      <div className={`${className} ${errorClassName}`}>
        <ErrorDisplay
          error={error}
          onRetry={onRetry}
          onDismiss={onDismissError}
          showDetails={true}
        />
      </div>
    );
  }

  // Показываем пустое состояние
  if (!data || data.length === 0) {
    return (
      <div className={`${className} ${emptyClassName}`}>
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  // Показываем данные
  return <div className={className}>{children}</div>;
};

// Компонент для списков с состояниями
export const ListWithStates: React.FC<{
  items: any[];
  loading: boolean;
  error: any;
  onRetry?: () => void;
  renderItem: (item: any, index: number) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}> = ({
  items,
  loading,
  error,
  onRetry,
  renderItem,
  emptyTitle = 'Список пуст',
  emptyDescription = 'Добавьте элементы в список',
  emptyAction,
  className = ''
}) => {
  return (
    <DataStates
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={items}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      skeletonType="list"
      className={className}
    >
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id || index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </DataStates>
  );
};

// Компонент для карточек с состояниями
export const CardsWithStates: React.FC<{
  items: any[];
  loading: boolean;
  error: any;
  onRetry?: () => void;
  renderCard: (item: any, index: number) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  gridClassName?: string;
}> = ({
  items,
  loading,
  error,
  onRetry,
  renderCard,
  emptyTitle = 'Карточки не найдены',
  emptyDescription = 'Создайте первую карточку',
  emptyAction,
  className = '',
  gridClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
}) => {
  return (
    <DataStates
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={items}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      skeletonType="card"
      className={className}
    >
      <div className={gridClassName}>
        {items.map((item, index) => (
          <div key={item.id || index}>
            {renderCard(item, index)}
          </div>
        ))}
      </div>
    </DataStates>
  );
};

// Компонент для таблиц с состояниями
export const TableWithStates: React.FC<{
  data: any[];
  loading: boolean;
  error: any;
  onRetry?: () => void;
  columns: Array<{
    key: string;
    title: string;
    render?: (value: any, item: any) => React.ReactNode;
  }>;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  tableClassName?: string;
}> = ({
  data,
  loading,
  error,
  onRetry,
  columns,
  emptyTitle = 'Таблица пуста',
  emptyDescription = 'Добавьте данные в таблицу',
  emptyAction,
  className = '',
  tableClassName = 'min-w-full divide-y divide-gray-200'
}) => {
  return (
    <DataStates
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      skeletonType="table"
      className={className}
    >
      <div className="overflow-x-auto">
        <table className={tableClassName}>
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr key={item.id || index}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  >
                    {column.render
                      ? column.render(item[column.key], item)
                      : item[column.key]
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataStates>
  );
};

// Хук для управления состояниями данных
export const useDataStates = <T,>(initialData: T[] = []) => {
  const [data, setData] = React.useState<T[]>(initialData);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<any>(null);

  const execute = async <R,>(
    asyncFn: () => Promise<R>,
    options?: {
      onSuccess?: (result: R) => void;
      onError?: (error: any) => void;
      updateData?: (result: R) => T[];
    }
  ): Promise<R | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await asyncFn();
      
      if (options?.updateData) {
        setData(options.updateData(result));
      }
      
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      setError(err);
      options?.onError?.(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  const updateData = (newData: T[] | ((prev: T[]) => T[])) => {
    setData(newData);
  };

  return {
    data,
    loading,
    error,
    setData: updateData,
    setLoading,
    setError,
    execute,
    retry,
    clearError,
    isEmpty: data.length === 0,
    hasData: data.length > 0
  };
};


