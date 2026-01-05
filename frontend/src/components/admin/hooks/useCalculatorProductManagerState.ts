import { useReducer, useCallback } from 'react'

export interface ProductType {
  key: string
  name: string
  status: string
  created_at: string
}

export interface ProductSchema {
  key: string
  name: string
  parameters: Record<string, any>
  operations: Array<{
    operation: string
    service_id?: number
    service: string
    type: string
    unit: string
    rate: number
    formula: string
  }>
}

export interface Service {
  id: number
  name: string
  unit: string
  rate: number
  currency: string
  is_active: boolean
}

export interface CalculationTest {
  productType: string
  specifications: any
  quantity: number
  priceType?: string
  customerType?: string
}

export interface CalculatorProductManagerState {
  loading: boolean
  error: string | null
  successMessage: string | null
  activeTab: 'products' | 'test' | 'analytics'
  productTypes: ProductType[]
  selectedType: string | null
  schema: ProductSchema | null
  services: Service[]
  showAddModal: boolean
  newProductType: {
    key: string
    name: string
    operations: any[]
  }
  saving: boolean
  testCalculation: CalculationTest
  calcResult: any
  calcLoading: boolean
}

type CalculatorAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SUCCESS'; payload: string | null }
  | { type: 'SET_ACTIVE_TAB'; payload: 'products' | 'test' | 'analytics' }
  | { type: 'SET_PRODUCT_TYPES'; payload: ProductType[] }
  | { type: 'SET_SELECTED_TYPE'; payload: string | null }
  | { type: 'SET_SCHEMA'; payload: ProductSchema | null }
  | { type: 'SET_SERVICES'; payload: Service[] }
  | { type: 'SET_SHOW_ADD_MODAL'; payload: boolean }
  | { type: 'SET_NEW_PRODUCT_TYPE'; payload: Partial<CalculatorProductManagerState['newProductType']> }
  | { type: 'RESET_NEW_PRODUCT_TYPE' }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_TEST_CALCULATION'; payload: CalculationTest }
  | { type: 'SET_CALC_RESULT'; payload: any }
  | { type: 'SET_CALC_LOADING'; payload: boolean }

const initialState: CalculatorProductManagerState = {
  loading: false,
  error: null,
  successMessage: null,
  activeTab: 'products',
  productTypes: [],
  selectedType: null,
  schema: null,
  services: [],
  showAddModal: false,
  newProductType: {
    key: '',
    name: '',
    operations: [],
  },
  saving: false,
  testCalculation: {
    productType: 'flyers',
    specifications: {
      format: 'A6',
      quantity: 100,
      sides: 1,
      paperType: 'semi-matte',
      paperDensity: 150,
      lamination: 'none',
    },
    quantity: 100,
    priceType: 'online',
    customerType: 'regular',
  },
  calcResult: null,
  calcLoading: false,
}

function reducer(state: CalculatorProductManagerState, action: CalculatorAction): CalculatorProductManagerState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_SUCCESS':
      return { ...state, successMessage: action.payload }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload }
    case 'SET_PRODUCT_TYPES':
      return { ...state, productTypes: action.payload }
    case 'SET_SELECTED_TYPE':
      return { ...state, selectedType: action.payload }
    case 'SET_SCHEMA':
      return { ...state, schema: action.payload }
    case 'SET_SERVICES':
      return { ...state, services: action.payload }
    case 'SET_SHOW_ADD_MODAL':
      return { ...state, showAddModal: action.payload }
    case 'SET_NEW_PRODUCT_TYPE':
      return {
        ...state,
        newProductType: { ...state.newProductType, ...action.payload },
      }
    case 'RESET_NEW_PRODUCT_TYPE':
      return {
        ...state,
        newProductType: initialState.newProductType,
      }
    case 'SET_SAVING':
      return { ...state, saving: action.payload }
    case 'SET_TEST_CALCULATION':
      return { ...state, testCalculation: action.payload }
    case 'SET_CALC_RESULT':
      return { ...state, calcResult: action.payload }
    case 'SET_CALC_LOADING':
      return { ...state, calcLoading: action.payload }
    default:
      return state
  }
}

export const useCalculatorProductManagerState = () => {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: value })
  }, [])

  const setError = useCallback((message: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: message })
  }, [])

  const setSuccessMessage = useCallback((message: string | null) => {
    dispatch({ type: 'SET_SUCCESS', payload: message })
  }, [])

  const setActiveTab = useCallback((tab: 'products' | 'test' | 'analytics') => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab })
  }, [])

  const setProductTypes = useCallback((types: ProductType[]) => {
    dispatch({ type: 'SET_PRODUCT_TYPES', payload: types })
  }, [])

  const setSelectedType = useCallback((key: string | null) => {
    dispatch({ type: 'SET_SELECTED_TYPE', payload: key })
  }, [])

  const setSchema = useCallback((schema: ProductSchema | null) => {
    dispatch({ type: 'SET_SCHEMA', payload: schema })
  }, [])

  const setServices = useCallback((services: Service[]) => {
    dispatch({ type: 'SET_SERVICES', payload: services })
  }, [])

  const setShowAddModal = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_ADD_MODAL', payload: show })
  }, [])

  const updateNewProductType = useCallback((payload: Partial<CalculatorProductManagerState['newProductType']>) => {
    dispatch({ type: 'SET_NEW_PRODUCT_TYPE', payload })
  }, [])

  const resetNewProductType = useCallback(() => {
    dispatch({ type: 'RESET_NEW_PRODUCT_TYPE' })
  }, [])

  const setSaving = useCallback((saving: boolean) => {
    dispatch({ type: 'SET_SAVING', payload: saving })
  }, [])

  const setTestCalculation = useCallback((value: CalculationTest) => {
    dispatch({ type: 'SET_TEST_CALCULATION', payload: value })
  }, [])

  const setCalcResult = useCallback((result: any) => {
    dispatch({ type: 'SET_CALC_RESULT', payload: result })
  }, [])

  const setCalcLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_CALC_LOADING', payload: loading })
  }, [])

  return {
    state,
    setLoading,
    setError,
    setSuccessMessage,
    setActiveTab,
    setProductTypes,
    setSelectedType,
    setSchema,
    setServices,
    setShowAddModal,
    updateNewProductType,
    resetNewProductType,
    setSaving,
    setTestCalculation,
    setCalcResult,
    setCalcLoading,
  }
}

