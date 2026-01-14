import { Item } from '../../../types';

export interface Material {
  id: number;
  name: string;
  category?: string;
  category_name?: string;
  category_color?: string;
}

export interface ProductSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  paperType:
    | 'semi-matte'
    | 'glossy'
    | 'offset'
    | 'roll'
    | 'self-adhesive'
    | 'transparent'
    | 'magnetic'
    | 'kraft'
    | 'kraft_300g'
    | 'office'
    | 'coated'
    | 'designer';
  paperDensity: number;
  lamination: 'none' | 'matte' | 'glossy';
  priceType: 'standard' | 'urgent' | 'superUrgent' | 'online' | 'promo' | 'express';
  customerType: 'regular' | 'vip';
  pages?: number;
  magnetic?: boolean;
  cutting?: boolean;
  folding?: boolean;
  roundCorners?: boolean;
  urgency?: 'standard' | 'urgent' | 'superUrgent';
  vipLevel?: 'bronze' | 'silver' | 'gold' | 'platinum';
  specialServices?: string[];
  materialType?: 'office' | 'coated' | 'designer' | 'selfAdhesive';
  name?: string;
  size_id?: string; // 🆕 Для упрощённых продуктов
  material_id?: number; // 🆕 ID материала (для упрощённых и обычных продуктов)
  selectedOperations?: Array<{ // 🆕 Выбранные операции с подтипами и количеством
    operationId: number;
    subtype?: string;
    quantity?: number;
  }>;
  [key: string]: any;
}

export interface CalculationResult {
  productName: string;
  specifications: ProductSpecs;
  materials: Array<{
    material: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
    materialId?: number;
    unitPrice?: number;
    paper_type_name?: string; // 🆕 display_name типа бумаги для установки materialType
  }>;
  services: Array<{
    service: string;
    price: number;
    total: number;
    operationId?: number;
    quantity?: number;
    unit?: string;
  }>;
  totalCost: number;
  pricePerItem: number;
  productionTime: string;
  deliveryDate?: string;
  parameterSummary?: Array<{ key: string; label: string; value: string }>;
  formatInfo?: string;
  layout?: {
    sheetsNeeded?: number;
    itemsPerSheet?: number;
    sheetSize?: string;
    wastePercentage?: number;
  };
}

export interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToOrder: (item: any) => void;
  initialProductType?: string;
}

export interface MaterialAvailability {
  available: boolean;
  quantity: number;
  reserved: number;
  alternatives: any[];
}

export interface ComparisonItem {
  id: string;
  specs: ProductSpecs;
  result: CalculationResult;
  name: string;
}

export interface EditContextPayload {
  orderId: number;
  item: Item;
}
