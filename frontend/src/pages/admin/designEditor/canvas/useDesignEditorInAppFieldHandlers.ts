import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { FabricImage, Group, IText, type Canvas, type FabricObject } from 'fabric';
import { isLikelyImageFile } from '../../../../utils/imageFile';
import type {
  PhotoPickSheetState,
  TextEditSheetState,
} from '../EditorInAppFieldSheets';
import type { DesignEditorCanvasCropModalState } from '../DesignEditorCanvasView';
import { isRestrictiveInAppBrowser } from '../inAppBrowser';
import { applyPhotoFieldPanToGroup } from '../photoFieldFit';
import { finishTextEditOnObject } from '../textStyleRuns';
import { applyBasicModeConstraints, releaseBasicModeConstraints } from './canvasBasicMode';
import { wrapLegacyFilledPhotoImage } from './canvasCommands';
import {
  findDesignObjectByIdDeep,
  findPhotoFieldByIdDeep,
  getObjProps,
} from './canvasSelection';
import {
  asAny,
  isTextLikeObject,
} from './canvasUtils';
import {
  normalizeTextForDisplay,
  normalizeTextForFabric,
} from './canvasTextEditing';
import type { EditorMode } from './types';
import type { SelectedObjProps } from '../types';

interface UseDesignEditorInAppFieldHandlersInput {
  fabricRef: MutableRefObject<Canvas | null>;
  photoPickSheet: PhotoPickSheetState | null;
  setPhotoPickSheet: Dispatch<SetStateAction<PhotoPickSheetState | null>>;
  cropModal: DesignEditorCanvasCropModalState | null;
  setCropModal: Dispatch<SetStateAction<DesignEditorCanvasCropModalState | null>>;
  textEditSheet: TextEditSheetState | null;
  setTextEditSheet: Dispatch<SetStateAction<TextEditSheetState | null>>;
  textEditBaselineRef: MutableRefObject<{ fieldId: string; text: string } | null>;
  photoPickerTargetIdRef: MutableRefObject<string | null>;
  photoFileInputRef: MutableRefObject<HTMLInputElement | null>;
  modeRef: MutableRefObject<EditorMode>;
  selectionDisplayScaleRef: MutableRefObject<number>;
  fillPhotoFieldWithSnapshot: (canvas: Canvas, field: FabricObject, file: File) => Promise<void>;
  saveSnapshot: () => void;
  emitTextFillHintIfNeeded: (textBefore: string | undefined, textAfter: string | undefined) => void;
  onSelectionChange: (info: SelectedObjProps | null) => void;
}

function createApplyPhotoFileToTarget(input: {
  fabricRef: MutableRefObject<Canvas | null>;
  fillPhotoFieldWithSnapshot: (canvas: Canvas, field: FabricObject, file: File) => Promise<void>;
}) {
  return async (fieldId: string, file: File) => {
    const canvas = input.fabricRef.current;
    if (!canvas || !isLikelyImageFile(file)) return;
    const field = findPhotoFieldByIdDeep(canvas, fieldId);
    if (!field) return;
    await input.fillPhotoFieldWithSnapshot(canvas, field, file);
  };
}

export function useDesignEditorInAppFieldHandlers({
  fabricRef,
  photoPickSheet,
  setPhotoPickSheet,
  cropModal,
  setCropModal,
  textEditSheet,
  setTextEditSheet,
  textEditBaselineRef,
  photoPickerTargetIdRef,
  photoFileInputRef,
  modeRef,
  selectionDisplayScaleRef,
  fillPhotoFieldWithSnapshot,
  saveSnapshot,
  emitTextFillHintIfNeeded,
  onSelectionChange,
}: UseDesignEditorInAppFieldHandlersInput) {
  const applyPhotoFileToTarget = useCallback(
    createApplyPhotoFileToTarget({ fabricRef, fillPhotoFieldWithSnapshot }),
    [fabricRef, fillPhotoFieldWithSnapshot],
  );

  const handleInAppPhotoSelected = useCallback(async (file: File) => {
    const fieldId = photoPickSheet?.fieldId ?? photoPickerTargetIdRef.current;
    if (!fieldId) return;
    setPhotoPickSheet(null);
    photoPickerTargetIdRef.current = null;
    await applyPhotoFileToTarget(fieldId, file);
  }, [applyPhotoFileToTarget, photoPickSheet, photoPickerTargetIdRef, setPhotoPickSheet]);

  const handleInAppTextClose = useCallback(() => {
    textEditBaselineRef.current = null;
    setTextEditSheet(null);
  }, [setTextEditSheet, textEditBaselineRef]);

  const handleInAppTextSave = useCallback((text: string) => {
    const canvas = fabricRef.current;
    if (!canvas || !textEditSheet) return;
    const textBefore = textEditSheet.text;
    const target = findDesignObjectByIdDeep(canvas, textEditSheet.fieldId);
    if (!target || !isTextLikeObject(target)) {
      textEditBaselineRef.current = null;
      setTextEditSheet(null);
      return;
    }
    const textObj = target as IText;
    textObj.set('text', normalizeTextForFabric(text));
    finishTextEditOnObject(textObj, textBefore);
    canvas.setActiveObject(textObj);
    canvas.requestRenderAll();
    onSelectionChange(getObjProps(textObj));
    saveSnapshot();
    emitTextFillHintIfNeeded(textBefore, normalizeTextForDisplay(text));
    textEditBaselineRef.current = null;
    setTextEditSheet(null);
  }, [
    emitTextFillHintIfNeeded,
    fabricRef,
    onSelectionChange,
    saveSnapshot,
    setTextEditSheet,
    textEditBaselineRef,
    textEditSheet,
  ]);

  const handleCropApply = useCallback((panX: number, panY: number, zoom: number) => {
    void (async () => {
      const canvas = fabricRef.current;
      if (!canvas || !cropModal) return;
      const id = cropModal.fieldId;
      let hit = canvas.getObjects().find((o) => asAny(o).id === id && asAny(o).isPhotoField);
      if (!hit) return;
      if (hit.type === 'image') {
        const group = await wrapLegacyFilledPhotoImage(canvas, hit as FabricImage);
        hit = group ?? hit;
      }
      if (hit.type === 'group') applyPhotoFieldPanToGroup(hit as Group, panX, panY, zoom);
      if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
      else releaseBasicModeConstraints(canvas);
      canvas.requestRenderAll();
      saveSnapshot();
    })();
  }, [cropModal, fabricRef, modeRef, saveSnapshot, selectionDisplayScaleRef]);

  const handleCropReplaceFile = useCallback(() => {
    if (!cropModal) return;
    const id = cropModal.fieldId;
    setCropModal(null);
    if (isRestrictiveInAppBrowser()) {
      setPhotoPickSheet({ fieldId: id, label: 'Фото-поле' });
      return;
    }
    photoPickerTargetIdRef.current = id;
    photoFileInputRef.current?.click();
  }, [cropModal, photoFileInputRef, photoPickerTargetIdRef, setCropModal, setPhotoPickSheet]);

  return {
    handleInAppPhotoSelected,
    handleInAppTextClose,
    handleInAppTextSave,
    handleCropApply,
    handleCropReplaceFile,
  };
}
