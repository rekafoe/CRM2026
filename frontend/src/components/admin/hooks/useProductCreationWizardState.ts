/**
 * Хук для управления состоянием ProductCreationWizard
 * Рефакторинг: использование useReducer вместо множества useState
 */

import { useReducer, useCallback } from 'react';
import { ProductParameterPreset } from '../../../services/products';

// Типы состояния
export interface ParameterDraft {
  name: string;
  type: string;
  label: string;
  options: string;
  min_value?: number;
  max_value?: number;
  step?: number;
  default_value?: string;
  is_required: boolean;
}

export interface TrimSize {
  id: string;
  width: string;
  height: string;
  label?: string;
}

export interface TemplateDraft {
  trim_width: string; // Для обратной совместимости
  trim_height: string; // Для обратной совместимости
  trim_sizes?: TrimSize[]; // Новое поле для нескольких размеров
  print_sheet_preset: string;
  print_sheet_width: string;
  print_sheet_height: string;
  print_run_enabled: boolean;
  print_run_min: string;
  print_run_max: string;
}

export interface FormState {
  category_id: number | null;
  name: string;
  description: string;
  icon: string;
  calculator_type: 'product' | 'operation';
  product_type: string;
  operation_preset: string;
  selectedOperations: Array<{
    operation_id: number;
    is_required: boolean;
    is_default: boolean;
    price_multiplier: number;
  }>;
  selectedMaterials: number[];
  parameters: ParameterDraft[];
  template: TemplateDraft;
}

interface WizardState {
  step: number;
  submitting: boolean;
  prefillLoading: boolean;
  prefillError: string | null;
  parameterPresets: ProductParameterPreset[];
  parameterPresetsLoading: boolean;
  errorMessage: string | null;
  form: FormState;
}

// Типы действий
type WizardAction =
  | { type: 'SET_STEP'; payload: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_PREFILL_LOADING'; payload: boolean }
  | { type: 'SET_PREFILL_ERROR'; payload: string | null }
  | { type: 'SET_PARAMETER_PRESETS'; payload: ProductParameterPreset[] }
  | { type: 'SET_PARAMETER_PRESETS_LOADING'; payload: boolean }
  | { type: 'SET_ERROR_MESSAGE'; payload: string | null }
  | { type: 'SET_FORM'; payload: Partial<FormState> }
  | { type: 'UPDATE_FORM_FIELD'; payload: { field: keyof FormState; value: any } }
  | { type: 'ADD_PARAMETER'; payload: ParameterDraft }
  | { type: 'UPDATE_PARAMETER'; payload: { index: number; patch: Partial<ParameterDraft> } }
  | { type: 'REMOVE_PARAMETER'; payload: number }
  | { type: 'TOGGLE_MATERIAL'; payload: number }
  | { type: 'ADD_OPERATION'; payload: FormState['selectedOperations'][0] }
  | { type: 'REMOVE_OPERATION'; payload: number }
  | { type: 'RESET_FORM'; payload: FormState }
  | { type: 'RESET_ALL' };

// Начальное состояние
const initialTemplateState: TemplateDraft = {
  trim_width: '',
  trim_height: '',
  print_sheet_preset: '',
  print_sheet_width: '',
  print_sheet_height: '',
  print_run_enabled: false,
  print_run_min: '',
  print_run_max: '',
};

export function createInitialFormState(initialCategoryId: number | null): FormState {
  return {
    category_id: initialCategoryId,
    name: '',
    description: '',
    icon: '',
    calculator_type: 'product',
    product_type: 'sheet_single',
    operation_preset: 'business_cards',
    selectedOperations: [],
    selectedMaterials: [],
    parameters: [],
    template: initialTemplateState,
  };
}

const createInitialState = (initialCategoryId: number | null): WizardState => ({
  step: 1,
  submitting: false,
  prefillLoading: false,
  prefillError: null,
  parameterPresets: [],
  parameterPresetsLoading: false,
  errorMessage: null,
  form: createInitialFormState(initialCategoryId),
});

// Reducer
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };
    
    case 'NEXT_STEP':
      return { ...state, step: Math.min(state.step + 1, 5) };
    
    case 'PREV_STEP':
      return { ...state, step: Math.max(state.step - 1, 1) };
    
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.payload };
    
    case 'SET_PREFILL_LOADING':
      return { ...state, prefillLoading: action.payload };
    
    case 'SET_PREFILL_ERROR':
      return { ...state, prefillError: action.payload };
    
    case 'SET_PARAMETER_PRESETS':
      return { ...state, parameterPresets: action.payload };
    
    case 'SET_PARAMETER_PRESETS_LOADING':
      return { ...state, parameterPresetsLoading: action.payload };
    
    case 'SET_ERROR_MESSAGE':
      return { ...state, errorMessage: action.payload };
    
    case 'SET_FORM':
      return { ...state, form: { ...state.form, ...action.payload } };
    
    case 'UPDATE_FORM_FIELD':
      return {
        ...state,
        form: { ...state.form, [action.payload.field]: action.payload.value },
      };
    
    case 'ADD_PARAMETER':
      return {
        ...state,
        form: {
          ...state.form,
          parameters: [...state.form.parameters, action.payload],
        },
      };
    
    case 'UPDATE_PARAMETER':
      return {
        ...state,
        form: {
          ...state.form,
          parameters: state.form.parameters.map((param, i) =>
            i === action.payload.index
              ? { ...param, ...action.payload.patch }
              : param
          ),
        },
      };
    
    case 'REMOVE_PARAMETER':
      return {
        ...state,
        form: {
          ...state.form,
          parameters: state.form.parameters.filter((_, i) => i !== action.payload),
        },
      };
    
    case 'TOGGLE_MATERIAL': {
      const materialId = action.payload;
      const isSelected = state.form.selectedMaterials.includes(materialId);
      return {
        ...state,
        form: {
          ...state.form,
          selectedMaterials: isSelected
            ? state.form.selectedMaterials.filter((id) => id !== materialId)
            : [...state.form.selectedMaterials, materialId],
        },
      };
    }
    
    case 'ADD_OPERATION':
      return {
        ...state,
        form: {
          ...state.form,
          selectedOperations: [...state.form.selectedOperations, action.payload],
        },
      };
    
    case 'REMOVE_OPERATION':
      return {
        ...state,
        form: {
          ...state.form,
          selectedOperations: state.form.selectedOperations.filter(
            (_, i) => i !== action.payload
          ),
        },
      };
    
    case 'RESET_FORM':
      return { ...state, form: action.payload };
    
    case 'RESET_ALL':
      return createInitialState(state.form.category_id);
    
    default:
      return state;
  }
}

