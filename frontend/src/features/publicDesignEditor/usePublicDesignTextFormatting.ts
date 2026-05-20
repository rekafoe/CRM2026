import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { TextFormattingHandlers } from '../../pages/admin/designEditor/TextFormattingControls';
import type { SelectedObjProps } from '../../pages/admin/designEditor/types';

export function usePublicDesignTextFormatting(
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>,
  selectedObj: SelectedObjProps | null,
): TextFormattingHandlers {
  const handleFontChange = useCallback((fontFamily: string) => {
    canvasHandleRef.current?.setTextProp('fontFamily', fontFamily);
  }, [canvasHandleRef]);

  const handleFontSizeChange = useCallback((fontSize: number) => {
    canvasHandleRef.current?.setTextProp('fontSize', fontSize);
  }, [canvasHandleRef]);

  const handleTextColorChange = useCallback((fill: string) => {
    canvasHandleRef.current?.setTextProp('fill', fill);
  }, [canvasHandleRef]);

  const handleTextFontVariant = useCallback((fontWeight: string, fontStyle: string) => {
    canvasHandleRef.current?.setTextStyle({ fontWeight, fontStyle });
  }, [canvasHandleRef]);

  const handleFontWeightToggle = useCallback(() => {
    canvasHandleRef.current?.setTextProp('fontWeight', selectedObj?.fontWeight === 'bold' ? 'normal' : 'bold');
  }, [canvasHandleRef, selectedObj?.fontWeight]);

  const handleFontStyleToggle = useCallback(() => {
    canvasHandleRef.current?.setTextProp('fontStyle', selectedObj?.fontStyle === 'italic' ? 'normal' : 'italic');
  }, [canvasHandleRef, selectedObj?.fontStyle]);

  const handleUnderlineToggle = useCallback(() => {
    canvasHandleRef.current?.setTextProp('underline', !selectedObj?.underline);
  }, [canvasHandleRef, selectedObj?.underline]);

  const handleTextAlignChange = useCallback((textAlign: string) => {
    canvasHandleRef.current?.setTextProp('textAlign', textAlign);
  }, [canvasHandleRef]);

  const handleLineHeightChange = useCallback((lineHeight: number) => {
    canvasHandleRef.current?.setTextProp('lineHeight', lineHeight);
  }, [canvasHandleRef]);

  return {
    onFontChange: handleFontChange,
    onFontSizeChange: handleFontSizeChange,
    onTextColorChange: handleTextColorChange,
    onFontVariantChange: handleTextFontVariant,
    onFontWeightToggle: handleFontWeightToggle,
    onFontStyleToggle: handleFontStyleToggle,
    onUnderlineToggle: handleUnderlineToggle,
    onTextAlignChange: handleTextAlignChange,
    onLineHeightChange: handleLineHeightChange,
    onDuplicate: () => canvasHandleRef.current?.duplicateSelected(),
    onBringForward: () => canvasHandleRef.current?.bringForward(),
    onDelete: () => canvasHandleRef.current?.deleteSelected(),
  };
}
