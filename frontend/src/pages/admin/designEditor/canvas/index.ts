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
} from './canvasSelection';
export { canvasToJSON, parsePageLoadKey } from './canvasSerialization';
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
