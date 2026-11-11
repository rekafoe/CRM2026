/**
 * Хук для управления состоянием ProductManagement.
 * Фильтры и сортировка живут в query (useProductListFilters), здесь — выбор и модалки.
 */

import { useReducer, useCallback } from 'react';

interface ProductManagementState {
  selectedProducts: Set<number>;

  wizard: {
    show: boolean;
  };

  setupStatusModal: number | null;
  deletingProductId: number | null;

  categoryForm: {
    name: string;
    icon: string;
    image_url: string;
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

type ProductManagementAction =
  | { type: 'TOGGLE_PRODUCT_SELECTION'; payload: number }
  | { type: 'SET_SELECTED_PRODUCTS'; payload: Set<number> }
  | { type: 'CLEAR_SELECTED_PRODUCTS' }
  | { type: 'OPEN_CREATE_WIZARD' }
  | { type: 'CLOSE_WIZARD' }
  | { type: 'SET_SETUP_STATUS_MODAL'; payload: number | null }
  | { type: 'SET_DELETING_PRODUCT_ID'; payload: number | null }
  | { type: 'SET_CATEGORY_FORM'; payload: Partial<ProductManagementState['categoryForm']> }
  | { type: 'RESET_CATEGORY_FORM' }
  | { type: 'SET_PRODUCT_FORM'; payload: Partial<ProductManagementState['productForm']> }
  | { type: 'RESET_PRODUCT_FORM' };

const initialState: ProductManagementState = {
  selectedProducts: new Set(),
  wizard: {
    show: false,
  },
  setupStatusModal: null,
  deletingProductId: null,
  categoryForm: {
    name: '',
    icon: '',
    image_url: '',
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

function productManagementReducer(
  state: ProductManagementState,
  action: ProductManagementAction
): ProductManagementState {
  switch (action.type) {
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
        wizard: { show: true },
      };

    case 'CLOSE_WIZARD':
      return {
        ...state,
        wizard: { ...initialState.wizard },
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

export function useProductManagementState() {
  const [state, dispatch] = useReducer(productManagementReducer, initialState);

  const toggleProductSelection = useCallback((productId: number) => {
    dispatch({ type: 'TOGGLE_PRODUCT_SELECTION', payload: productId });
  }, []);

  const setSelectedProducts = useCallback((products: Set<number>) => {
    dispatch({ type: 'SET_SELECTED_PRODUCTS', payload: products });
  }, []);

  const clearSelectedProducts = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTED_PRODUCTS' });
  }, []);

  const openCreateWizard = useCallback(() => {
    dispatch({ type: 'OPEN_CREATE_WIZARD' });
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
    state,
    toggleProductSelection,
    setSelectedProducts,
    clearSelectedProducts,
    openCreateWizard,
    closeWizard,
    setSetupStatusModal,
    setDeletingProductId,
    setCategoryForm,
    resetCategoryForm,
    setProductForm,
    resetProductForm,
  };
}
