/**
 * Хук для управления состоянием ServicesManagement
 * Заменяет множество useState на единый useReducer
 */

import { useReducer, useCallback } from 'react';
import { PricingService, ServiceVolumeTier } from '../../../types/pricing';
import { ServiceFormState } from '../services/components/ServiceForm';

// Типы состояния
export interface ServicesManagementState {
  // UI состояние
  activeTab: 'services';
  showCreateService: boolean;
  expandedServiceId: number | null;
  
  // Данные
  volumeTiers: Record<number, ServiceVolumeTier[]>;
  
  // Состояния загрузки
  tiersLoading: Record<number, boolean>;
  
  // Сообщения
  actionError: string | null;
  success: string | null;
  
  // Формы
  newServiceForm: ServiceFormState;
  editingService: PricingService | null;
  editingServiceForm: ServiceFormState | null;
  
  // Фильтры и сортировка
  serviceSearch: string;
  typeFilter: string;
  sortBy: 'name' | 'price' | 'type';
  sortOrder: 'asc' | 'desc';
}

// Типы действий
type ServicesManagementAction =
  | { type: 'SET_ACTIVE_TAB'; payload: 'services' }
  | { type: 'SET_SHOW_CREATE_SERVICE'; payload: boolean }
  | { type: 'SET_EXPANDED_SERVICE_ID'; payload: number | null }
  | { type: 'SET_VOLUME_TIERS'; payload: { serviceId: number; tiers: ServiceVolumeTier[] } }
  | { type: 'REMOVE_VOLUME_TIERS'; payload: number }
  | { type: 'SET_TIERS_LOADING'; payload: { serviceId: number; loading: boolean } }
  | { type: 'SET_ACTION_ERROR'; payload: string | null }
  | { type: 'SET_SUCCESS'; payload: string | null }
  | { type: 'SET_NEW_SERVICE_FORM'; payload: Partial<ServiceFormState> }
  | { type: 'RESET_NEW_SERVICE_FORM'; payload: ServiceFormState }
  | { type: 'SET_EDITING_SERVICE'; payload: PricingService | null }
  | { type: 'SET_EDITING_SERVICE_FORM'; payload: ServiceFormState | null }
  | { type: 'RESET_EDITING_SERVICE' }
  | { type: 'SET_SERVICE_SEARCH'; payload: string }
  | { type: 'SET_TYPE_FILTER'; payload: string }
  | { type: 'SET_SORT_BY'; payload: 'name' | 'price' | 'type' }
  | { type: 'SET_SORT_ORDER'; payload: 'asc' | 'desc' }
  | { type: 'CLEAR_MESSAGES' };

// Начальное состояние
const initialState: ServicesManagementState = {
  activeTab: 'services',
  showCreateService: false,
  expandedServiceId: null,
  volumeTiers: {},
  tiersLoading: {},
  actionError: null,
  success: null,
  newServiceForm: {
    name: '',
    type: 'postprint',
    unit: 'item',
    rate: '',
    isActive: true,
  },
  editingService: null,
  editingServiceForm: null,
  serviceSearch: '',
  typeFilter: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
};

// Reducer
function servicesManagementReducer(
  state: ServicesManagementState,
  action: ServicesManagementAction
): ServicesManagementState {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    
    case 'SET_SHOW_CREATE_SERVICE':
      return { ...state, showCreateService: action.payload };
    
    case 'SET_EXPANDED_SERVICE_ID':
      return { ...state, expandedServiceId: action.payload };
    
    case 'SET_VOLUME_TIERS':
      return {
        ...state,
        volumeTiers: {
          ...state.volumeTiers,
          [action.payload.serviceId]: action.payload.tiers,
        },
      };
    
    case 'REMOVE_VOLUME_TIERS': {
      const { [action.payload]: _, ...rest } = state.volumeTiers;
      return { ...state, volumeTiers: rest };
    }
    
    case 'SET_TIERS_LOADING':
      return {
        ...state,
        tiersLoading: {
          ...state.tiersLoading,
          [action.payload.serviceId]: action.payload.loading,
        },
      };
    
    case 'SET_ACTION_ERROR':
      return { ...state, actionError: action.payload };
    
    case 'SET_SUCCESS':
      return { ...state, success: action.payload };
    
    case 'SET_NEW_SERVICE_FORM':
      return {
        ...state,
        newServiceForm: { ...state.newServiceForm, ...action.payload },
      };
    
    case 'RESET_NEW_SERVICE_FORM':
      return { ...state, newServiceForm: action.payload };
    
    case 'SET_EDITING_SERVICE':
      return { ...state, editingService: action.payload };
    
    case 'SET_EDITING_SERVICE_FORM':
      return { ...state, editingServiceForm: action.payload };
    
    case 'RESET_EDITING_SERVICE':
      return {
        ...state,
        editingService: null,
        editingServiceForm: null,
      };
    
    case 'SET_SERVICE_SEARCH':
      return { ...state, serviceSearch: action.payload };
    
    case 'SET_TYPE_FILTER':
      return { ...state, typeFilter: action.payload };
    
    case 'SET_SORT_BY':
      return { ...state, sortBy: action.payload };
    
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.payload };
    
    case 'CLEAR_MESSAGES':
      return { ...state, actionError: null, success: null };
    
    default:
      return state;
  }
}

