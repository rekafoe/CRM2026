/**
 * ХУК ДЛЯ РАБОТЫ С ПРОДУКТАМИ
 * 
 * Управление состоянием продуктов:
 * - Загрузка категорий и продуктов
 * - Кэширование данных
 * - Обработка ошибок
 * - Автоматическое обновление
 * 
 * Рефакторинг: использование useReducer вместо множества useState
 */

import { useReducer, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  getProductCategories, 
  getProductsByCategory, 
  getAllProducts,
  getProductDetails,
  getProductsForCalculator,
  searchProducts,
  clearProductCache,
  ProductCategory,
  Product,
  ProductWithDetails
} from '../services/products';
import { useLogger } from '../utils/logger';
import { useToastNotifications } from '../components/Toast';

// Типы состояния
interface ProductsState {
  // Данные
  categories: ProductCategory[];
  products: Product[];
  selectedProduct: ProductWithDetails | null;
  isInitialized: boolean;
  
  // Состояния загрузки
  loading: {
    categories: boolean;
    products: boolean;
    productDetails: boolean;
  };
  
  // Ошибки
  errors: {
    categories: string | null;
    products: string | null;
    productDetails: string | null;
  };
}

// Типы действий
type ProductsAction =
  | { type: 'SET_CATEGORIES'; payload: ProductCategory[] }
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'SET_SELECTED_PRODUCT'; payload: ProductWithDetails | null }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_LOADING_CATEGORIES'; payload: boolean }
  | { type: 'SET_LOADING_PRODUCTS'; payload: boolean }
  | { type: 'SET_LOADING_PRODUCT_DETAILS'; payload: boolean }
  | { type: 'SET_CATEGORIES_ERROR'; payload: string | null }
  | { type: 'SET_PRODUCTS_ERROR'; payload: string | null }
  | { type: 'SET_PRODUCT_DETAILS_ERROR'; payload: string | null }
  | { type: 'CLEAR_ALL' };

// Начальное состояние
const initialState: ProductsState = {
  categories: [],
  products: [],
  selectedProduct: null,
  isInitialized: false,
  loading: {
    categories: false,
    products: false,
    productDetails: false,
  },
  errors: {
    categories: null,
    products: null,
    productDetails: null,
  },
};

// Reducer
function productsReducer(state: ProductsState, action: ProductsAction): ProductsState {
  switch (action.type) {
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload };
    
    case 'SET_PRODUCTS':
      return { ...state, products: action.payload };
    
    case 'SET_SELECTED_PRODUCT':
      return { ...state, selectedProduct: action.payload };
    
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    
    case 'SET_LOADING_CATEGORIES':
      return { ...state, loading: { ...state.loading, categories: action.payload } };
    
    case 'SET_LOADING_PRODUCTS':
      return { ...state, loading: { ...state.loading, products: action.payload } };
    
    case 'SET_LOADING_PRODUCT_DETAILS':
      return { ...state, loading: { ...state.loading, productDetails: action.payload } };
    
    case 'SET_CATEGORIES_ERROR':
      return { ...state, errors: { ...state.errors, categories: action.payload } };
    
    case 'SET_PRODUCTS_ERROR':
      return { ...state, errors: { ...state.errors, products: action.payload } };
    
    case 'SET_PRODUCT_DETAILS_ERROR':
      return { ...state, errors: { ...state.errors, productDetails: action.payload } };
    
    case 'CLEAR_ALL':
      return {
        ...initialState,
        isInitialized: false,
      };
    
    default:
      return state;
  }
}

export interface UseProductsReturn {
  // Данные
  categories: ProductCategory[];
  products: Product[];
  selectedProduct: ProductWithDetails | null;
  
  // Состояния загрузки
  loadingCategories: boolean;
  loadingProducts: boolean;
  loadingProductDetails: boolean;
  
  // Ошибки
  categoriesError: string | null;
  productsError: string | null;
  productDetailsError: string | null;
  
  // Действия
  loadCategories: () => Promise<void>;
  loadProductsByCategory: (categoryId: number) => Promise<void>;
  loadAllProducts: () => Promise<void>;
  loadProductDetails: (productId: number) => Promise<void>;
  searchProducts: (query: string) => Promise<Product[]>;
  clearCache: () => void;
  refreshData: () => Promise<void>;
  
  // Утилиты
  getProductsByCategoryId: (categoryId: number) => Product[];
  getProductById: (productId: number) => Product | undefined;
  isProductActive: (product: Product) => boolean;
}

