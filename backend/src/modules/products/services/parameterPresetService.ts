import { getDb } from '../../../db';

export type ParameterFieldType = 'select' | 'checkbox' | 'number' | 'text';

export interface ProductParameterPreset {
  id: number;
  product_type: string;
  product_name: string | null;
  preset_key: string;
  label: string;
  field_type: ParameterFieldType;
  options?: string[] | null;
  help_text?: string | null;
  default_value?: string | null;
  is_required: boolean;
  sort_order: number;
}

export class ParameterPresetService {
  static async getPresets(productType: string, productName?: string | null): Promise<ProductParameterPreset[]> {
    if (!productType) {
      return [];
    }

    const db = await getDb();

    const params: any[] = [productType];
    let whereClause = 'product_type = ?';

    const trimmedName = productName && productName.trim() ? productName.trim() : null;
    const hasSpecificName = Boolean(trimmedName);

    let rows: any[] = [];

    if (hasSpecificName) {
      const specific = await db.all<any>(
        `
          SELECT
            id,
            product_type,
            product_name,
            preset_key,
            label,
            field_type,
            options,
            help_text,
            default_value,
            is_required,
            sort_order
          FROM product_parameter_presets
          WHERE product_type = ? AND product_name = ?
        `,
        productType,
        trimmedName
      );

      const generic = await db.all<any>(
        `
          SELECT
            id,
            product_type,
            product_name,
            preset_key,
            label,
            field_type,
            options,
            help_text,
            default_value,
            is_required,
            sort_order
          FROM product_parameter_presets
          WHERE product_type = ? AND (product_name IS NULL OR product_name = '')
        `,
        productType
      );

      rows = [...specific, ...generic];
    } else {
      rows = await db.all<any>(
        `
          SELECT
            id,
            product_type,
            product_name,
            preset_key,
            label,
            field_type,
            options,
            help_text,
            default_value,
            is_required,
            sort_order
          FROM product_parameter_presets
          WHERE product_type = ? AND (product_name IS NULL OR product_name = '')
        `,
        productType
      );
    }

    rows.sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.label ?? '').localeCompare(String(b.label ?? ''));
    });

    return rows.map((row: any) => ({
      id: row.id,
      product_type: row.product_type,
      product_name: row.product_name && row.product_name.trim() !== '' ? row.product_name : null,
      preset_key: row.preset_key,
      label: row.label,
      field_type: (row.field_type || 'select') as ParameterFieldType,
      options: row.options ? this.parseOptions(row.options) : null,
      help_text: row.help_text ?? null,
      default_value: row.default_value ?? null,
      is_required: row.is_required ? Boolean(row.is_required) : false,
      sort_order: row.sort_order ?? 0,
    }));
  }

  static parseOptions(value: any): string[] | null {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
      } catch {
        return trimmed.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
      }
      return [trimmed];
    }
    return null;
  }
}

