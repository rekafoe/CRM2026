import { useCallback, type ChangeEvent, type MutableRefObject } from 'react';
import type { Canvas, FabricObject } from 'fabric';
import { isLikelyImageFile } from '../../../../utils/imageFile';
import { addImageFileToCanvas } from './canvasCommands';
import { findPhotoFieldByIdDeep } from './canvasSelection';
import type { ResolveImageFileUrl } from './types';

interface UseDesignEditorPhotoFileInputInput {
  fabricRef: MutableRefObject<Canvas | null>;
  photoPickerTargetIdRef: MutableRefObject<string | null>;
  resolveImageFileUrlRef: MutableRefObject<ResolveImageFileUrl | undefined>;
  fillPhotoFieldWithSnapshot: (canvas: Canvas, field: FabricObject, file: File) => Promise<void>;
}

export function useDesignEditorPhotoFileInput({
  fabricRef,
  photoPickerTargetIdRef,
  resolveImageFileUrlRef,
  fillPhotoFieldWithSnapshot,
}: UseDesignEditorPhotoFileInputInput) {
  return useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const canvas = fabricRef.current;
    if (!file || !canvas || !isLikelyImageFile(file)) return;

    const targetId = photoPickerTargetIdRef.current;
    photoPickerTargetIdRef.current = null;

    if (targetId) {
      const field = findPhotoFieldByIdDeep(canvas, targetId);
      if (field) {
        await fillPhotoFieldWithSnapshot(canvas, field, file);
        return;
      }
    }

    await addImageFileToCanvas(canvas, file, resolveImageFileUrlRef.current);
  }, [fabricRef, fillPhotoFieldWithSnapshot, photoPickerTargetIdRef, resolveImageFileUrlRef]);
}
