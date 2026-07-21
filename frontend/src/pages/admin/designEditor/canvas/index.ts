export type { EditorMode, ResolveImageFileUrl } from './types';
export { CanvasHistoryStack } from './canvasHistory';
export {
  applyBasicModeConstraints,
  releaseBasicModeConstraints,
  lockTextInlineEditing,
  isBasicDecorShape,
  isClientAddedPhotoField,
  canDeleteObjectInBasicMode,
  deletePhotoFieldTargetInBasicMode,
  clearFilledPhotoField,
  canDuplicateObjectInBasicMode,
} from './canvasBasicMode';
export {
  addImageFileToCanvas,
  addImageUrlToCanvas,
  fillPhotoField,
  wrapLegacyFilledPhotoImage,
} from './canvasCommands';
export {
  activateClonedObjects,
  duplicateActiveObjects,
  cloneFabricObjects,
  keepGrabPointAlignedWithSnap,
  moveActiveObjectsByKeyboard,
  resolveKeyboardNudgePx,
  canKeyboardTransformObject,
  getKeyboardTargetObjects,
} from './canvasKeyboard';
export { detachFabricObject } from './canvasObjectDetach';
export { bakeClientPhotoFieldIfNeeded, resolveClientPhotoFieldId } from './canvasPhotoGestures';
export {
  resolvePhotoFieldFrameSceneTL,
  snapshotPhotoFieldTransformNoPosition,
} from './canvasPhotoFieldFrame';
export {
  isCoarsePointerEnvironment,
  isCoarsePointerEvent,
  scenePointFromClientPointer,
  scenePointFromInteractionEvent,
  resolveInteractiveTargetAtScene,
} from './canvasPointer';
export {
  findDesignObjectByIdDeep,
  findPhotoFieldByIdDeep,
  getObjProps,
  resolvePhotoFieldTarget,
  enforceSingleObjectSelectionOnCoarse,
  isCanvasMarqueeSelectionAllowed,
  resolveCanvasMarqueeSelectionEnabled,
} from './canvasSelection';
export { canvasToJSON, parsePageLoadKey } from './canvasSerialization';
export { createDesignEditorCanvasHandle } from './createDesignEditorCanvasHandle';
export type { DesignEditorCanvasHandleDeps } from './createDesignEditorCanvasHandle';
export { runPageLoadKeyTransition } from './canvasPageTransitions';
export type {
  PageLoadKeyTransitionCallbacks,
  PageLoadKeyTransitionParams,
  PageLoadKeyTransitionRefs,
} from './canvasPageTransitions';
export { usePageLoadKeyEffect } from './usePageLoadKeyEffect';
export type { UsePageLoadKeyEffectInput } from './usePageLoadKeyEffect';
export { useDesignEditorCanvasHistory } from './useDesignEditorCanvasHistory';
export { useDesignEditorInAppFieldHandlers } from './useDesignEditorInAppFieldHandlers';
export { useDesignEditorTextSheets } from './useDesignEditorTextSheets';
export { useDesignEditorCanvasSetup } from './useDesignEditorCanvasSetup';
export { useDesignEditorRuntimeEffects } from './useDesignEditorRuntimeEffects';
export { useDesignEditorPhotoFileInput } from './useDesignEditorPhotoFileInput';
export {
  resolveEditorDisplayBoost,
  applyEditorDisplayBoost,
  EDITOR_MAX_DISPLAY_BOOST,
  EDITOR_MAX_BACKSTORE_SIDE,
} from './editorCanvasDisplaySharpness';
export {
  beginTextEditingOnCanvas,
  normalizeTextForDisplay,
  normalizeTextForFabric,
  pinFabricHiddenTextarea,
  scenePointToClient,
  isMobileTextInputEnvironment,
} from './canvasTextEditing';
export { asAny, isTextLikeObject, CLIPBOARD_PASTE_OFFSET_PX } from './canvasUtils';
export { registerCanvasEventHandlers } from './registerCanvasEventHandlers';
export type { CanvasEventHandlerDeps, CropModalState } from './registerCanvasEventHandlers';
