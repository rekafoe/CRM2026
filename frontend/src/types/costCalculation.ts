// Централизованные типы для расчета себестоимости
export interface MaterialCost {
  materialId: number
  materialName: string
  quantity: number
  unitPrice: number
  totalCost: number
  unit: string
}

export interface ServiceCost {
  serviceId: number
  serviceName: string
  quantity: number
  unitPrice: number
  totalCost: number
  unit: string
}

export interface ProductCostBreakdown {
  productId: string
  productName: string
  materialCosts: MaterialCost[]
  serviceCosts: ServiceCost[]
  totalMaterialCost: number
  totalServiceCost: number
  totalCost: number
  margin: number
  sellingPrice: number
  profit: number
  profitMargin: number
}

export interface CostCalculationResult {
  success: boolean
  breakdown: ProductCostBreakdown
  recommendations: string[]
  warnings: string[]
}

export interface CostCalculationParams {
  productType: string
  productVariant: string
  quantity: number
  specifications?: any
}

export interface ProductType {
  value: string
  label: string
}

export interface ProductVariant {
  value: string
  label: string
}
