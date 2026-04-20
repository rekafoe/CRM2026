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
  /** ключ — variantParentMapKey(id родителя) */
  level1: Map<string, VariantWithTiers[]>;
  level2: Map<string, VariantWithTiers[]>;
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
  /** Список материалов для выбора списания по варианту */
  materials?: Array<{ id: number; name: string }>;
}

/**
 * Props для строки варианта уровня 0 (тип)
 */
export interface VariantRowLevel0Props {
  variant: VariantWithTiers;
  typeName: string;
  allTypeVariants?: VariantWithTiers[];
  commonRanges?: Array<{ min_qty: number; max_qty?: number; unit_price: number }>;
  commonRangesAsPriceRanges: Array<{ minQty: number; maxQty?: number; price: number }>;
  isEditingName: boolean;
  editingNameValue: string;
  onNameChange: (value: string) => void;
  onNameEditStart: (variantId: number, currentName: string) => void;
  onNameEditCancel: () => void;
  onNameSave: (firstVariantId: number) => void;
  onDelete: (typeName: string, variantIds: number[]) => void;
  onCreateChild: (typeName: string) => void;
  onCreateSibling: () => void;
  serviceId?: number;
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
  onParamsEditStart: (variantId: number, initialType: string) => void;
  onParamsEditCancel: () => void;
  onParamsSave: (variantId: number) => void;
  onDelete: (variantId: number, level2ChildIds: number[]) => void;
  onCreateChild: (typeName: string, parentId: number) => void;
  onCreateSibling: (typeName: string) => void;
}

/**
 * Props для строки варианта уровня 2
 */
export interface VariantRowLevel2Props {
  variant: VariantWithTiers;
  typeName?: string;
  commonRangesAsPriceRanges: Array<{ minQty: number; maxQty?: number; price: number }>;
  isEditingParams: boolean;
  editingParamsValue: Record<string, any>;
  onParamsChange: (key: string, value: any) => void;
  onParamsEditStart: (variantId: number, initialSubType: string) => void;
  onParamsEditCancel: () => void;
  onParamsSave: (variantId: number) => void;
  onPriceChange: (variantId: number, minQty: number, newPrice: number) => void;
  onDelete: (variantId: number) => void;
  onCreateSibling: (typeName: string, parentVariantId: number | string | undefined) => void;
  serviceId?: number;
  hoveredRangeIndex?: number | null;
  onRangeHover?: (index: number | null) => void;
}
