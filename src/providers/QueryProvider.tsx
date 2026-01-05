import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Создаем QueryClient с настройками
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Время, после которого данные считаются устаревшими
      staleTime: 5 * 60 * 1000, // 5 минут
      // Время кэширования данных
      gcTime: 10 * 60 * 1000, // 10 минут (ранее cacheTime)
      // Повторные запросы при ошибках
      retry: (failureCount, error: any) => {
        // Не повторяем запросы для 4xx ошибок (кроме 408)
        if (error?.response?.status >= 400 && error?.response?.status < 500 && error?.response?.status !== 408) {
          return false;
        }
        // Повторяем до 3 раз для остальных ошибок
        return failureCount < 3;
      },
      // Интервал между повторными запросами
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Не выполнять запросы в фоне при потере фокуса
      refetchOnWindowFocus: false,
      // Не выполнять запросы при восстановлении соединения
      refetchOnReconnect: true,
    },
    mutations: {
      // Повторные попытки для мутаций
      retry: 1,
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools только в режиме разработки */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          position="bottom-right"
        />
      )}
    </QueryClientProvider>
  );
};
