export interface MaterialMove {
  id?: number;
  materialId: number;
  material_name?: string; // Название материала для отображения
  delta: number; // Изменение количества (положительное - приход, отрицательное - расход)
  reason: string; // Причина движения
  orderId?: number; // Связанный заказ
  user_id?: number; // Пользователь, выполнивший операцию
  user_name?: string; // Имя пользователя для отображения
  created_at?: string;
  
  // Поля для отслеживания поставок
  supplier_id?: number; // ID поставщика
  delivery_number?: string; // Номер поставки
  invoice_number?: string; // Номер накладной
  delivery_date?: string; // Дата поставки
  delivery_notes?: string; // Примечания к поставке
  
  // Дополнительные поля для фильтрации
  category_name?: string; // Название категории материала
  supplier_name?: string; // Название поставщика материала
}
