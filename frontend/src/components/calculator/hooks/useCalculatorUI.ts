import { useCallback, useReducer } from 'react';

interface UIState {
  showPresets: boolean;
  showProductSelection: boolean;
  showQuickTemplates: boolean;
  showComparison: boolean;
  showAIDashboard: boolean;
  showDynamicPricingManager: boolean;
}

type UIAction =
  | { type: 'open'; key: keyof UIState }
  | { type: 'close'; key: keyof UIState }
  | { type: 'toggle'; key: keyof UIState }
  | { type: 'reset' };

const initialUIState: UIState = {
  showPresets: false,
  showProductSelection: false,
  showQuickTemplates: false,
  showComparison: false,
  showAIDashboard: false,
  showDynamicPricingManager: false
};

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'open':
      return { ...state, [action.key]: true };
    case 'close':
      return { ...state, [action.key]: false };
    case 'toggle':
      return { ...state, [action.key]: !state[action.key] };
    case 'reset':
      return initialUIState;
    default:
      return state;
  }
}

export function useCalculatorUI(initial: Partial<UIState> = {}) {
  const [ui, dispatch] = useReducer(uiReducer, { ...initialUIState, ...initial });

  const open = useCallback((key: keyof UIState) => dispatch({ type: 'open', key }), []);
  const close = useCallback((key: keyof UIState) => dispatch({ type: 'close', key }), []);
  const toggle = useCallback((key: keyof UIState) => dispatch({ type: 'toggle', key }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { ui, open, close, toggle, reset } as const;
}