export const useProducts = (): UseProductsReturn => {
  const logger = useLogger('useProducts');
  const toast = useToastNotifications();
  
  const [state, dispatch] = useReducer(productsReducer, initialState);
  const initializationRef = useRef(false); // Используем ref для отслеживания инициализации

  // Вспомогательная функция для выполнения асинхронных операций с обработкой ошибок
  const executeAsync = useCallback(async <T,>(
    operation: () => Promise<T>,
    loadingAction: ProductsAction,
    errorAction: ProductsAction,
    clearErrorAction: ProductsAction,
    errorMessage: string,
    onSuccess?: (data: T) => void
  ): Promise<T | null> => {
    // Устанавливаем состояние загрузки
    dispatch(clearErrorAction);
    dispatch(loadingAction);
    
    try {
      const data = await operation();
      if (onSuccess) {
        onSuccess(data);
      }
      return data;
    } catch (error) {
      logger.error(`❌ ${errorMessage}: ${error}`);
      dispatch(errorAction);
      toast.error(errorMessage);
      return null;
    } finally {
      // Сбрасываем состояние загрузки (создаём новый action с payload: false)
      const resetLoadingAction = { ...loadingAction, payload: false } as ProductsAction;
      dispatch(resetLoadingAction);
    }
  }, [logger, toast]);

  // Загрузка категорий
  const loadCategories = useCallback(async () => {
    await executeAsync(
      async () => {
        logger.info('🔄 Загружаем категории продуктов...');
        const categoriesData = await getProductCategories();
        logger.info(`✅ Категории загружены (${categoriesData.length})`);
        return categoriesData;
      },
      { type: 'SET_LOADING_CATEGORIES', payload: true },
      { type: 'SET_CATEGORIES_ERROR', payload: 'Ошибка загрузки категорий продуктов' },
      { type: 'SET_CATEGORIES_ERROR', payload: null },
      'Ошибка загрузки категорий продуктов',
      (categories) => dispatch({ type: 'SET_CATEGORIES', payload: categories })
    );
  }, [logger, executeAsync]);

  // Загрузка продуктов по категории
  const loadProductsByCategory = useCallback(async (categoryId: number) => {
    await executeAsync(
      async () => {
        logger.info('🔄 Загружаем продукты по категории...', { categoryId });
        const productsData = await getProductsByCategory(categoryId);
        logger.info(`✅ Продукты загружены (${productsData.length})`);
        return productsData;
      },
      { type: 'SET_LOADING_PRODUCTS', payload: true },
      { type: 'SET_PRODUCTS_ERROR', payload: 'Ошибка загрузки продуктов по категории' },
      { type: 'SET_PRODUCTS_ERROR', payload: null },
      'Ошибка загрузки продуктов по категории',
      (products) => dispatch({ type: 'SET_PRODUCTS', payload: products })
    );
  }, [logger, executeAsync]);

  // Загрузка всех продуктов
  const loadAllProducts = useCallback(async () => {
    await executeAsync(
      async () => {
        logger.info('🔄 Загружаем все продукты...');
        const productsData = await getAllProducts();
        logger.info(`✅ Все продукты загружены (${productsData.length})`);
        return productsData;
      },
      { type: 'SET_LOADING_PRODUCTS', payload: true },
      { type: 'SET_PRODUCTS_ERROR', payload: 'Ошибка загрузки всех продуктов' },
      { type: 'SET_PRODUCTS_ERROR', payload: null },
      'Ошибка загрузки всех продуктов',
      (products) => dispatch({ type: 'SET_PRODUCTS', payload: products })
    );
  }, [logger, executeAsync]);

  // Загрузка деталей продукта
  const loadProductDetails = useCallback(async (productId: number) => {
    await executeAsync(
      async () => {
        logger.info('🔄 Загружаем детали продукта...', { productId });
        const productDetails = await getProductDetails(productId);
        logger.info(`✅ Детали продукта загружены (${productId})`);
        return productDetails;
      },
      { type: 'SET_LOADING_PRODUCT_DETAILS', payload: true },
      { type: 'SET_PRODUCT_DETAILS_ERROR', payload: 'Ошибка загрузки деталей продукта' },
      { type: 'SET_PRODUCT_DETAILS_ERROR', payload: null },
      'Ошибка загрузки деталей продукта',
      (product) => dispatch({ type: 'SET_SELECTED_PRODUCT', payload: product })
    );
  }, [logger, executeAsync]);

  // Поиск продуктов
  const searchProductsHandler = useCallback(async (query: string): Promise<Product[]> => {
    try {
      logger.info(`🔍 Поиск продуктов: ${query}`);
      const searchResults = await searchProducts(query);
      logger.info(`✅ Поиск завершен (${searchResults.length})`);
      return searchResults;
    } catch (error) {
      logger.error('❌ Ошибка поиска продуктов', error);
      toast.error('Ошибка поиска продуктов');
      return [];
    }
  }, [logger, toast]);

  // Очистка кэша
  const clearCache = useCallback(() => {
    logger.info('🗑️ Очищаем кэш продуктов');
    clearProductCache();
    dispatch({ type: 'CLEAR_ALL' });
  }, [logger]);

  // Обновление всех данных
  const refreshData = useCallback(async () => {
    logger.info('🔄 Обновляем данные продуктов...');
    clearProductCache();
    await loadCategories();
    await loadAllProducts();
    logger.info('✅ Данные продуктов обновлены');
  }, [logger, loadCategories, loadAllProducts]);

  // Утилиты (мемоизированы для производительности)
  const getProductsByCategoryId = useMemo(() => {
    return (categoryId: number): Product[] => {
      return state.products.filter(product => product.category_id === categoryId);
    };
  }, [state.products]);

  const getProductById = useMemo(() => {
    return (productId: number): Product | undefined => {
      return state.products.find(product => product.id === productId);
    };
  }, [state.products]);

  const isProductActive = useCallback((product: Product): boolean => {
    return product.is_active;
  }, []);

  // Автоматическая загрузка при инициализации (только один раз)
  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = true;
      logger.info('🚀 Инициализация хука useProducts');
      void loadCategories();
      void loadAllProducts();
      dispatch({ type: 'SET_INITIALIZED', payload: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Пустой массив зависимостей - выполняется только при монтировании компонента

  return {
    // Данные
    categories: state.categories,
    products: state.products,
    selectedProduct: state.selectedProduct,
    
    // Состояния загрузки
    loadingCategories: state.loading.categories,
    loadingProducts: state.loading.products,
    loadingProductDetails: state.loading.productDetails,
    
    // Ошибки
    categoriesError: state.errors.categories,
    productsError: state.errors.products,
    productDetailsError: state.errors.productDetails,
    
    // Действия
    loadCategories,
    loadProductsByCategory,
    loadAllProducts,
    loadProductDetails,
    searchProducts: searchProductsHandler,
    clearCache,
    refreshData,
    
    // Утилиты
    getProductsByCategoryId,
    getProductById,
    isProductActive
  };
};
