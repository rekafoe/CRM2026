import { useState, useEffect, useCallback, useReducer } from 'react';
import { apiClient } from '../../../api/client';
import { ProductOperation, AvailableOperation, OperationError } from '../types';

// Типы для состояний
interface OperationsState {
  productOperations: ProductOperation[];
  availableOperations: AvailableOperation[];
  selectedOperationId: number | null;
  addingOperation: boolean;
  deletingOperationId: number | null;
  operationError: OperationError | null;
}

interface BulkModalState {
  isOpen: boolean;
  selected: Set<number>;
  required: Record<number, boolean>;
  adding: boolean;
}

// Actions для bulk modal
type BulkModalAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'SET_SELECTED'; payload: Set<number> }
  | { type: 'SET_REQUIRED'; payload: Record<number, boolean> }
  | { type: 'TOGGLE_SELECTION'; payload: number }
  | { type: 'SET_ADDING'; payload: boolean }
  | { type: 'RESET' };

function bulkModalReducer(state: BulkModalState, action: BulkModalAction): BulkModalState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true };
    case 'CLOSE':
      return { ...state, isOpen: false, selected: new Set(), required: {}, adding: false };
    case 'SET_SELECTED':
      return { ...state, selected: action.payload };
    case 'SET_REQUIRED':
      return { ...state, required: action.payload };
    case 'TOGGLE_SELECTION': {
      const next = new Set(state.selected);
      if (next.has(action.payload)) {
        next.delete(action.payload);
        const { [action.payload]: _, ...rest } = state.required;
        return { ...state, selected: next, required: rest };
      } else {
        next.add(action.payload);
        return { ...state, selected: next, required: { ...state.required, [action.payload]: true } };
      }
    }
    case 'SET_ADDING':
      return { ...state, adding: action.payload };
    case 'RESET':
      return { isOpen: false, selected: new Set(), required: {}, adding: false };
    default:
      return state;
  }
}

export interface UseProductOperationsResult {
  productOperations: ProductOperation[];
  availableOperations: AvailableOperation[];
  selectedOperationId: number | null;
  addingOperation: boolean;
  deletingOperationId: number | null;
  operationError: OperationError | null;
  showBulkModal: boolean;
  bulkSelected: Set<number>;
  bulkRequired: Record<number, boolean>;
  bulkAdding: boolean;
  setSelectedOperationId: (id: number | null) => void;
  setShowBulkModal: (show: boolean) => void;
  setBulkSelected: (selected: Set<number>) => void;
  setBulkRequired: (required: Record<number, boolean>) => void;
  handleAddOperation: () => Promise<void>;
  handleRemoveOperation: (linkId: number) => Promise<void>;
  handleUpdateOperation: (operationId: number, updates: any) => Promise<void>;
  handleBulkAdd: (payload: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>) => Promise<ProductOperation[]>;
  setOperationError: (error: OperationError | null) => void;
}

