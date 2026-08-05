export interface MaterialType {
  id?: number;
  category_id: number;
  category_name?: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active?: number | boolean;
  created_at?: string;
  updated_at?: string;
}
