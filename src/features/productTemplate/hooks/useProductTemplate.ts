import { useReducer } from 'react'

export type PriceRule = { min_qty: number; max_qty?: number; unit_price?: number; discount_percent?: number }

export interface TemplateState {
  meta: { name: string; description: string; icon: string }
  trim_size: { width: string; height: string }
  print_sheet: { preset: 'SRA3' | 'A3' | 'А4' | '' ; width: string; height: string }
  constraints: {
    materials: {
      allowedCategoriesCsv: string
      densityMin: string
      densityMax: string
      finishesCsv: string
      onlyPaper: boolean
    }
    overrides: {
      includeIds: number[] // Старое поле для обратной совместимости
      allowedPaperTypes: string[] // Новое поле для типов бумаги из склада
    }
  }
  finishing: Array<{ name: string }>
  packaging: Array<{ name: string }>
  print_run: { enabled: boolean; min: number | ''; max: number | '' }
  price_rules: PriceRule[]
  test: { qty: number; params: Record<string, any>; paramsJson: string }
}

type Action =
  | { type: 'setTrim'; field: 'width' | 'height'; value: string }
  | { type: 'setMeta'; patch: Partial<TemplateState['meta']> }
  | { type: 'setFinishing'; value: Array<{ name: string }> }
  | { type: 'setPackaging'; value: Array<{ name: string }> }
  | { type: 'setRun'; patch: Partial<TemplateState['print_run']> }
  | { type: 'setPrintSheet'; patch: Partial<TemplateState['print_sheet']> }
  | { type: 'setMaterialsConstraints'; patch: Partial<TemplateState['constraints']['materials']> }
  | { type: 'setOverrides'; patch: Partial<TemplateState['constraints']['overrides']> }
  | { type: 'setRules'; value: PriceRule[] }
  | { type: 'addRule'; rule: PriceRule }
  | { type: 'updateRule'; index: number; patch: Partial<PriceRule> }
  | { type: 'removeRule'; index: number }
  | { type: 'setTestQty'; value: number }
  | { type: 'setTestParams'; value: Record<string, any> }
  | { type: 'setTestJson'; value: string }

function reducer(state: TemplateState, action: Action): TemplateState {
  switch (action.type) {
    case 'setTrim':
      return { ...state, trim_size: { ...state.trim_size, [action.field]: action.value } }
    case 'setMeta':
      return { ...state, meta: { ...state.meta, ...action.patch } }
    case 'setFinishing':
      return { ...state, finishing: action.value }
    case 'setPrintSheet':
      return { ...state, print_sheet: { ...state.print_sheet, ...action.patch } }
    case 'setMaterialsConstraints':
      return { ...state, constraints: { ...state.constraints, materials: { ...state.constraints.materials, ...action.patch } } }
    case 'setOverrides':
      return { ...state, constraints: { ...state.constraints, overrides: { ...state.constraints.overrides, ...action.patch } } }
    case 'setPackaging':
      return { ...state, packaging: action.value }
    case 'setRun':
      return { ...state, print_run: { ...state.print_run, ...action.patch } }
    case 'setRules':
      return { ...state, price_rules: action.value }
    case 'addRule':
      return { ...state, price_rules: [...state.price_rules, action.rule] }
    case 'updateRule':
      return { ...state, price_rules: state.price_rules.map((r, i) => (i === action.index ? { ...r, ...action.patch } : r)) }
    case 'removeRule':
      return { ...state, price_rules: state.price_rules.filter((_, i) => i !== action.index) }
    case 'setTestQty':
      return { ...state, test: { ...state.test, qty: action.value } }
    case 'setTestParams':
      return { ...state, test: { ...state.test, params: action.value, paramsJson: JSON.stringify(action.value) } }
    case 'setTestJson':
      return { ...state, test: { ...state.test, paramsJson: action.value } }
    default:
      return state
  }
}

export function useProductTemplateInitial(): TemplateState {
  return {
    meta: { name: '', description: '', icon: '' },
    trim_size: { width: '', height: '' },
    print_sheet: { preset: '', width: '', height: '' },
    constraints: {
      materials: { allowedCategoriesCsv: '', densityMin: '', densityMax: '', finishesCsv: '', onlyPaper: true },
      overrides: { includeIds: [], allowedPaperTypes: [] }
    },
    finishing: [],
    packaging: [],
    print_run: { enabled: false, min: '', max: '' },
    price_rules: [],
    test: { qty: 100, params: {}, paramsJson: '{}' }
  }
}

export default function useProductTemplate() {
  return useReducer(reducer, undefined as unknown as TemplateState, useProductTemplateInitial)
}


