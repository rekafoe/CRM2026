/**
 * Главный экспорт сервиса продуктов
 * 
 * Реэкспортирует все функции из модулей для обратной совместимости
 */

// Типы
export * from './types';

import { clearCategoriesCache as _clearCategoriesCache } from './categories';
import { clearProductsCache as _clearProductsCache } from './products';

// Категории
export {
  getProductCategories,
  createProductCategory,
  updateProductCategory,
  clearCategoriesCache
} from './categories';

// Продукты
export {
  getProductsByCategory,
  getAllProducts,
  getProductDetails,
  updateProduct,
  createProduct,
  createProductWithSetup,
  deleteProduct,
  searchProducts,
  getProductsForCalculator,
  clearProductsCache
} from './products';

// Материалы
export {
  getProductMaterials,
  addProductMaterial,
  bulkAddProductMaterials,
  removeProductMaterial
} from './materials';

// Операции
export {
  getAllOperations,
  bulkAddProductOperations
} from './operations';

// Услуги
export {
  getProductServicesLinks,
  addProductServiceLink,
  removeProductServiceLink
} from './services';

// Конфигурации и параметры
export {
  getProductConfigs,
  createProductConfig,
  updateProductConfig,
  getProductParameterPresets,
  createProductParameter,
  updateProductParameter,
  deleteProductParameter
} from './configs';

/**
 * Очистить все кэши продуктов
 * @deprecated Используйте clearCategoriesCache() и clearProductsCache() отдельно
 */
export function clearProductCache(): void {
  _clearCategoriesCache();
  _clearProductsCache();
}
