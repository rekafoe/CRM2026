/**
 * Главный экспорт сервиса продуктов
 * 
 * Реэкспортирует все функции из модулей для обратной совместимости
 */

// Типы
export * from './types';

// Категории
export {
  getProductCategories,
  createProductCategory,
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
  // Импортируем функции динамически, чтобы избежать циклических зависимостей
  import('./categories').then(m => m.clearCategoriesCache());
  import('./products').then(m => m.clearProductsCache());
}
