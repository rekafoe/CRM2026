import { getDb } from '../db';

export interface ProductConfig {
  id: string;
  name: string;
  display_name: string;
  formats: string[];
  recommended_paper_types: string[];
  recommended_densities: number[];
  laminations: string[];
  sides: number[];
  pages?: number[];
  special_options?: {
    magnetic?: boolean;
    cutting?: boolean;
    folding?: boolean;
    round_corners?: boolean;
  };
  constraints?: {
    print_sheet?: 'SRA3' | 'A3' | 'B3' | 'B2' | { width: number; height: number };
    materials?: {
      allowed_categories?: string[];
      density?: { min: number; max: number };
      finishes?: string[];
    };
    overrides?: { include_ids?: number[]; exclude_ids?: number[] };
  };
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const productConfigService = {
  // Получить все конфигурации продуктов
  async getAllProductConfigs(): Promise<ProductConfig[]> {
    try {
        const db = await getDb();
      const query = `
        SELECT 
          id,
          name,
          display_name,
          formats,
          recommended_paper_types,
          recommended_densities,
          laminations,
          sides,
          pages,
          special_options,
          constraints,
          description,
          is_active,
          created_at,
          updated_at
        FROM product_configs 
        WHERE is_active = 1
        ORDER BY name
      `;

      const rows = await db.all(query) as any[];

      const configs = rows.map(row => ({
        ...row,
        formats: JSON.parse(row.formats || '[]'),
        recommended_paper_types: JSON.parse(row.recommended_paper_types || '[]'),
        recommended_densities: JSON.parse(row.recommended_densities || '[]'),
        laminations: JSON.parse(row.laminations || '[]'),
        sides: JSON.parse(row.sides || '[]'),
        pages: row.pages ? JSON.parse(row.pages) : undefined,
        special_options: row.special_options ? JSON.parse(row.special_options) : undefined,
        constraints: row.constraints ? JSON.parse(row.constraints) : undefined
      }));

      return configs;
    } catch (error) {
      console.error('Ошибка получения конфигураций продуктов:', error);
      return [];
    }
  },

  // Получить конфигурацию продукта по ID
  async getProductConfigById(id: string): Promise<ProductConfig | null> {
    try {
        const db = await getDb();
      const query = `
        SELECT 
          id,
          name,
          display_name,
          formats,
          recommended_paper_types,
          recommended_densities,
          laminations,
          sides,
          pages,
          special_options,
          constraints,
          description,
          is_active,
          created_at,
          updated_at
        FROM product_configs 
        WHERE id = ?
      `;

      const row = await db.get(query, [id]) as any;

      if (!row) {
        return null;
      }

      const config: ProductConfig = {
        ...row,
        formats: JSON.parse(row.formats || '[]'),
        recommended_paper_types: JSON.parse(row.recommended_paper_types || '[]'),
        recommended_densities: JSON.parse(row.recommended_densities || '[]'),
        laminations: JSON.parse(row.laminations || '[]'),
        sides: JSON.parse(row.sides || '[]'),
        pages: row.pages ? JSON.parse(row.pages) : undefined,
        special_options: row.special_options ? JSON.parse(row.special_options) : undefined,
        constraints: row.constraints ? JSON.parse(row.constraints) : undefined
      };

      return config;
    } catch (error) {
      console.error('Ошибка получения конфигурации продукта:', error);
      return null;
    }
  },

  // Создать новую конфигурацию продукта
  async createProductConfig(configData: Omit<ProductConfig, 'created_at' | 'updated_at'>): Promise<ProductConfig> {
    try {
        const db = await getDb();
      const now = new Date().toISOString();
      const query = `
        INSERT INTO product_configs (
          id,
          name,
          display_name,
          formats,
          recommended_paper_types,
          recommended_densities,
          laminations,
          sides,
          pages,
          special_options,
          constraints,
          description,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        configData.id,
        configData.name,
        configData.display_name,
        JSON.stringify(configData.formats),
        JSON.stringify(configData.recommended_paper_types),
        JSON.stringify(configData.recommended_densities),
        JSON.stringify(configData.laminations),
        JSON.stringify(configData.sides),
        configData.pages ? JSON.stringify(configData.pages) : null,
        configData.special_options ? JSON.stringify(configData.special_options) : null,
        configData.constraints ? JSON.stringify(configData.constraints) : null,
        configData.description || null,
        configData.is_active ? 1 : 0,
        now,
        now
      ];

      await db.run(query, values);

      const newConfig: ProductConfig = {
        ...configData,
        created_at: now,
        updated_at: now
      };

      return newConfig;
    } catch (error) {
      console.error('Ошибка создания конфигурации продукта:', error);
      throw error;
    }
  },

  // Обновить конфигурацию продукта
  async updateProductConfig(id: string, configData: Partial<ProductConfig>): Promise<ProductConfig | null> {
    try {
        const db = await getDb();
      const now = new Date().toISOString();
      
      // Строим динамический запрос
      const fields = [];
      const values = [];

      if (configData.name !== undefined) {
        fields.push('name = ?');
        values.push(configData.name);
      }
      if (configData.display_name !== undefined) {
        fields.push('display_name = ?');
        values.push(configData.display_name);
      }
      if (configData.formats !== undefined) {
        fields.push('formats = ?');
        values.push(JSON.stringify(configData.formats));
      }
      if (configData.recommended_paper_types !== undefined) {
        fields.push('recommended_paper_types = ?');
        values.push(JSON.stringify(configData.recommended_paper_types));
      }
      if (configData.recommended_densities !== undefined) {
        fields.push('recommended_densities = ?');
        values.push(JSON.stringify(configData.recommended_densities));
      }
      if (configData.laminations !== undefined) {
        fields.push('laminations = ?');
        values.push(JSON.stringify(configData.laminations));
      }
      if (configData.sides !== undefined) {
        fields.push('sides = ?');
        values.push(JSON.stringify(configData.sides));
      }
      if (configData.pages !== undefined) {
        fields.push('pages = ?');
        values.push(configData.pages ? JSON.stringify(configData.pages) : null);
      }
      if (configData.special_options !== undefined) {
        fields.push('special_options = ?');
        values.push(configData.special_options ? JSON.stringify(configData.special_options) : null);
      }
      if (configData.constraints !== undefined) {
        fields.push('constraints = ?');
        values.push(configData.constraints ? JSON.stringify(configData.constraints) : null);
      }
      if (configData.description !== undefined) {
        fields.push('description = ?');
        values.push(configData.description);
      }
      if (configData.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(configData.is_active ? 1 : 0);
      }

      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);

      const query = `UPDATE product_configs SET ${fields.join(', ')} WHERE id = ?`;

      const result = await db.run(query, values);

      if (result.changes === 0) {
        return null;
      }

      // Получаем обновленную конфигурацию
      return await this.getProductConfigById(id);
    } catch (error) {
      console.error('Ошибка обновления конфигурации продукта:', error);
      throw error;
    }
  },

  // Удалить конфигурацию продукта
  async deleteProductConfig(id: string): Promise<boolean> {
    try {
        const db = await getDb();
      const query = 'DELETE FROM product_configs WHERE id = ?';

      const result = await db.run(query, [id]);
      return (result.changes || 0) > 0;
    } catch (error) {
      console.error('Ошибка удаления конфигурации продукта:', error);
      throw error;
    }
  }
};