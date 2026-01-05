export interface MaterialPriceHistory {
  id?: number;
  material_id: number;
  material_name?: string; // Название материала для отображения
  old_price?: number;
  new_price: number;
  change_reason: string; // Причина изменения цены
  changed_by?: number; // Пользователь, изменивший цену
  changed_by_name?: string; // Имя пользователя для отображения
  created_at?: string;
}