// Хук
export const useServicesManagementState = () => {
  const [state, dispatch] = useReducer(servicesManagementReducer, initialState);

  const setActiveTab = useCallback((tab: 'services') => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
  }, []);

  const setShowCreateService = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_CREATE_SERVICE', payload: show });
  }, []);

  const setExpandedServiceId = useCallback((id: number | null) => {
    dispatch({ type: 'SET_EXPANDED_SERVICE_ID', payload: id });
  }, []);

  const setVolumeTiers = useCallback((serviceId: number, tiers: ServiceVolumeTier[]) => {
    dispatch({ type: 'SET_VOLUME_TIERS', payload: { serviceId, tiers } });
  }, []);

  const removeVolumeTiers = useCallback((serviceId: number) => {
    dispatch({ type: 'REMOVE_VOLUME_TIERS', payload: serviceId });
  }, []);

  const setTiersLoading = useCallback((serviceId: number, loading: boolean) => {
    dispatch({ type: 'SET_TIERS_LOADING', payload: { serviceId, loading } });
  }, []);

  const setActionError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ACTION_ERROR', payload: error });
  }, []);

  const setSuccess = useCallback((message: string | null) => {
    dispatch({ type: 'SET_SUCCESS', payload: message });
  }, []);

  const setNewServiceForm = useCallback((form: Partial<ServiceFormState>) => {
    dispatch({ type: 'SET_NEW_SERVICE_FORM', payload: form });
  }, []);

  const resetNewServiceForm = useCallback((emptyForm: ServiceFormState) => {
    dispatch({ type: 'RESET_NEW_SERVICE_FORM', payload: emptyForm });
  }, []);

  const setEditingService = useCallback((service: PricingService | null) => {
    dispatch({ type: 'SET_EDITING_SERVICE', payload: service });
  }, []);

  const setEditingServiceForm = useCallback((form: ServiceFormState | null) => {
    dispatch({ type: 'SET_EDITING_SERVICE_FORM', payload: form });
  }, []);

  const resetEditingService = useCallback(() => {
    dispatch({ type: 'RESET_EDITING_SERVICE' });
  }, []);

  const setServiceSearch = useCallback((search: string) => {
    dispatch({ type: 'SET_SERVICE_SEARCH', payload: search });
  }, []);

  const setTypeFilter = useCallback((filter: string) => {
    dispatch({ type: 'SET_TYPE_FILTER', payload: filter });
  }, []);

  const setSortBy = useCallback((sortBy: 'name' | 'price' | 'type') => {
    dispatch({ type: 'SET_SORT_BY', payload: sortBy });
  }, []);

  const setSortOrder = useCallback((order: 'asc' | 'desc') => {
    dispatch({ type: 'SET_SORT_ORDER', payload: order });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  return {
    state,
    setActiveTab,
    setShowCreateService,
    setExpandedServiceId,
    setVolumeTiers,
    removeVolumeTiers,
    setTiersLoading,
    setActionError,
    setSuccess,
    setNewServiceForm,
    resetNewServiceForm,
    setEditingService,
    setEditingServiceForm,
    resetEditingService,
    setServiceSearch,
    setTypeFilter,
    setSortBy,
    setSortOrder,
    clearMessages,
  };
};

