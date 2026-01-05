import { useReducer, useCallback } from 'react'

export interface PrintPrice {
  id: number
  technology_code: string
  counter_unit: 'sheets' | 'meters'
  price_bw_single: number | null
  price_bw_duplex: number | null
  price_color_single: number | null
  price_color_duplex: number | null
  price_bw_per_meter: number | null
  price_color_per_meter: number | null
  is_active: number
}

export interface ServicePrice {
  id: number
  service_name: string
  price_per_unit: number
  unit: string
  is_active: boolean
}

export interface MarkupSetting {
  id: number
  setting_name: string
  setting_value: number
  description: string
  is_active: boolean
}

export interface QuantityDiscount {
  id: number
  min_quantity: number
  max_quantity: number | null
  discount_percent: number
  description: string
  is_active: boolean
}

export type PricingItemType = 'print-prices' | 'service-prices' | 'markup-settings' | 'quantity-discounts'

export type EditingItem = 
  | (PrintPrice & { type: 'print-prices' })
  | (ServicePrice & { type: 'service-prices' })
  | (MarkupSetting & { type: 'markup-settings' })
  | (QuantityDiscount & { type: 'quantity-discounts' })
  | null

// Используем Record<string, unknown> вместо any для строгой типизации
export type EditingValues = Record<string, unknown>

export interface PricingManagementState {
  printPrices: PrintPrice[]
  servicePrices: ServicePrice[]
  markupSettings: MarkupSetting[]
  quantityDiscounts: QuantityDiscount[]
  loading: boolean
  error: string | null
  successMessage: string | null
  activeTab: 'tech' | 'printers' | 'print' | 'services' | 'markup' | 'discounts'
  editingItem: EditingItem
  editingValues: EditingValues
  searchTerm: string
}

type PricingAction =
  | { type: 'SET_PRINT_PRICES'; payload: PrintPrice[] }
  | { type: 'SET_SERVICE_PRICES'; payload: ServicePrice[] }
  | { type: 'SET_MARKUP_SETTINGS'; payload: MarkupSetting[] }
  | { type: 'SET_QUANTITY_DISCOUNTS'; payload: QuantityDiscount[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SUCCESS'; payload: string | null }
  | { type: 'SET_ACTIVE_TAB'; payload: PricingManagementState['activeTab'] }
  | { type: 'SET_EDITING_ITEM'; payload: EditingItem }
  | { type: 'SET_EDITING_VALUES'; payload: EditingValues }
  | { type: 'SET_SEARCH_TERM'; payload: string }

const createInitialState = (initialTab: PricingManagementState['activeTab']): PricingManagementState => ({
  printPrices: [],
  servicePrices: [],
  markupSettings: [],
  quantityDiscounts: [],
  loading: false,
  error: null,
  successMessage: null,
  activeTab: initialTab,
  editingItem: null,
  editingValues: {},
  searchTerm: '',
})

function reducer(state: PricingManagementState, action: PricingAction): PricingManagementState {
  switch (action.type) {
    case 'SET_PRINT_PRICES':
      return { ...state, printPrices: action.payload }
    case 'SET_SERVICE_PRICES':
      return { ...state, servicePrices: action.payload }
    case 'SET_MARKUP_SETTINGS':
      return { ...state, markupSettings: action.payload }
    case 'SET_QUANTITY_DISCOUNTS':
      return { ...state, quantityDiscounts: action.payload }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_SUCCESS':
      return { ...state, successMessage: action.payload }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload }
    case 'SET_EDITING_ITEM':
      return { ...state, editingItem: action.payload }
    case 'SET_EDITING_VALUES':
      return { ...state, editingValues: action.payload }
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload }
    default:
      return state
  }
}

export const usePricingManagementState = (initialTab: PricingManagementState['activeTab'] = 'tech') => {
  const [state, dispatch] = useReducer(reducer, createInitialState(initialTab))

  const setPrintPrices = useCallback((items: PrintPrice[]) => {
    dispatch({ type: 'SET_PRINT_PRICES', payload: items })
  }, [])

  const setServicePrices = useCallback((items: ServicePrice[]) => {
    dispatch({ type: 'SET_SERVICE_PRICES', payload: items })
  }, [])

  const setMarkupSettings = useCallback((items: MarkupSetting[]) => {
    dispatch({ type: 'SET_MARKUP_SETTINGS', payload: items })
  }, [])

  const setQuantityDiscounts = useCallback((items: QuantityDiscount[]) => {
    dispatch({ type: 'SET_QUANTITY_DISCOUNTS', payload: items })
  }, [])

  const setLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: value })
  }, [])

  const setError = useCallback((message: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: message })
  }, [])

  const setSuccessMessage = useCallback((message: string | null) => {
    dispatch({ type: 'SET_SUCCESS', payload: message })
  }, [])

  const setActiveTab = useCallback((tab: 'tech' | 'printers' | 'print' | 'services' | 'markup' | 'discounts') => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab })
  }, [])

  const setEditingItem = useCallback((item: EditingItem) => {
    dispatch({ type: 'SET_EDITING_ITEM', payload: item })
  }, [])

  const setEditingValues = useCallback((values: EditingValues) => {
    dispatch({ type: 'SET_EDITING_VALUES', payload: values })
  }, [])

  const setSearchTerm = useCallback((term: string) => {
    dispatch({ type: 'SET_SEARCH_TERM', payload: term })
  }, [])

  return {
    state,
    setPrintPrices,
    setServicePrices,
    setMarkupSettings,
    setQuantityDiscounts,
    setLoading,
    setError,
    setSuccessMessage,
    setActiveTab,
    setEditingItem,
    setEditingValues,
    setSearchTerm,
  }
}

