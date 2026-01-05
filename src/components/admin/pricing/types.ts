// Общие типы для компонентов ценообразования
export type PricingMode = 'per_sheet' | 'per_meter';

export interface PrintTechnology {
  code: string;
  name: string;
  pricing_mode: PricingMode;
  supports_duplex: number;
  is_active: number;
  price_single?: number | null;
  price_duplex?: number | null;
  price_per_meter?: number | null;
  price_is_active?: number;
}

export interface PrinterRow {
  id: number;
  code: string;
  name: string;
  technology_code?: string | null;
  counter_unit?: 'sheets' | 'meters';
  max_width_mm?: number | null;
  color_mode?: 'bw' | 'color' | 'both';
  printer_class?: 'office' | 'pro';
  price_single?: number | null;
  price_duplex?: number | null;
  price_per_meter?: number | null;
  price_bw_single?: number | null;
  price_bw_duplex?: number | null;
  price_color_single?: number | null;
  price_color_duplex?: number | null;
  price_bw_per_meter?: number | null;
  price_color_per_meter?: number | null;
  is_active?: number;
}

export interface PricingManagementProps {
  initialTab?: 'tech' | 'printers' | 'print' | 'services' | 'markup' | 'discounts';
  mode?: 'full' | 'printing';
}

