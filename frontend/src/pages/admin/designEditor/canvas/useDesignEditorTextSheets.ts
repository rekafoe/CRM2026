import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { IText, type Canvas, type FabricObject } from 'fabric';
import type { TextEditSheetState } from '../EditorInAppFieldSheets';
import { resolveTextFillHintAfterEdit } from '../designEditorTextPlaceholder';
import type { SelectedObjProps } from '../types';
import {
  getObjProps,
} from './canvasSelection';
import {
  asAny,
  isTextLikeObject,
  type AnyObj,
} from './canvasUtils';
import { normalizeTextForDisplay } from './canvasTextEditing';
import type { EditorMode } from './types';

interface UseDesignEditorTextSheetsInput {
  fabricRef: MutableRefObject<Canvas | null>;
  modeRef: MutableRefObject<EditorMode>;
  onTextFillHintRef: MutableRefObject<((message: string) => void) | undefined>;
  setTextEditSheet: Dispatch<SetStateAction<TextEditSheetState | null>>;
  onSelectionChange: (info: SelectedObjProps | null) => void;
}

export function useDesignEditorTextSheets({
  fabricRef,
  modeRef,
  onTextFillHintRef,
  setTextEditSheet,
  onSelectionChange,
}: UseDesignEditorTextSheetsInput) {
  const textEditBaselineRef = useRef<{ fieldId: string; text: string } | null>(null);

  const captureTextEditBaseline = useCallback((target: FabricObject) => {
    const fieldId = String(asAny(target).id ?? '').trim();
    if (!fieldId) return;
    textEditBaselineRef.current = {
      fieldId,
      text: normalizeTextForDisplay(getObjProps(target).text),
    };
  }, []);

  const emitTextFillHintIfNeeded = useCallback((textBefore: string | undefined, textAfter: string | undefined) => {
    if (modeRef.current !== 'basic') return;
    const hint = resolveTextFillHintAfterEdit(textBefore, textAfter);
    if (hint) onTextFillHintRef.current?.(hint);
  }, [modeRef, onTextFillHintRef]);

  const openTextEditSheetForTarget = useCallback((target: FabricObject): boolean => {
    const canvas = fabricRef.current;
    if (!canvas || !isTextLikeObject(target)) return false;
    const fieldId = String(asAny(target).id ?? '').trim();
    if (!fieldId) return false;
    const active = canvas.getActiveObject();
    if (active && isTextLikeObject(active)) {
      const editing = active as IText;
      if (typeof editing.exitEditing === 'function' && (editing as unknown as AnyObj).isEditing) {
        editing.exitEditing();
      }
    }
    const props = getObjProps(target);
    const rawText = normalizeTextForDisplay(props.text);
    captureTextEditBaseline(target);
    setTextEditSheet({
      fieldId,
      label: rawText.trim() ? rawText.trim().slice(0, 28) : 'Текст',
      text: rawText,
      fontFamily: typeof props.fontFamily === 'string' ? props.fontFamily : 'Arial',
      fontSize: Math.round(Number(props.fontSize) || 24),
      fill: typeof props.fill === 'string' ? props.fill : '#111827',
    });
    canvas.setActiveObject(target);
    onSelectionChange(getObjProps(target));
    canvas.requestRenderAll();
    return true;
  }, [captureTextEditBaseline, fabricRef, onSelectionChange, setTextEditSheet]);

  const openTextEditSheetRef = useRef(openTextEditSheetForTarget);
  openTextEditSheetRef.current = openTextEditSheetForTarget;

  return {
    textEditBaselineRef,
    captureTextEditBaseline,
    emitTextFillHintIfNeeded,
    openTextEditSheetForTarget,
    openTextEditSheetRef,
  };
}
