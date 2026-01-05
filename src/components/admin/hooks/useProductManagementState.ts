/**
 * Хук для управления состоянием ProductManagement
 * Рефакторинг: использование useReducer вместо множества useState
 */

import { useReducer, useCallback } from 'react';

// Типы состояния
interface ProductManagementState {
  // Фильтры и поиск
  query: string;
  showOnlyActive: boolean;
  selectedCategoryId: number | null;
  
  // Сортировка
  sortField: 'name' | 'category' | 'updated';
  sortDirection: 'asc' | 'desc';
  
  // Выбор продуктов
  selectedProducts: Set<number>;
  
  // Мастер создания продукта
  wizard: {
    mode: 'create' | 'duplicate';
    initialProductId: number | null;
    show: boolean;
    useSimplifiedCreator: boolean;
  };
  
  // Модальные окна
  setupStatusModal: number | null;
  deletingProductId: number | null;
  
  // Формы
  categoryForm: {
    name: string;
    icon: string;
    description: string;
    sort_order: number;
  };
  
  productForm: {
    category_id: number;
    name: string;
    description: string;
    icon: string;
  };
}

// Типы действий
type ProductManagementAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_SHOW_ONLY_ACTIVE'; payload: boolean }
  | { type: 'SET_SELECTED_CATEGORY_ID'; payload: number | null }
  | { type: 'SET_SORT_FIELD'; payload: 'name' | 'category' | 'updated' }
  | { type: 'SET_SORT_DIRECTION'; payload: 'asc' | 'desc' }
  | { type: 'TOGGLE_SORT'; payload: 'name' | 'category' | 'updated' }
  | { type: 'TOGGLE_PRODUCT_SELECTION'; payload: number }
  | { type: 'SET_SELECTED_PRODUCTS'; payload: Set<number> }
  | { type: 'CLEAR_SELECTED_PRODUCTS' }
  | { type: 'OPEN_CREATE_WIZARD'; payload: { simplified: boolean } }
  | { type: 'OPEN_DUPLICATE_WIZARD'; payload: { productId: number } }
  | { type: 'CLOSE_WIZARD' }
  | { type: 'SET_SETUP_STATUS_MODAL'; payload: number | null }
  | { type: 'SET_DELETING_PRODUCT_ID'; payload: number | null }
  | { type: 'SET_CATEGORY_FORM'; payload: Partial<ProductManagementState['categoryForm']> }
  | { type: 'RESET_CATEGORY_FORM' }
  | { type: 'SET_PRODUCT_FORM'; payload: Partial<ProductManagementState['productForm']> }
  | { type: 'RESET_PRODUCT_FORM' };

// Начальное состояние
const initialState: ProductManagementState = {
  query: '',
  showOnlyActive: false,
  selectedCategoryId: null,
  sortField: 'name',
  sortDirection: 'asc',
  selectedProducts: new Set(),
  wizard: {
    mode: 'create',
    initialProductId: null,
    show: false,
    useSimplifiedCreator: true,
  },
  setupStatusModal: null,
  deletingProductId: null,
  categoryForm: {
    name: '',
    icon: '',
    description: '',
    sort_order: 0,
  },
  productForm: {
    category_id: 0,
    name: '',
    description: '',
    icon: '',
  },
};

