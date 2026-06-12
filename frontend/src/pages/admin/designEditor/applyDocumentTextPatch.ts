import type { Dispatch, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from './DesignEditorCanvas';
import type { PageSaveSnapshot } from './mergePagesSnapshot';
import { mergeSavedEditorPages } from './designEditorState';
import {
  isFabricTextObjectType,
  patchAllTextFontFamilyInFabricJSON,
  patchAllTextInFabricJSON,
} from './patchFabricTextObjects';
import type { DesignPage, SelectedObjProps } from './types';

export type TextPatchScope = 'selection' | 'currentPage' | 'wholeDocument';

interface ApplyDocumentTextPatchParams {
  scope: TextPatchScope;
  patch: Record<string, unknown>;
  canvasHandle: DesignEditorCanvasHandle;
  selectedObj: SelectedObjProps | null;
  pages: DesignPage[];
  setPages: Dispatch<SetStateAction<DesignPage[]>>;
  currentPage: number;
  leftPageIdx: number;
  rightPageIdx: number;
}

function patchPageFabricJSON(
  fabricJSON: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof patch.fontFamily === 'string') {
    return patchAllTextFontFamilyInFabricJSON(fabricJSON, patch.fontFamily);
  }
  return patchAllTextInFabricJSON(fabricJSON, patch);
}

function pageIndexesForScope(
  scope: TextPatchScope,
  currentPage: number,
  leftPageIdx: number,
  rightPageIdx: number,
  pageCount: number,
): Set<number> {
  if (scope === 'wholeDocument') {
    return new Set(Array.from({ length: pageCount }, (_, index) => index));
  }
  if (rightPageIdx >= 0 && rightPageIdx < pageCount) {
    return new Set([leftPageIdx, rightPageIdx]);
  }
  return new Set([currentPage]);
}

export async function applyDocumentTextPatch({
  scope,
  patch,
  canvasHandle,
  selectedObj,
  pages,
  setPages,
  currentPage,
  leftPageIdx,
  rightPageIdx,
}: ApplyDocumentTextPatchParams): Promise<void> {
  if (scope === 'selection' && isFabricTextObjectType(selectedObj?.type)) {
    canvasHandle.applyTextPropsToSelection(patch);
    if (typeof patch.fontFamily === 'string') {
      await canvasHandle.reloadTextFonts();
    }
    return;
  }

  const saved = await canvasHandle.saveCurrentPage();
  const merged = mergeSavedEditorPages(
    pages,
    saved as PageSaveSnapshot,
    currentPage,
    leftPageIdx,
    rightPageIdx,
  );
  const targetIndexes = pageIndexesForScope(scope, currentPage, leftPageIdx, rightPageIdx, merged.length);
  const nextPages = merged.map((page, index) => (
    targetIndexes.has(index)
      ? { fabricJSON: patchPageFabricJSON(page.fabricJSON as Record<string, unknown>, patch) }
      : page
  ));
  setPages(nextPages);
  await canvasHandle.applyEditorViewState(nextPages);
  if (typeof patch.fontFamily === 'string') {
    await canvasHandle.reloadTextFonts();
  }
}
