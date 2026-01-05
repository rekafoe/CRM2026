export interface ProductMaterialRule {
  id?: number;
  product_type: string; // Тип продукта (flyers, business_cards, etc.)
  product_name: string; // Название продукта
  material_id: number; // ID материала
  material_name?: string; // Название материала для отображения
  unit?: string; // Единица измерения
  sheet_price_single?: number; // Цена за единицу
  qty_per_item: number; // Количество материала на единицу продукта
  calculation_type: 'per_item' | 'per_sheet' | 'per_sqm' | 'fixed'; // Тип расчета
  is_required: boolean; // Обязательный материал
  notes?: string; // Примечания
  category_name?: string; // Название категории
  category_color?: string; // Цвет категории
  supplier_name?: string; // Название поставщика
  created_at?: string;
  updated_at?: string;
}

export interface CalculatorConfig {
  product_type: string;
  product_name: string;
  rules: ProductMaterialRule[];
  total_materials: number;
  total_cost: number;
}
