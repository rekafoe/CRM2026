import { CalculationResult } from '../types/calculator.types';

const PRICE_TYPE_MULTIPLIERS: Record<string, number> = {
  standard: 1,
  urgent: 1.5,
  online: 0.85,
  promo: 0.7,
  special: 0.55,
};

export function getPriceTypeMultiplier(priceType: string): number {
  return PRICE_TYPE_MULTIPLIERS[priceType] ?? 1;
}

interface BuildOrderPayloadParams {
  result: CalculationResult;
  selectedProduct: { id?: number; name?: string; operator_percent?: number } | null;
  getProductionDays: () => number;
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  printTechnology: string;
  printColorMode: 'bw' | 'color' | null;
}

export function buildOrderPayload({
  result,
  selectedProduct,
  getProductionDays,
  isCustomFormat,
  customFormat,
  printTechnology,
  printColorMode,
}: BuildOrderPayloadParams) {
  const layoutSheets = result.layout?.sheetsNeeded ?? undefined;
  const itemsPerSheet = result.layout?.itemsPerSheet ?? undefined;
  const computedSheets =
    layoutSheets ??
    (itemsPerSheet
      ? Math.ceil(result.specifications.quantity / Math.max(itemsPerSheet, 1))
      : undefined);

  const parameterSummary = result.parameterSummary ?? [];
  const summaryText = parameterSummary.length
    ? parameterSummary.map((param) => `${param.label}: ${param.value}`).join(' • ')
    : `${result.specifications.quantity} шт.`;

  const fallbackName = selectedProduct?.name || result.productName;
  const description = `${fallbackName} • ${summaryText}`;

  const estimatedDelivery = new Date(
    Date.now() + getProductionDays() * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split('T')[0];

  const cleanSpecifications = { ...result.specifications };
  delete cleanSpecifications.selectedOperations;

  const cleanParameterSummary = Array.isArray(parameterSummary)
    ? parameterSummary.map((p: any) => ({
        label: String(p.label || ''),
        value: String(p.value || ''),
      }))
    : [];

  const cleanFormatInfo = result.formatInfo
    ? (typeof result.formatInfo === 'string'
        ? result.formatInfo
        : JSON.parse(JSON.stringify(result.formatInfo)))
    : undefined;

  const specificationsPayload = {
    ...cleanSpecifications,
    formatInfo: cleanFormatInfo,
    parameterSummary: cleanParameterSummary,
    sheetsNeeded: computedSheets,
    piecesPerSheet: itemsPerSheet,
    layout: result.layout ? JSON.parse(JSON.stringify(result.layout)) : undefined,
    customFormat: isCustomFormat ? customFormat : undefined,
    print_technology: printTechnology || undefined,
    printTechnology: printTechnology || undefined,
    print_color_mode: printColorMode || undefined,
    printColorMode: printColorMode || undefined,
    ...(result.specifications.material_id ? { material_id: result.specifications.material_id } : {}),
    ...(result.specifications.size_id ? { size_id: result.specifications.size_id } : {}),
  };

  const cleanMaterials = result.materials
    ? result.materials.map((m: any) => ({
        materialId: m.materialId,
        materialName: m.materialName,
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        totalCost: m.totalCost,
        density: m.density,
        paper_type_name: m.paper_type_name,
      }))
    : [];

  const cleanServices = result.services
    ? result.services.map((s: any) => ({
        operationId: s.operationId,
        operationName: s.operationName,
        operationType: s.operationType,
        priceUnit: s.priceUnit,
        unitPrice: s.unitPrice,
        quantity: s.quantity,
        totalCost: s.totalCost,
      }))
    : [];

  const priceTypeMult = getPriceTypeMultiplier(result.specifications.priceType || 'standard');
  const effectivePricePerItem = Math.round(result.pricePerItem * priceTypeMult * 100) / 100;

  const paramsPayload = {
    description,
    specifications: specificationsPayload,
    materials: cleanMaterials,
    services: cleanServices,
    productionTime: result.productionTime,
    productType: result.specifications.productType,
    urgency: result.specifications.priceType,
    priceType: result.specifications.priceType,
    customerType: result.specifications.customerType,
    estimatedDelivery,
    sheetsNeeded: computedSheets,
    piecesPerSheet: itemsPerSheet,
    formatInfo: cleanFormatInfo,
    parameterSummary: cleanParameterSummary,
    productId: selectedProduct?.id,
    productName: selectedProduct?.name,
    ...(result.specifications.typeId != null ? { typeId: result.specifications.typeId } : {}),
    ...(result.specifications.typeName != null ? { type: result.specifications.typeName } : {}),
    ...(selectedProduct?.operator_percent !== undefined
      ? { operator_percent: Number(selectedProduct.operator_percent) }
      : {}),
    layout: result.layout ? JSON.parse(JSON.stringify(result.layout)) : undefined,
    customFormat: isCustomFormat ? customFormat : undefined,
  };

  const components =
    result.materials
      .filter((m) => m.materialId)
      .map((m) => ({
        materialId: m.materialId as number,
        qtyPerItem:
          result.specifications.quantity > 0
            ? Number((m.quantity / result.specifications.quantity).toFixed(6))
            : Number(m.quantity),
      })) ?? [];

  const clicks = (computedSheets ?? 0) * ((result.specifications.sides ?? 1) * 2);

  const apiItem = {
    type: fallbackName,
    params: paramsPayload,
    price: effectivePricePerItem,
    quantity: result.specifications.quantity,
    sides: result.specifications.sides ?? 1,
    sheets: computedSheets ?? 0,
    waste: result.specifications.waste ?? 0,
    clicks,
    components,
  };

  return { apiItem, effectivePricePerItem, description };
}

export function buildAITrainingData(result: CalculationResult, effectivePricePerItem: number) {
  return {
    productType: result.specifications.productType,
    format: result.specifications.format,
    quantity: result.specifications.quantity,
    paperType: result.specifications.paperType,
    paperDensity: result.specifications.paperDensity,
    lamination: result.specifications.lamination,
    urgency: result.specifications.priceType,
    customerType: result.specifications.customerType,
    finalPrice: effectivePricePerItem,
  };
}
