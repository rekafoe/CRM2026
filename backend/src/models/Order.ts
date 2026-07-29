import { Item } from './Item'
import type { MiniappCheckoutState } from '../utils/miniappCheckoutState'
import type { WebsiteOrderDelivery } from '../types/websiteOrderDelivery'

export interface Order {
  id: number;
  number: string;
  status: number;
  created_at: string;
  source?: 'crm' | 'website' | 'telegram' | 'mini_app';
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customer_id?: number;
  prepaymentAmount?: number;
  prepaymentStatus?: string;
  paymentUrl?: string;
  paymentId?: string;
  paymentMethod?: 'online' | 'offline' | 'telegram';
  userId?: number;
  /** Контактёр / ответственный (если колонки есть) */
  contact_user_id?: number | null;
  responsible_user_id?: number | null;
  /**
   * Заказ попал в список пользователя как исполнителю по позиции
   * (не владелец заказа).
   */
  assigned_as_executor?: boolean | number;
  payment_channel?: 'cash' | 'invoice' | 'not_cashed' | 'internal';
  miniapp_checkout_state?: MiniappCheckoutState;
  miniapp_design_help_requested?: number;
  delivery?: WebsiteOrderDelivery;
  /** Точка исполнения (departments.id) */
  fulfillment_department_id?: number | null;
  fulfillment_department_name?: string | null;
  fulfillment_department_code?: string | null;
  /** Скидка на заказ, % */
  discount_percent?: number;
  /** Суммы с attachAmountsToOrder / computeOrderAmounts */
  subtotal?: number;
  discountAmount?: number;
  totalAmount?: number;
  debt?: number;
  items: Item[];
}
