import { Item } from './Item'
import type { MiniappCheckoutState } from '../utils/miniappCheckoutState'

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
  payment_channel?: 'cash' | 'invoice' | 'not_cashed' | 'internal';
  miniapp_checkout_state?: MiniappCheckoutState;
  miniapp_design_help_requested?: number;
  items: Item[];
}
