export interface DailyReport {
  id: number;
  report_date: string;    // YYYY-MM-DD
  orders_count: number;
  total_revenue: number;
  created_at: string;     // ISO timestamp
  updated_at?: string;
  user_id?: number;
  cash_actual?: number;
  snapshot_json?: string;
}
