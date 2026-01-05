import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ENDPOINTS } from '../endpoints';
import { api } from '../../api';

// Типы для уведомлений
export interface StockAlert {
  id: number;
  materialId: number;
  materialName: string;
  currentQuantity: number;
  minQuantity: number;
  alertLevel: 'warning' | 'critical' | 'out_of_stock';
  createdAt: string;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: number;
  resolvedByName?: string;
  supplierName?: string;
  supplierContact?: string;
  categoryName?: string;
}

export interface AutoOrder {
  id: number;
  supplierId: number;
  supplierName: string;
  supplierContact?: string;
  totalAmount: number;
  status: 'pending' | 'approved' | 'sent' | 'delivered' | 'cancelled';
  createdAt: string;
  materials: AutoOrderMaterial[];
  notes?: string;
}

export interface AutoOrderMaterial {
  id: number;
  materialId: number;
  materialName: string;
  currentStock: number;
  minStock: number;
  orderQuantity: number;
  unit: string;
  price: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'manager' | 'user';
  telegramChatId?: string;
  notificationsEnabled: boolean;
  notificationPreferences: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
}

export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
}

export interface StockMonitoringConfig {
  enabled: boolean;
  checkInterval: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface AutoOrderConfig {
  enabled: boolean;
  minOrderValue: number;
  maxOrderValue: number;
  approvalRequired: boolean;
  autoSend: boolean;
}

// Хуки для уведомлений о запасах
export const useStockAlerts = () => {
  return useQuery({
    queryKey: ['stock-alerts'],
    queryFn: async (): Promise<StockAlert[]> => {
      const response = await api.get(ENDPOINTS.NOTIFICATIONS.STOCK_ALERTS);
      // API возвращает { success: true, data: [...] }
      return response.data?.data || [];
    }
  });
};

export const useCheckStockLevels = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await api.post(ENDPOINTS.NOTIFICATIONS.CHECK_STOCK);
      return response.data || [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    }
  });
};

export const useResolveStockAlert = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (alertId: number) => {
      const response = await api.post(`${ENDPOINTS.NOTIFICATIONS.STOCK_ALERTS}/${alertId}/resolve`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    }
  });
};

// Хуки для автоматических заказов
export const useAutoOrders = (status?: string) => {
  return useQuery({
    queryKey: ['auto-orders', status],
    queryFn: async (): Promise<AutoOrder[]> => {
      const url = status ? `${ENDPOINTS.NOTIFICATIONS.AUTO_ORDERS}?status=${status}` : ENDPOINTS.NOTIFICATIONS.AUTO_ORDERS;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки автоматических заказов');
      }
      
      const data = await response.json();
      return data.data || [];
    }
  });
};

export const useCreateAutoOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderData: Partial<AutoOrder>) => {
      const response = await fetch(ENDPOINTS.NOTIFICATIONS.AUTO_ORDERS, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      });
      
      if (!response.ok) {
        throw new Error('Ошибка создания автоматического заказа');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
    }
  });
};

export const useApproveAutoOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`${ENDPOINTS.NOTIFICATIONS.AUTO_ORDERS}/${orderId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка подтверждения заказа');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
    }
  });
};

export const useSendAutoOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`${ENDPOINTS.NOTIFICATIONS.AUTO_ORDERS}/${orderId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка отправки заказа');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
    }
  });
};

// Хуки для пользователей
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<User[]> => {
      const response = await api.get(ENDPOINTS.USERS.LIST);
      return response.data || [];
    }
  });
};

export const useUsersByRole = (role: string) => {
  return useQuery({
    queryKey: ['users', 'role', role],
    queryFn: async (): Promise<User[]> => {
      const response = await api.get(`${ENDPOINTS.USERS.LIST}/role/${role}`);
      return response.data || [];
    }
  });
};

export const useSendToUser = () => {
  return useMutation({
    mutationFn: async ({ userId, message }: { userId: number; message: string }) => {
      const response = await fetch(`${ENDPOINTS.NOTIFICATIONS.USERS}/${userId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка отправки уведомления пользователю');
      }
      
      return response.json();
    }
  });
};

export const useSendToRole = () => {
  return useMutation({
    mutationFn: async ({ role, message }: { role: string; message: string }) => {
      const response = await fetch(`${ENDPOINTS.NOTIFICATIONS.USERS}/role/${role}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка отправки уведомления роли');
      }
      
      return response.json();
    }
  });
};

export const useSendToAllUsers = () => {
  return useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch(`${ENDPOINTS.NOTIFICATIONS.USERS}/send-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка отправки уведомления всем пользователям');
      }
      
      return response.json();
    }
  });
};

// Хуки для Telegram
export const useTelegramConfig = () => {
  return useQuery({
    queryKey: ['telegram-config'],
    queryFn: async (): Promise<TelegramConfig> => {
      const response = await api.get(ENDPOINTS.NOTIFICATIONS.TELEGRAM_CONFIG);
      return response.data.data || { enabled: false };
    }
  });
};

export const useConfigureTelegram = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: TelegramConfig) => {
      const response = await api.post(ENDPOINTS.NOTIFICATIONS.TELEGRAM_CONFIGURE, config);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
    }
  });
};

export const useTestTelegram = () => {
  return useMutation({
    mutationFn: async (message?: string) => {
      const response = await api.post(ENDPOINTS.NOTIFICATIONS.TELEGRAM_TEST, { 
        message: message || 'Тестовое сообщение из CRM системы' 
      });
      return response.data;
    }
  });
};

// Хуки для конфигурации
export const useStockMonitoringConfig = () => {
  return useQuery({
    queryKey: ['stock-monitoring-config'],
    queryFn: async (): Promise<StockMonitoringConfig> => {
      const response = await fetch(ENDPOINTS.NOTIFICATIONS.STOCK_MONITORING_CONFIG, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки конфигурации мониторинга');
      }
      
      const data = await response.json();
      return data.data || { enabled: true, checkInterval: 3600, warningThreshold: 0.2, criticalThreshold: 0.1 };
    }
  });
};

export const useUpdateStockMonitoringConfig = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: StockMonitoringConfig) => {
      const response = await fetch(ENDPOINTS.NOTIFICATIONS.STOCK_MONITORING_CONFIG, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error('Ошибка обновления конфигурации мониторинга');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-monitoring-config'] });
    }
  });
};

export const useAutoOrderConfig = () => {
  return useQuery({
    queryKey: ['auto-order-config'],
    queryFn: async (): Promise<AutoOrderConfig> => {
      const response = await fetch(ENDPOINTS.NOTIFICATIONS.AUTO_ORDER_CONFIG, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки конфигурации автозаказов');
      }
      
      const data = await response.json();
      return data.data || { enabled: true, minOrderValue: 100, maxOrderValue: 5000, approvalRequired: false, autoSend: false };
    }
  });
};

export const useUpdateAutoOrderConfig = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: AutoOrderConfig) => {
      const response = await fetch(ENDPOINTS.NOTIFICATIONS.AUTO_ORDER_CONFIG, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error('Ошибка обновления конфигурации автозаказов');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-order-config'] });
    }
  });
};
