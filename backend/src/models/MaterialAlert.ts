export interface MaterialAlert {
  id?: number;
  material_id: number;
  material_name?: string; // Название материала для отображения
  alert_type: 'low_stock' | 'out_of_stock' | 'expiring_soon';
  current_quantity: number;
  threshold_quantity: number;
  message: string;
  is_read: boolean;
  created_at?: string;
  read_at?: string;
  user_id?: number; // Пользователь, который прочитал уведомление
}