// Хук
export function useProductCreationWizardState(initialCategoryId: number | null) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    initialCategoryId,
    createInitialState
  );

  // Действия
  const setStep = useCallback((step: number) => {
    dispatch({ type: 'SET_STEP', payload: step });
  }, []);

  const nextStep = useCallback(() => {
    dispatch({ type: 'NEXT_STEP' });
  }, []);

  const prevStep = useCallback(() => {
    dispatch({ type: 'PREV_STEP' });
  }, []);

  const setSubmitting = useCallback((submitting: boolean) => {
    dispatch({ type: 'SET_SUBMITTING', payload: submitting });
  }, []);

  const setPrefillLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_PREFILL_LOADING', payload: loading });
  }, []);

  const setPrefillError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_PREFILL_ERROR', payload: error });
  }, []);

  const setParameterPresets = useCallback((presets: ProductParameterPreset[]) => {
    dispatch({ type: 'SET_PARAMETER_PRESETS', payload: presets });
  }, []);

  const setParameterPresetsLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_PARAMETER_PRESETS_LOADING', payload: loading });
  }, []);

  const setErrorMessage = useCallback((message: string | null) => {
    dispatch({ type: 'SET_ERROR_MESSAGE', payload: message });
  }, []);

  const setForm = useCallback((form: Partial<FormState>) => {
    dispatch({ type: 'SET_FORM', payload: form });
  }, []);

  const updateFormField = useCallback((field: keyof FormState, value: any) => {
    dispatch({ type: 'UPDATE_FORM_FIELD', payload: { field, value } });
  }, []);

  const addParameter = useCallback((parameter: ParameterDraft) => {
    dispatch({ type: 'ADD_PARAMETER', payload: parameter });
  }, []);

  const updateParameter = useCallback((index: number, patch: Partial<ParameterDraft>) => {
    dispatch({ type: 'UPDATE_PARAMETER', payload: { index, patch } });
  }, []);

  const removeParameter = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_PARAMETER', payload: index });
  }, []);

  const toggleMaterial = useCallback((materialId: number) => {
    dispatch({ type: 'TOGGLE_MATERIAL', payload: materialId });
  }, []);

  const addOperation = useCallback((operation: FormState['selectedOperations'][0]) => {
    dispatch({ type: 'ADD_OPERATION', payload: operation });
  }, []);

  const removeOperation = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_OPERATION', payload: index });
  }, []);

  const resetForm = useCallback((form: FormState) => {
    dispatch({ type: 'RESET_FORM', payload: form });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);

  return {
    // Состояние
    state,
    
    // Действия
    setStep,
    nextStep,
    prevStep,
    setSubmitting,
    setPrefillLoading,
    setPrefillError,
    setParameterPresets,
    setParameterPresetsLoading,
    setErrorMessage,
    setForm,
    updateFormField,
    addParameter,
    updateParameter,
    removeParameter,
    toggleMaterial,
    addOperation,
    removeOperation,
    resetForm,
    resetAll,
  };
}

