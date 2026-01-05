import { getOrders, getOrderStatuses, getCurrentUser, getUsers, getLowStock } from './api';
import { clearCache } from '../hooks/useOptimizedData';

export class OptimizedApiClient {
  // Кэшированные методы для заказов
  async getOrders(filters?: {
    userId?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: number;
  }) {
    return getOrders();
  }

  async getOrderStatuses() {
    return getOrderStatuses();
  }

  async getCurrentUser() {
    return getCurrentUser();
  }

  async getUsers() {
    return getUsers();
  }

  async getLowStock() {
    return getLowStock();
  }

  // Методы для работы с кэшем
  async invalidateOrdersCache() {
    clearCache('orders');
  }

  async invalidateUsersCache() {
    clearCache('users');
  }

  async invalidateMaterialsCache() {
    clearCache('materials');
  }

  async invalidateAllCache() {
    clearCache();
  }

  // Методы для получения статистики
  async getOrdersStats(dateFrom: string, dateTo: string) {
    const orders = await this.getOrders();
    const filteredOrders = orders.data.filter((order: any) => {
      const orderDate = new Date(order.created_at).toISOString().slice(0, 10);
      return orderDate >= dateFrom && orderDate <= dateTo;
    });

    return {
      data: {
        totalOrders: filteredOrders.length,
        totalRevenue: filteredOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0),
        averageOrderValue: filteredOrders.length > 0 
          ? filteredOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0) / filteredOrders.length 
          : 0
      }
    };
  }
}

export const optimizedApiClient = new OptimizedApiClient();

