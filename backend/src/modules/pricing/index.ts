// Pricing module exports

// 🎯 ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для ценообразования
export { UnifiedPricingService } from './services/unifiedPricingService';

// Services (для внутреннего использования)
export { FlexiblePricingService } from './services/flexiblePricingService';
export { CostCalculationService } from './services/costCalculationService';
export { LayoutCalculationService } from './services/layoutCalculationService';
export { MarkupSettingsService } from './services/markupSettingsService';
export { QuantityDiscountsService } from './services/quantityDiscountsService';

// Controllers
export { PricingController } from './controllers/pricingController';
export { CostCalculationController } from './controllers/costCalculationController';

// Routes
export { default as costCalculationRoutes } from './routes/costCalculation';

