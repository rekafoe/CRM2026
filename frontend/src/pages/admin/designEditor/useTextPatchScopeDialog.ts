import { useCallback, useRef, useState } from 'react';
import type { TextPatchScopeChoice } from './TextPatchScopeDialog';

export function useTextPatchScopeDialog() {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((scope: TextPatchScopeChoice | null) => void) | null>(null);

  const askTextPatchScope = useCallback(() => new Promise<TextPatchScopeChoice | null>((resolve) => {
    resolverRef.current = resolve;
    setOpen(true);
  }), []);

  const handleClose = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const handleChoose = useCallback((scope: TextPatchScopeChoice) => {
    setOpen(false);
    resolverRef.current?.(scope);
    resolverRef.current = null;
  }, []);

  return {
    textPatchScopeOpen: open,
    askTextPatchScope,
    handleTextPatchScopeClose: handleClose,
    handleTextPatchScopeChoose: handleChoose,
  };
}
