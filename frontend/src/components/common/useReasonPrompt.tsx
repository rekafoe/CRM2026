import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ReasonPromptOptions = {
  title: string;
  placeholder?: string;
  presets?: string[];
  confirmText?: string;
  rememberKey?: string;
};

type DialogState = {
  open: boolean;
  title: string;
  placeholder: string;
  presets: string[];
  confirmText: string;
  value: string;
  rememberKey: string;
};

const DEFAULT_PRESETS = [
  'Клиент отменил заказ',
  'Ошибочный заказ',
  'Дубликат заказа',
  'Нет возможности выполнить в срок',
  'Техническая ошибка',
];

const INITIAL_STATE: DialogState = {
  open: false,
  title: '',
  placeholder: 'Укажите причину',
  presets: DEFAULT_PRESETS,
  confirmText: 'Подтвердить',
  value: '',
  rememberKey: '',
};

export function useReasonPrompt() {
  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(null);
        resolverRef.current = null;
      }
    };
  }, []);

  const closeWith = useCallback((value: string | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(INITIAL_STATE);
    resolve?.(value);
  }, []);

  const requestReason = useCallback((options: ReasonPromptOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      const rememberKey = (options.rememberKey || '').trim();
      let rememberedValue = '';
      if (rememberKey) {
        try {
          rememberedValue = localStorage.getItem(`reason_prompt:${rememberKey}`) || '';
        } catch {
          rememberedValue = '';
        }
      }
      setState({
        open: true,
        title: options.title,
        placeholder: options.placeholder || 'Укажите причину',
        presets: options.presets?.length ? options.presets : DEFAULT_PRESETS,
        confirmText: options.confirmText || 'Подтвердить',
        value: rememberedValue,
        rememberKey,
      });
    });
  }, []);

  const confirmDisabled = state.value.trim().length === 0;

  const ReasonPromptModalElement = useMemo(() => {
    if (!state.open) return null;
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 16,
      }} onClick={() => closeWith(null)}>
        <div style={{
          width: 'min(560px, 96vw)',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          padding: 16,
        }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>{state.title}</h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {state.presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, value: preset }))}
                style={{
                  border: '1px solid #cbd5e0',
                  borderRadius: 8,
                  background: '#f8fafc',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          <textarea
            value={state.value}
            onChange={(e) => setState((prev) => ({ ...prev, value: e.target.value }))}
            placeholder={state.placeholder}
            rows={4}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #cbd5e0',
              borderRadius: 8,
              padding: 10,
              resize: 'vertical',
              marginBottom: 12,
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => closeWith(null)} style={{
              border: '1px solid #cbd5e0',
              borderRadius: 8,
              background: '#fff',
              padding: '8px 12px',
              cursor: 'pointer',
            }}>
              Отмена
            </button>
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={() => {
                const normalized = state.value.trim();
                if (state.rememberKey) {
                  try {
                    localStorage.setItem(`reason_prompt:${state.rememberKey}`, normalized);
                  } catch {}
                }
                closeWith(normalized);
              }}
              style={{
                border: '1px solid #667eea',
                borderRadius: 8,
                background: confirmDisabled ? '#cbd5e1' : '#667eea',
                color: '#fff',
                padding: '8px 12px',
                cursor: confirmDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {state.confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }, [state, closeWith, confirmDisabled]);

  return { requestReason, ReasonPromptModalElement };
}