// Reducer
function productManagementReducer(
  state: ProductManagementState,
  action: ProductManagementAction
): ProductManagementState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    
    case 'SET_SHOW_ONLY_ACTIVE':
      return { ...state, showOnlyActive: action.payload };
    
    case 'SET_SELECTED_CATEGORY_ID':
      return { ...state, selectedCategoryId: action.payload };
    
    case 'SET_SORT_FIELD':
      return { ...state, sortField: action.payload };
    
    case 'SET_SORT_DIRECTION':
      return { ...state, sortDirection: action.payload };
    
    case 'TOGGLE_SORT':
      if (state.sortField === action.payload) {
        return {
          ...state,
          sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        ...state,
        sortField: action.payload,
        sortDirection: 'asc',
      };
    
    case 'TOGGLE_PRODUCT_SELECTION': {
      const next = new Set(state.selectedProducts);
      if (next.has(action.payload)) {
        next.delete(action.payload);
      } else {
        next.add(action.payload);
      }
      return { ...state, selectedProducts: next };
    }
    
    case 'SET_SELECTED_PRODUCTS':
      return { ...state, selectedProducts: action.payload };
    
    case 'CLEAR_SELECTED_PRODUCTS':
      return { ...state, selectedProducts: new Set() };
    
    case 'OPEN_CREATE_WIZARD':
      return {
        ...state,
        wizard: {
          mode: 'create',
          initialProductId: null,
          show: true,
          useSimplifiedCreator: action.payload.simplified,
        },
      };
    
    case 'OPEN_DUPLICATE_WIZARD':
      return {
        ...state,
        wizard: {
          mode: 'duplicate',
          initialProductId: action.payload.productId,
          show: true,
          useSimplifiedCreator: false,
        },
      };
    
    case 'CLOSE_WIZARD':
      return {
        ...state,
        wizard: {
          ...initialState.wizard,
        },
      };
    
    case 'SET_SETUP_STATUS_MODAL':
      return { ...state, setupStatusModal: action.payload };
    
    case 'SET_DELETING_PRODUCT_ID':
      return { ...state, deletingProductId: action.payload };
    
    case 'SET_CATEGORY_FORM':
      return {
        ...state,
        categoryForm: { ...state.categoryForm, ...action.payload },
      };
    
    case 'RESET_CATEGORY_FORM':
      return { ...state, categoryForm: initialState.categoryForm };
    
    case 'SET_PRODUCT_FORM':
      return {
        ...state,
        productForm: { ...state.productForm, ...action.payload },
      };
    
    case 'RESET_PRODUCT_FORM':
      return { ...state, productForm: initialState.productForm };
    
    default:
      return state;
  }
}

// Хук
export function useProductManagementState() {
  const [state, dispatch] = useReducer(productManagementReducer, initialState);

  // Действия
  const setQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_QUERY', payload: query });
  }, []);

  const setShowOnlyActive = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_ONLY_ACTIVE', payload: show });
  }, []);

  const setSelectedCategoryId = useCallback((id: number | null) => {
    dispatch({ type: 'SET_SELECTED_CATEGORY_ID', payload: id });
  }, []);

  const toggleSort = useCallback((field: 'name' | 'category' | 'updated') => {
    dispatch({ type: 'TOGGLE_SORT', payload: field });
  }, []);

  const toggleProductSelection = useCallback((productId: number) => {
    dispatch({ type: 'TOGGLE_PRODUCT_SELECTION', payload: productId });
  }, []);

  const setSelectedProducts = useCallback((products: Set<number>) => {
    dispatch({ type: 'SET_SELECTED_PRODUCTS', payload: products });
  }, []);

  const clearSelectedProducts = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTED_PRODUCTS' });
  }, []);

  const openCreateWizard = useCallback((simplified: boolean = true) => {
    dispatch({ type: 'OPEN_CREATE_WIZARD', payload: { simplified } });
  }, []);

  const openDuplicateWizard = useCallback((productId: number) => {
    dispatch({ type: 'OPEN_DUPLICATE_WIZARD', payload: { productId } });
  }, []);

  const closeWizard = useCallback(() => {
    dispatch({ type: 'CLOSE_WIZARD' });
  }, []);

  const setSetupStatusModal = useCallback((productId: number | null) => {
    dispatch({ type: 'SET_SETUP_STATUS_MODAL', payload: productId });
  }, []);

  const setDeletingProductId = useCallback((productId: number | null) => {
    dispatch({ type: 'SET_DELETING_PRODUCT_ID', payload: productId });
  }, []);

  const setCategoryForm = useCallback((form: Partial<ProductManagementState['categoryForm']>) => {
    dispatch({ type: 'SET_CATEGORY_FORM', payload: form });
  }, []);

  const resetCategoryForm = useCallback(() => {
    dispatch({ type: 'RESET_CATEGORY_FORM' });
  }, []);

  const setProductForm = useCallback((form: Partial<ProductManagementState['productForm']>) => {
    dispatch({ type: 'SET_PRODUCT_FORM', payload: form });
  }, []);

  const resetProductForm = useCallback(() => {
    dispatch({ type: 'RESET_PRODUCT_FORM' });
  }, []);

  return {
    // Состояние
    state,
    
    // Действия
    setQuery,
    setShowOnlyActive,
    setSelectedCategoryId,
    toggleSort,
    toggleProductSelection,
    setSelectedProducts,
    clearSelectedProducts,
    openCreateWizard,
    openDuplicateWizard,
    closeWizard,
    setSetupStatusModal,
    setDeletingProductId,
    setCategoryForm,
    resetCategoryForm,
    setProductForm,
    resetProductForm,
  };
}

