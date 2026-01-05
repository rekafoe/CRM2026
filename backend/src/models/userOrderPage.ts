export interface UserOrderPage {
  id: number;
  userId: number;
  userName: string;
  date: string; // YYYY-MM-DD
  status: 'active' | 'completed' | 'archived';
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserOrderPageOrder {
  id: number;
  pageId: number;
  orderId: number;
  orderType: 'website' | 'telegram' | 'manual';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedAt: string;
  completedAt?: string;
  notes?: string;
}

export interface CreateUserOrderPageRequest {
  userId: number;
  userName: string;
  date: string;
}

export interface AssignOrderRequest {
  pageId: number;
  orderId: number;
  orderType: 'website' | 'telegram' | 'manual';
  notes?: string;
}