export function useProductOperations(
  productId: number | undefined,
  onBulkAdd?: (operations: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>) => Promise<any[]>
): UseProductOperationsResult {
  // Основное состояние операций (можно было бы тоже в reducer, но оставим для простоты)
  const [operationsState, setOperationsState] = useState<OperationsState>({
    productOperations: [],
    availableOperations: [],
    selectedOperationId: null,
    addingOperation: false,
    deletingOperationId: null,
    operationError: null
  });

  // Состояние модального окна массового добавления через reducer
  const [bulkModalState, bulkModalDispatch] = useReducer(bulkModalReducer, {
    isOpen: false,
    selected: new Set<number>(),
    required: {},
    adding: false
  });

  // Загрузка операций
  useEffect(() => {
    const loadOps = async () => {
      if (!productId) return;
      
      setOperationsState(prev => ({ ...prev, operationError: null }));
      
      try {
        const [opsResponse, availableResponse] = await Promise.all([
          apiClient.get(`/products/${productId}/operations`),
          apiClient.get('/operations')
        ]);
        
        const ops = opsResponse.data?.data || opsResponse.data || [];
        const available = availableResponse.data?.data || availableResponse.data || [];
        
        setOperationsState(prev => ({
          ...prev,
          productOperations: Array.isArray(ops) ? ops : [],
          availableOperations: Array.isArray(available) ? available : []
        }));
      } catch (error: any) {
        console.error('Error loading operations:', error);
        setOperationsState(prev => ({
          ...prev,
          operationError: {
            type: 'load',
            message: error?.response?.data?.message || 'Не удалось загрузить операции. Обновите страницу.'
          },
          productOperations: [],
          availableOperations: []
        }));
      }
    };
    
    loadOps();
  }, [productId]);

  const handleAddOperation = useCallback(async () => {
    if (!operationsState.selectedOperationId || !productId) return;
    
    setOperationsState(prev => ({ ...prev, operationError: null }));
    
    try {
      setOperationsState(prev => ({ ...prev, addingOperation: true }));
      await apiClient.post(`/products/${productId}/operations`, {
        operation_id: operationsState.selectedOperationId,
        sequence: operationsState.productOperations.length + 1,
        is_required: true,
        is_default: true,
        price_multiplier: 1.0
      });
      
      // Перезагружаем список операций
      const response = await apiClient.get(`/products/${productId}/operations`);
      const ops = response.data?.data || response.data || [];
      setOperationsState(prev => ({
        ...prev,
        productOperations: Array.isArray(ops) ? ops : [],
        selectedOperationId: null,
        addingOperation: false
      }));
    } catch (error: any) {
      console.error('Error adding operation:', error);
      setOperationsState(prev => ({
        ...prev,
        operationError: {
          type: 'add',
          message: error?.response?.data?.message || 'Не удалось добавить операцию. Попробуйте еще раз.'
        },
        addingOperation: false
      }));
    }
  }, [operationsState.selectedOperationId, operationsState.productOperations.length, productId]);

  const handleRemoveOperation = useCallback(async (linkId: number) => {
    if (!confirm('Удалить эту операцию?') || !productId) return;
    
    setOperationsState(prev => ({ ...prev, operationError: null }));
    
    try {
      setOperationsState(prev => ({ ...prev, deletingOperationId: linkId }));
      await apiClient.delete(`/products/${productId}/operations/${linkId}`);
      
      // Перезагружаем список операций
      const response = await apiClient.get(`/products/${productId}/operations`);
      const ops = response.data?.data || response.data || [];
      setOperationsState(prev => ({
        ...prev,
        productOperations: Array.isArray(ops) ? ops : [],
        deletingOperationId: null
      }));
    } catch (error: any) {
      console.error('Error removing operation:', error);
      setOperationsState(prev => ({
        ...prev,
        operationError: {
          type: 'remove',
          message: error?.response?.data?.message || 'Не удалось удалить операцию. Попробуйте еще раз.'
        },
        deletingOperationId: null
      }));
    }
  }, [productId]);

  const handleBulkAdd = useCallback(async (payload: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>): Promise<ProductOperation[]> => {
    if (!productId || !onBulkAdd) {
      return operationsState.productOperations;
    }

    try {
      bulkModalDispatch({ type: 'SET_ADDING', payload: true } as BulkModalAction);
      const updated = await onBulkAdd(payload);
      // Обновляем состояние из ответа API
      if (Array.isArray(updated)) {
        setOperationsState(prev => ({ ...prev, productOperations: updated }));
        bulkModalDispatch({ type: 'CLOSE' } as BulkModalAction);
        return updated;
      }
      // Если ответ не массив, перезагружаем операции
      const response = await apiClient.get(`/products/${productId}/operations`);
      const ops = response.data?.data || response.data || [];
      const finalOps = Array.isArray(ops) ? ops : [];
      setOperationsState(prev => ({ ...prev, productOperations: finalOps }));
      bulkModalDispatch({ type: 'CLOSE' } as BulkModalAction);
      return finalOps;
    } catch (error) {
      console.error('Bulk add operations failed', error);
      throw error;
    } finally {
      bulkModalDispatch({ type: 'SET_ADDING', payload: false } as BulkModalAction);
    }
  }, [productId, onBulkAdd, operationsState.productOperations]);

  // Вспомогательные функции для совместимости со старым API
  const setSelectedOperationId = useCallback((id: number | null) => {
    setOperationsState(prev => ({ ...prev, selectedOperationId: id }));
  }, []);

  const setShowBulkModal = useCallback((show: boolean) => {
    if (show) {
      bulkModalDispatch({ type: 'OPEN' });
    } else {
      bulkModalDispatch({ type: 'CLOSE' });
    }
  }, []);

  const setBulkSelected = useCallback((selected: Set<number>) => {
    bulkModalDispatch({ type: 'SET_SELECTED', payload: selected } as BulkModalAction);
  }, []);

  const setBulkRequired = useCallback((required: Record<number, boolean>) => {
    bulkModalDispatch({ type: 'SET_REQUIRED', payload: required } as BulkModalAction);
  }, []);

  const handleUpdateOperation = useCallback(async (operationId: number, updates: any) => {
    if (!productId) return;
    
    setOperationsState(prev => ({ ...prev, operationError: null }));
    
    try {
      await apiClient.put(`/products/${productId}/operations/${operationId}`, updates);
      
      // Перезагружаем список операций
      const response = await apiClient.get(`/products/${productId}/operations`);
      const ops = response.data?.data || response.data || [];
      setOperationsState(prev => ({
        ...prev,
        productOperations: Array.isArray(ops) ? ops : []
      }));
    } catch (error: any) {
      console.error('Error updating operation:', error);
      setOperationsState(prev => ({
        ...prev,
        operationError: {
          type: 'update',
          message: error?.response?.data?.message || 'Не удалось обновить операцию'
        }
      }));
      throw error;
    }
  }, [productId]);

  const setOperationError = useCallback((error: OperationError | null) => {
    setOperationsState(prev => ({ ...prev, operationError: error }));
  }, []);

  return {
    productOperations: operationsState.productOperations,
    availableOperations: operationsState.availableOperations,
    selectedOperationId: operationsState.selectedOperationId,
    addingOperation: operationsState.addingOperation,
    deletingOperationId: operationsState.deletingOperationId,
    operationError: operationsState.operationError,
    showBulkModal: bulkModalState.isOpen,
    bulkSelected: bulkModalState.selected,
    bulkRequired: bulkModalState.required,
    bulkAdding: bulkModalState.adding,
    setSelectedOperationId,
    setShowBulkModal,
    setBulkSelected,
    setBulkRequired,
    handleAddOperation,
    handleRemoveOperation,
    handleUpdateOperation,
    handleBulkAdd,
    setOperationError
  };
}
