export interface Item {
  id: number;
  orderId: number;
  type: string;
  params: { description: string };
  price: number;
  quantity: number;
  printerId?: number;
  sides?: number; // 1 or 2
  sheets?: number; // SRA3 sheets printed
  waste?: number;  // defective sheets
  clicks?: number; // computed clicks for printers
}

export interface Order {
  id: number;
  number: string;
  status: number;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  prepaymentAmount?: number;
  prepaymentStatus?: string;
  paymentUrl?: string;
  paymentId?: string;
  paymentMethod?: 'online' | 'offline' | 'telegram';
  items: Item[];
}

export interface Material {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  min_quantity?: number;
}

export interface ProductMaterial {
  presetCategory: string;
  presetDescription: string;
  materialId: number;
  qtyPerItem: number;
}
export interface DailyReport {
  id: number;
  report_date: string;    // YYYY-MM-DD
  orders_count: number;
  total_revenue: number;
  created_at: string;     // ISO timestamp
  updated_at?: string;
  user_id?: number;
  cash_actual?: number;
}

export interface OrderFile {
  id: number;
  orderId: number;
  filename: string;
  originalName?: string;
  mime?: string;
  size?: number;
  uploadedAt: string;
  approved: number; // 0/1
  approvedAt?: string;
  approvedBy?: number;
}

export interface Printer {
  id: number;
  code: string;
  name: string;
}

export interface PrinterCounter {
  id: number;
  printer_id: number;
  counter_date: string; // YYYY-MM-DD
  value: number;
  created_at: string;
}
