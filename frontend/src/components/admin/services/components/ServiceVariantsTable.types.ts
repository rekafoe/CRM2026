import { ServiceVariant, ServiceVolumeTier } from '../../../../types/pricing';

/**
 * Вариант услуги с диапазонами цен
 */
export interface VariantWithTiers extends ServiceVariant {
  tiers: ServiceVolumeTier[];
  loadingTiers?: boolean;
}

/**
 * Состояние модального окна для диапазонов
 */
export interface TierRangeModalState {
  type: 'add' | 'edit';
  isOpen: boolean;
  boundary: string;
  tierIndex?: number;
  variantIndex?: number;
  anchorElement?: HTMLElement;
}

/**
 * Группированные варианты по типам и уровням
 */
export interface GroupedVariants {
  level0: VariantWithTiers[];
  level1: Map<number, VariantWithTiers[]>; // key = parent variant id
  level2: Map<number, VariantWithTiers[]>; // key = parent variant id
}

/**
 * Группировка вариантов по типам
 */
export interface VariantsByType {
  [typeName: string]: GroupedVariants;
}

/**
 * Props для компонента таблицы вариантов
 */
export interface ServiceVariantsTableProps {
  serviceId: number;
  serviceName: string;
  serviceMinQuantity?: number;
  serviceMaxQuantity?: number;
}

/**
 * Props для строки варианта уровня 0 (тип)
 */
export interface VariantRowLevel0Props {
  variant: VariantWithTiers;
  typeName: string;
  allTypeVariants: VariantWithTiers[];
  commonRanges: Array<{ min_qty: number; max_qty?: number; unit_price: number }>;
  commonRangesAsPriceRanges: Array<{ minQty: number; maxQty?: number; price: number }>;
  isEditingName: boolean;
  editingNameValue: string;
  onNameChange: (value: string) => void;
  onNameEditStart: () => void;
  onNameEditCancel: () => void;
  onNameSave: () => void;
  onDelete: () => void;
  onCreateChild: () => void;
  onCreateSibling: () => void;
  serviceId: number;
}

/**
 * Props для строки варианта уровня 1
 */
export interface VariantRowLevel1Props {
  variant: VariantWithTiers;
  typeName: string;
  level2Variants: VariantWithTiers[];
  commonRangesAsPriceRanges: Array<{ minQty: number; maxQty?: number; price: number }>;
  isEditingParams: boolean;
  editingParamsValue: Record<string, any>;
  onParamsChange: (key: string, value: any) => void;
  onParamsEditStart: () => void;
  onParamsEditCancel: () => void;
  onParamsSave: () => void;
  onPriceChange: (minQty: number, newPrice: number) => void;
  onDelete: () => void;
  onCreateChild: () => void;
  onCreateSibling: () => void;
  serviceId: number;
}

/**
 * Props для строки варианта уровня 2
 */
export interface VariantRowLevel2Props {
  variant: VariantWithTiers;
  typeName: string;
  commonRangesAsPriceRanges: Array<{ minQty: number; maxQty?: number; price: number }>;
  isEditingParams: boolean;
  editingParamsValue: Record<string, any>;
  onParamsChange: (key: string, value: any) => void;
  onParamsEditStart: () => void;
  onParamsEditCancel: () => void;
  onParamsSave: () => void;
  onPriceChange: (minQty: number, newPrice: number) => void;
  onDelete: () => void;
  onCreateSibling: () => void;
  serviceId: number;
}
