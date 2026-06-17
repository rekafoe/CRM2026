import type { MutableRefObject, RefObject } from 'react';
import {
  Canvas,
  IText,
  Point,
  type FabricObject,
} from 'fabric';
import { SIDEBAR_PHOTO_DRAG_MIME } from '../constants';
import { isLikelyImageFile, looksLikeHttpUrl } from '../../../../utils/imageFile';
import {
  applyPhotoFieldSelectionChrome,
  applyTextSelectionChrome,
} from '../designEditorTextChrome';
import { bakeTextObjectScaleInPlace, captureTextScaleDraft, type TextScaleBakeDraft } from '../designEditorTextScale';
import { findPhotoFieldAtScene } from '../photoFieldHitTest';
import {
  clearPhotoFieldDropHighlight,
  type PhotoFieldDropHighlightState,
  updatePhotoFieldDropHighlight,
} from '../photoFieldDropHighlight';
import { finishTextEditOnObject } from '../textStyleRuns';
import { createSmartGuideSession, resolveSmartGuideSnapAtPointer } from '../smartGuides/snapSession';
import type { SmartGuidePointer, SmartGuideSession } from '../smartGuides/types';
import {
  getFilledPhotoCropContext,
  restoreBakedPhotoFieldDimensions,
  resolvePhotoFieldFrameSize,
} from '../photoFieldFit';
import { isRestrictiveInAppBrowser, shouldPreferTextEditSheet } from '../inAppBrowser';
import type { PhotoPickSheetState } from '../EditorInAppFieldSheets';
import type { SelectedObjProps } from '../types';
import type { EditorMode, ResolveImageFileUrl } from './types';
import {
  addImageFileToCanvas,
  applyBasicModeConstraints,
  bakeClientPhotoFieldIfNeeded,
  beginTextEditingOnCanvas,
  canDeleteObjectInBasicMode,
  canKeyboardTransformObject,
  CLIPBOARD_PASTE_OFFSET_PX,
  detachFabricObject,
  deletePhotoFieldTargetInBasicMode,
  duplicateActiveObjects,
  getObjProps,
  isClientAddedPhotoField,
  isCoarsePointerEnvironment,
  isCoarsePointerEvent,
  isTextLikeObject,
  keepGrabPointAlignedWithSnap,
  moveActiveObjectsByKeyboard,
  normalizeTextForDisplay,
  pinFabricHiddenTextarea,
  releaseBasicModeConstraints,
  resolveClientPhotoFieldId,
  resolveInteractiveTargetAtScene,
  resolveKeyboardNudgePx,
  resolvePhotoFieldTarget,
  scenePointFromInteractionEvent,
  scenePointToClient,
  activateClonedObjects,
  cloneFabricObjects,
  getKeyboardTargetObjects,
  asAny,
} from './index';
import type { AnyObj } from './canvasUtils';

export type CropModalState = {
  fieldId: string;
  previewUrl: string;
  frameW: number;
  frameH: number;
  iw: number;
  ih: number;
  panX: number;
  panY: number;
  zoom: number;
  fitMode: 'cover' | 'contain';
};

export interface CanvasEventHandlerDeps {
  canvas: Canvas;
  canvasElRef: RefObject<HTMLCanvasElement | null>;
  safeZonePx: number;
  pageHeightPx: number;
  onSelectionChange: (info: SelectedObjProps | null) => void;
  saveSnapshot: (options?: { debounce?: boolean }) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  fillPhotoFieldWithSnapshot: (canvas: Canvas, field: FabricObject, file: File) => Promise<void>;
  captureTextEditBaseline: (target: FabricObject) => void;
  emitTextFillHintIfNeeded: (textBefore: string | undefined, textAfter: string | undefined) => void;
  snapLinesSignature: (lines: { axis: 'h' | 'v'; pos: number }[]) => string;
  setLocalSnapLines: (lines: { axis: 'h' | 'v'; pos: number }[]) => void;
  setCropModal: (value: CropModalState | null) => void;
  setPhotoPickSheet: (value: PhotoPickSheetState | null) => void;
  fabricRef: MutableRefObject<Canvas | null>;
  modeRef: MutableRefObject<EditorMode>;
  isLoadingRef: MutableRefObject<boolean>;
  photoFieldBakeLockRef: MutableRefObject<boolean>;
  photoFieldResizeDraftRef: MutableRefObject<{ fieldId: string; fw: number; fh: number } | null>;
  photoFieldScaleGestureRef: MutableRefObject<boolean>;
  textResizeDraftRef: MutableRefObject<TextScaleBakeDraft | null>;
  photoFieldSkipBakeOnceRef: MutableRefObject<string | null>;
  spreadPairPagesRef: MutableRefObject<[number, number] | null>;
  pageWidthRef: MutableRefObject<number>;
  canvasWidthRef: MutableRefObject<number>;
  guidesRef: MutableRefObject<{ axis: 'h' | 'v'; pos: number }[] | undefined>;
  snapLinesRef: MutableRefObject<((lines: { axis: 'h' | 'v'; pos: number }[]) => void) | undefined>;
  onTextFloatingAnchorRef: MutableRefObject<((pos: { x: number; y: number } | null) => void) | undefined>;
  onTextEditCommittedRef: MutableRefObject<(() => void) | undefined>;
  resolveImageFileUrlRef: MutableRefObject<ResolveImageFileUrl | undefined>;
  remoteUrlHandlerRef: MutableRefObject<((url: string) => Promise<void>) | undefined>;
  getSidebarPhotoFileRef: MutableRefObject<((id: string) => File | undefined) | undefined>;
  onSidebarPhotoDroppedRef: MutableRefObject<((id: string) => void) | undefined>;
  clipboardObjectsRef: MutableRefObject<FabricObject[]>;
  textAnchorRafRef: MutableRefObject<number>;
  inlineTextEditSessionRef: MutableRefObject<boolean>;
  textEditBaselineRef: MutableRefObject<{ fieldId: string; text: string } | null>;
  scheduleTextAnchorRef: MutableRefObject<(() => void) | null>;
  photoPickerTargetIdRef: MutableRefObject<string | null>;
  photoFileInputRef: RefObject<HTMLInputElement | null>;
  photoPasteSceneRef: MutableRefObject<{ x: number; y: number }>;
  snapOverlayKeyRef: MutableRefObject<string>;
  smartGuideSessionRef: MutableRefObject<SmartGuideSession | null>;
  photoFieldDropHighlightRef: MutableRefObject<PhotoFieldDropHighlightState>;
  selectionDisplayScaleRef: MutableRefObject<number>;
  openTextEditSheetRef: MutableRefObject<(target: FabricObject) => boolean>;
}

export function registerCanvasEventHandlers(deps: CanvasEventHandlerDeps): () => void {
  const {
    canvas,
    canvasElRef,
    safeZonePx,
    pageHeightPx,
    onSelectionChange,
    saveSnapshot,
    undo,
    redo,
    fillPhotoFieldWithSnapshot,
    captureTextEditBaseline,
    emitTextFillHintIfNeeded,
    snapLinesSignature,
    setLocalSnapLines,
    setCropModal,
    setPhotoPickSheet,
    modeRef,
    isLoadingRef,
    photoFieldBakeLockRef,
    photoFieldResizeDraftRef,
    photoFieldScaleGestureRef,
    textResizeDraftRef,
    photoFieldSkipBakeOnceRef,
    spreadPairPagesRef,
    pageWidthRef,
    canvasWidthRef,
    guidesRef,
    snapLinesRef,
    onTextEditCommittedRef,
    resolveImageFileUrlRef,
    remoteUrlHandlerRef,
    getSidebarPhotoFileRef,
    onSidebarPhotoDroppedRef,
    clipboardObjectsRef,
    textAnchorRafRef,
    inlineTextEditSessionRef,
    textEditBaselineRef,
    scheduleTextAnchorRef,
    photoPickerTargetIdRef,
    photoFileInputRef,
    photoPasteSceneRef,
    snapOverlayKeyRef,
    smartGuideSessionRef,
    photoFieldDropHighlightRef,
    selectionDisplayScaleRef,
    openTextEditSheetRef,
    onTextFloatingAnchorRef,
  } = deps;

        const trackPasteScene = (ev: Event) => {
          try {
            photoPasteSceneRef.current = canvas.getScenePoint(ev as never);
          } catch {
            /* noop */
          }
        };
        canvas.upperCanvasEl.addEventListener('mousemove', trackPasteScene);

        /** Только внутренние скроллы вокруг холста — не трогаем страницу и полосу миниатюр. */
        const resetCanvasWrapScroll = () => {
          const upper = canvas.upperCanvasEl;
          if (!upper) return;
          for (const sel of ['.design-editor-canvas-wrap', '.design-editor-fit-scaler', '.design-editor-viewport']) {
            const node = upper.closest(sel);
            if (node instanceof HTMLElement) {
              if (node.scrollTop !== 0) node.scrollTop = 0;
              if (node.scrollLeft !== 0) node.scrollLeft = 0;
            }
          }
        };

        const scheduleTextAnchor = () => {
          if (!onTextFloatingAnchorRef.current) return;
          cancelAnimationFrame(textAnchorRafRef.current);
          textAnchorRafRef.current = requestAnimationFrame(() => {
            const cb = onTextFloatingAnchorRef.current;
            if (!cb) return;
            const upper = canvas.upperCanvasEl;
            if (!upper || !upper.isConnected) {
              cb(null);
              return;
            }
            try {
              canvas.calcOffset();
            } catch {
              cb(null);
              return;
            }
            const active = canvas.getActiveObject();
            if (!active || (active.type !== 'i-text' && active.type !== 'textbox')) {
              cb(null);
              return;
            }
            const br = active.getBoundingRect();
            const cx = br.left + br.width / 2;
            const cy = br.top;
            const { x, y } = scenePointToClient(canvas, cx, cy);
            const margin = 72;
            const clampedX = Math.min(window.innerWidth - margin, Math.max(margin, x));
            const clampedY = Math.min(window.innerHeight - margin, Math.max(margin, y));
            cb({ x: clampedX, y: clampedY });
          });
        };
        scheduleTextAnchorRef.current = scheduleTextAnchor;

        canvas.on('text:editing:entered', () => {
          resetCanvasWrapScroll();
          const active = canvas.getActiveObject();
          if (active && isTextLikeObject(active)) {
            pinFabricHiddenTextarea(canvas, active as IText);
          }
        });
        canvas.on('text:editing:exited', (opt) => {
          inlineTextEditSessionRef.current = false;
          const target = opt.target;
          const baseline = textEditBaselineRef.current;
          textEditBaselineRef.current = null;
          if (target && isTextLikeObject(target)) {
            const text = target as IText;
            const fieldId = String(asAny(target).id ?? '').trim();
            const textBefore = baseline?.fieldId === fieldId ? baseline.text : undefined;
            const textAfter = normalizeTextForDisplay(text.text);
            finishTextEditOnObject(text, textBefore);
            emitTextFillHintIfNeeded(textBefore, textAfter);
            text.set({ editable: false });
            const hidden = (text as unknown as { hiddenTextarea?: HTMLTextAreaElement }).hiddenTextarea;
            hidden?.classList.remove('de-fabric-text-input');
            onTextEditCommittedRef.current?.();
          }
          resetCanvasWrapScroll();
        });

        // Selection events
        const updateSel = () => {
          const active = canvas.getActiveObject();
          if (active && isTextLikeObject(active)) {
            const text = active as IText;
            if ((text as unknown as AnyObj).isEditing && !inlineTextEditSessionRef.current) {
              text.exitEditing();
              text.set({ editable: false });
            }
          }
          if (active && modeRef.current === 'basic' && !photoFieldScaleGestureRef.current) {
            if (isTextLikeObject(active)) {
              applyTextSelectionChrome(active, 'basic', selectionDisplayScaleRef.current, canvas.getZoom());
            } else if (asAny(active).isPhotoField && isClientAddedPhotoField(asAny(active))) {
              applyPhotoFieldSelectionChrome(active, selectionDisplayScaleRef.current, canvas.getZoom());
            }
            canvas.requestRenderAll();
          }
          if (active) onSelectionChange(getObjProps(active));
          else onSelectionChange(null);
          scheduleTextAnchor();
        };
        canvas.on('selection:created', updateSel);
        canvas.on('selection:updated', updateSel);
        canvas.on('selection:cleared', () => {
          photoFieldResizeDraftRef.current = null;
          photoFieldScaleGestureRef.current = false;
          textResizeDraftRef.current = null;
          onSelectionChange(null);
          scheduleTextAnchor();
        });
        canvas.on('after:render', scheduleTextAnchor);

        canvas.on('object:scaling', (opt) => {
          const target = opt.target;
          if (target && modeRef.current === 'basic' && isTextLikeObject(target)) {
            textResizeDraftRef.current = captureTextScaleDraft(target);
            return;
          }
          const field = resolvePhotoFieldTarget(target);
          if (!field || !isClientAddedPhotoField(asAny(field))) return;
          photoFieldScaleGestureRef.current = true;
          const { fw, fh } = resolvePhotoFieldFrameSize(field);
          photoFieldResizeDraftRef.current = {
            fieldId: resolveClientPhotoFieldId(field),
            fw,
            fh,
          };
        });

        // Persist changes & update selection info
        const handleModified = (opt?: { target?: FabricObject }) => {
          if (photoFieldBakeLockRef.current) return;
          const target = opt?.target ?? canvas.getActiveObject() ?? undefined;
          const field = resolvePhotoFieldTarget(target) ?? (target && asAny(target).isPhotoField ? target : undefined);
          const fieldId = field ? resolveClientPhotoFieldId(field) : '';
          if (fieldId && photoFieldSkipBakeOnceRef.current === fieldId) {
            photoFieldSkipBakeOnceRef.current = null;
            const active = canvas.getActiveObject();
            if (active) onSelectionChange(getObjProps(active));
            saveSnapshot();
            return;
          }
          const draft = photoFieldResizeDraftRef.current;
          let sizeOverride =
            field
            && draft
            && (!draft.fieldId || draft.fieldId === resolveClientPhotoFieldId(field))
              ? { fw: draft.fw, fh: draft.fh }
              : undefined;

          const textTarget =
            target && modeRef.current === 'basic' && isTextLikeObject(target)
              ? target
              : undefined;
          const textDraft = textResizeDraftRef.current;
          const textDraftForTarget =
            textTarget
            && textDraft
            && (!textDraft.fieldId || textDraft.fieldId === String(asAny(textTarget).id ?? '').trim())
              ? textDraft
              : null;
          textResizeDraftRef.current = null;

          const clientPhotoField =
            field && isClientAddedPhotoField(asAny(field)) ? field : undefined;
          const scaleMag = clientPhotoField
            ? Math.max(
                Math.abs(Number(clientPhotoField.scaleX ?? 1)),
                Math.abs(Number(clientPhotoField.scaleY ?? 1)),
              )
            : 1;
          const textScaleMag = textTarget
            ? Math.max(
                Math.abs(Number(textTarget.scaleX ?? 1)),
                Math.abs(Number(textTarget.scaleY ?? 1)),
              )
            : 1;
          const wasPhotoScaleGesture = photoFieldScaleGestureRef.current;
          const isTextScaleEnd = !!textDraftForTarget || textScaleMag > 1.004;
          const isPhotoScaleEnd =
            !!sizeOverride || scaleMag > 1.004 || wasPhotoScaleGesture;
          if (
            clientPhotoField
            && isPhotoScaleEnd
            && !sizeOverride
          ) {
            const measured = resolvePhotoFieldFrameSize(clientPhotoField);
            sizeOverride = { fw: measured.fw, fh: measured.fh };
          }

          let baked = false;
          photoFieldBakeLockRef.current = true;
          isLoadingRef.current = true;
          try {
            if (textTarget && isTextScaleEnd) {
              baked = bakeTextObjectScaleInPlace(textTarget, textDraftForTarget);
            } else if (clientPhotoField && !isPhotoScaleEnd) {
              baked = restoreBakedPhotoFieldDimensions(clientPhotoField);
            } else if (clientPhotoField) {
              baked = bakeClientPhotoFieldIfNeeded(target, sizeOverride);
            }
            if (baked && modeRef.current === 'basic') {
              applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
            }
            if (baked) canvas.requestRenderAll();
          } finally {
            photoFieldBakeLockRef.current = false;
            isLoadingRef.current = false;
            photoFieldResizeDraftRef.current = null;
            photoFieldScaleGestureRef.current = false;
          }
          const active = canvas.getActiveObject();
          if (active) onSelectionChange(getObjProps(active));
          saveSnapshot();
        };
        canvas.on('object:modified', handleModified);
        canvas.on('object:added', (opt) => {
          const added = opt.target;
          if (added && isTextLikeObject(added)) {
            (added as IText).set({ editable: false });
            applyTextSelectionChrome(added, modeRef.current);
          }
          if (!isLoadingRef.current) saveSnapshot();
        });
        canvas.on('object:removed', () => { if (!isLoadingRef.current) saveSnapshot(); });

        // Smart guides: targets are fixed for one drag, hysteresis keeps snapping stable.
        canvas.on('object:moving', (opt) => {
          const movingField = resolvePhotoFieldTarget(opt.target);
          if (movingField && isClientAddedPhotoField(asAny(movingField))) {
            photoFieldResizeDraftRef.current = null;
            photoFieldScaleGestureRef.current = false;
          }
          if (opt.target && isTextLikeObject(opt.target)) {
            textResizeDraftRef.current = null;
          }
          const target = opt.target;
          if (!target) return;
          if (target.lockMovementX && target.lockMovementY) return;
          const brT = target.getBoundingRect();
          let snapPointer: SmartGuidePointer | undefined;
          try {
            if (opt.e) {
              const pointer = canvas.getScenePoint(opt.e);
              snapPointer = { x: pointer.x, y: pointer.y };
            }
          } catch {
            snapPointer = undefined;
          }
          if (!smartGuideSessionRef.current) {
            const excludePeerSnap =
              !!(asAny(target).isPhotoField || (target.group && asAny(target.group).isPhotoField));
            const others = excludePeerSnap
              ? []
              : canvas
                  .getObjects()
                  .filter((o) => o !== target && !(asAny(o).isBackground))
                  .map((o) => {
                    const r = o.getBoundingRect();
                    return {
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    };
                  });
            smartGuideSessionRef.current = createSmartGuideSession({
              activeRect: {
                left: brT.left,
                top: brT.top,
                width: brT.width,
                height: brT.height,
              },
              pointer: snapPointer,
              otherObjects: others,
              guidesPx: guidesRef.current ?? [],
              canvasW: canvas.getWidth() ?? canvasWidthRef.current,
              canvasH: pageHeightPx,
              safeZonePx,
              spreadHalfWidthPx: spreadPairPagesRef.current ? pageWidthRef.current : undefined,
            });
          }
          const snap = resolveSmartGuideSnapAtPointer(
            smartGuideSessionRef.current,
            {
              left: brT.left,
              top: brT.top,
              width: brT.width,
              height: brT.height,
            },
            snapPointer,
          );
          smartGuideSessionRef.current = snap.session;
          if (snap.dx !== 0) target.set('left', (target.left ?? 0) + snap.dx);
          if (snap.dy !== 0) target.set('top', (target.top ?? 0) + snap.dy);
          if (snap.dx !== 0 || snap.dy !== 0) {
            keepGrabPointAlignedWithSnap(opt, snap.dx, snap.dy);
            target.setCoords();
          }
          const sig = snapLinesSignature(snap.lines);
          if (sig !== snapOverlayKeyRef.current) {
            snapOverlayKeyRef.current = sig;
            setLocalSnapLines(snap.lines);
            snapLinesRef.current?.(snap.lines);
          }
        });
        const clearSnaps = () => {
          smartGuideSessionRef.current = null;
          snapOverlayKeyRef.current = '';
          setLocalSnapLines([]);
          snapLinesRef.current?.([]);
        };
        canvas.on('mouse:up', clearSnaps);
        canvas.on('text:changed', () => {
          const active = canvas.getActiveObject();
          if (active) onSelectionChange(getObjProps(active));
          scheduleTextAnchor();
          saveSnapshot({ debounce: true });
        });

        // Ctrl+wheel: без масштаба сцены Fabric; plain scroll страницы не трогаем
        canvas.on('mouse:wheel', (opt) => {
          const e = opt.e as WheelEvent;
          if (!e.ctrlKey) return;
          e.preventDefault();
          e.stopPropagation();
        });

        // Alt+drag pan
        let isPanning = false;
        let lastPan = { x: 0, y: 0 };
        const openPhotoFieldEditor = (target: FabricObject | undefined) => {
          let field = target;
          if (field?.group && asAny(field.group).isPhotoField) {
            field = field.group as FabricObject;
          }
          if (!field || !asAny(field).isPhotoField) return false;
          const fieldId = String((asAny(field).id as string) ?? '').trim();
          if (!fieldId) return false;
          const cropCtx = getFilledPhotoCropContext(field);
          if (cropCtx) {
            setCropModal({
              fieldId,
              previewUrl: cropCtx.previewUrl,
              frameW: cropCtx.frameW,
              frameH: cropCtx.frameH,
              iw: cropCtx.iw,
              ih: cropCtx.ih,
              panX: cropCtx.panX,
              panY: cropCtx.panY,
                zoom: cropCtx.zoom,
              fitMode: cropCtx.fitMode,
            });
            return true;
          }
          if (isRestrictiveInAppBrowser()) {
            setPhotoPickSheet({ fieldId, label: 'Фото-поле' });
            return true;
          }
          photoPickerTargetIdRef.current = fieldId;
          photoFileInputRef.current?.click();
          return true;
        };

        let lastBasicTextTap: { fieldId: string; at: number } | null = null;
        let lastBasicPhotoTap: { fieldId: string; at: number } | null = null;

        const activatePhotoFieldTarget = (target: FabricObject, e?: Event): boolean => {
          let field = target;
          if (field.group && asAny(field.group).isPhotoField) {
            field = field.group as FabricObject;
          }
          const fieldId = String(asAny(field).id ?? '').trim();
          if (!fieldId) return false;
          e?.preventDefault();
          canvas.setActiveObject(field);
          onSelectionChange(getObjProps(field));

          if (!isClientAddedPhotoField(asAny(field))) {
            return openPhotoFieldEditor(field);
          }

          const now = Date.now();
          const isDoubleTap =
            lastBasicPhotoTap?.fieldId === fieldId && now - lastBasicPhotoTap.at < 450;
          lastBasicPhotoTap = { fieldId, at: now };
          if (isDoubleTap) return openPhotoFieldEditor(field);
          return true;
        };

        const activateTextTarget = (target: FabricObject, e?: Event): boolean => {
          const fieldId = String(asAny(target).id ?? '').trim();
          if (!fieldId) return false;
          e?.preventDefault();
          const now = Date.now();
          const isDoubleTap =
            lastBasicTextTap?.fieldId === fieldId && now - lastBasicTextTap.at < 450;
          lastBasicTextTap = { fieldId, at: now };

          canvas.setActiveObject(target);
          onSelectionChange(getObjProps(target));

          if (shouldPreferTextEditSheet(modeRef.current)) {
            if (isDoubleTap) openTextEditSheetRef.current(target);
            return true;
          }

          if (isDoubleTap && isCoarsePointerEnvironment()) {
            openTextEditSheetRef.current(target);
            return true;
          }

          if (isDoubleTap && !isCoarsePointerEnvironment()) {
            beginTextEditingOnCanvas(canvas, target, inlineTextEditSessionRef, captureTextEditBaseline);
          }
          return true;
        };

        const activateInteractiveTarget = (target: FabricObject | undefined, e?: Event): boolean => {
          if (!target) return false;
          const photoField = resolvePhotoFieldTarget(target);
          if (photoField) {
            return activatePhotoFieldTarget(photoField, e);
          }
          if (isTextLikeObject(target)) {
            return activateTextTarget(target, e);
          }
          return false;
        };

        let lastCoarseTapHandledAt = 0;
        let coarseTouchStart: { x: number; y: number } | null = null;
        let basicTextClickLock: {
          target: FabricObject;
          lockMovementX: boolean | undefined;
          lockMovementY: boolean | undefined;
        } | null = null;
        const shouldUseCoarseTapActions = () =>
          modeRef.current === 'basic' || isCoarsePointerEnvironment() || isRestrictiveInAppBrowser();

        const handleCoarseTap = (e: Event, directTarget?: FabricObject): boolean => {
          if (!shouldUseCoarseTapActions()) return false;
          const now = Date.now();
          if (now - lastCoarseTapHandledAt < 200) return false;
          const scene = scenePointFromInteractionEvent(canvas, e);
          const target = resolveInteractiveTargetAtScene(
            canvas,
            scene.x,
            scene.y,
            directTarget,
          );
          const handled = activateInteractiveTarget(target, e);
          if (handled) {
            lastCoarseTapHandledAt = now;
            e.preventDefault();
            e.stopPropagation();
          }
          return handled;
        };

        const restoreBasicTextClickLock = () => {
          if (!basicTextClickLock) return;
          const { target, lockMovementX, lockMovementY } = basicTextClickLock;
          basicTextClickLock = null;
          target.set({ lockMovementX, lockMovementY });
          target.setCoords();
        };

        canvas.on('mouse:down:before', (opt) => {
          if (modeRef.current !== 'basic') return;
          const target = opt.target as FabricObject | undefined;
          if (!target || !isTextLikeObject(target)) return;
          if (canvas.getActiveObject() === target) return;

          restoreBasicTextClickLock();
          basicTextClickLock = {
            target,
            lockMovementX: target.lockMovementX,
            lockMovementY: target.lockMovementY,
          };
          target.set({ lockMovementX: true, lockMovementY: true });
          activateTextTarget(target, opt.e);
          lastCoarseTapHandledAt = Date.now();
          opt.e.preventDefault();
          opt.e.stopPropagation();
        });

        const onCanvasTouchStart = (ev: TouchEvent) => {
          if (!shouldUseCoarseTapActions()) return;
          const touch = ev.touches[0];
          if (!touch) {
            coarseTouchStart = null;
            return;
          }
          coarseTouchStart = { x: touch.clientX, y: touch.clientY };
        };

        const onCanvasTouchEnd = (ev: TouchEvent) => {
          if (!shouldUseCoarseTapActions()) return;
          if (ev.changedTouches.length === 0) return;
          const touch = ev.changedTouches[0]!;
          if (coarseTouchStart) {
            const dx = touch.clientX - coarseTouchStart.x;
            const dy = touch.clientY - coarseTouchStart.y;
            coarseTouchStart = null;
            if (Math.hypot(dx, dy) > 12) return;
          }
          handleCoarseTap(ev, undefined);
        };
        const onCanvasPointerUp = (ev: PointerEvent) => {
          if (!shouldUseCoarseTapActions()) return;
          if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
          handleCoarseTap(ev, undefined);
        };
        const touchOpts = { passive: false, capture: true } as const;
        canvas.upperCanvasEl.addEventListener('touchstart', onCanvasTouchStart, touchOpts);
        canvas.lowerCanvasEl.addEventListener('touchstart', onCanvasTouchStart, touchOpts);
        canvas.upperCanvasEl.addEventListener('touchend', onCanvasTouchEnd, touchOpts);
        canvas.lowerCanvasEl.addEventListener('touchend', onCanvasTouchEnd, touchOpts);
        canvas.upperCanvasEl.addEventListener('pointerup', onCanvasPointerUp, touchOpts);

        canvas.on('mouse:down', (opt) => {
          if ((opt.e as MouseEvent).altKey) {
            isPanning = true;
            canvas.selection = false;
            lastPan = { x: (opt.e as MouseEvent).clientX, y: (opt.e as MouseEvent).clientY };
            return;
          }
        });
        canvas.on('mouse:move', (opt) => {
          if (!isPanning) return;
          const e = opt.e as MouseEvent;
          canvas.relativePan(new Point(e.clientX - lastPan.x, e.clientY - lastPan.y));
          lastPan = { x: e.clientX, y: e.clientY };
        });
        canvas.on('mouse:up', (opt) => {
          isPanning = false;
          canvas.selection = true;
          restoreBasicTextClickLock();
          if (shouldUseCoarseTapActions() || isCoarsePointerEvent(opt.e)) {
            handleCoarseTap(opt.e, opt.target as FabricObject | undefined);
          }
        });

        canvas.on('mouse:dblclick', (opt) => {
          const raw = opt.target as FabricObject | undefined;
          const scene = scenePointFromInteractionEvent(canvas, opt.e);
          const target = raw && isTextLikeObject(raw)
            ? raw
            : resolveInteractiveTargetAtScene(canvas, scene.x, scene.y, raw);
          if (target && isTextLikeObject(target)) {
            if (shouldPreferTextEditSheet(modeRef.current) || isCoarsePointerEnvironment()) {
              openTextEditSheetRef.current(target);
            } else if (!isCoarsePointerEnvironment()) {
              beginTextEditingOnCanvas(canvas, target, inlineTextEditSessionRef, captureTextEditBaseline);
            }
            return;
          }
          openPhotoFieldEditor(raw);
        });

        // Drag-and-drop images onto canvas (файлы ОС, URL, фото из галереи сайдбара)
        const wrapper = canvasElRef.current?.parentElement as HTMLElement | null;
        let removeCanvasDropListeners: (() => void) | null = null;
        if (wrapper) {
          const onDragOver = (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            const { x, y } = scenePointFromDrop(e);
            updatePhotoFieldDropHighlight(
              canvas,
              photoFieldDropHighlightRef.current,
              findPhotoFieldAtScene(canvas, x, y) ?? null,
            );
          };

          const scenePointFromDrop = (e: DragEvent) => {
            const p = canvas.getScenePoint(e);
            return { x: p.x, y: p.y };
          };

          const onDragLeave = (e: DragEvent) => {
            if (wrapper.contains(e.relatedTarget as Node | null)) return;
            clearPhotoFieldDropHighlight(canvas, photoFieldDropHighlightRef.current);
          };

          const onDrop = async (e: DragEvent) => {
            e.preventDefault();
            const dt = e.dataTransfer;
            if (!dt) return;

            const { x, y } = scenePointFromDrop(e);
            const hit = findPhotoFieldAtScene(canvas, x, y);
            clearPhotoFieldDropHighlight(canvas, photoFieldDropHighlightRef.current);

            const sidebarRaw = dt.getData(SIDEBAR_PHOTO_DRAG_MIME);
            if (sidebarRaw) {
              let photoId: string | null = null;
              try {
                const parsed = JSON.parse(sidebarRaw) as { id?: unknown };
                if (typeof parsed?.id === 'string') photoId = parsed.id;
              } catch {
                photoId = null;
              }
              const sideFile =
                photoId && getSidebarPhotoFileRef.current
                  ? getSidebarPhotoFileRef.current(photoId)
                  : undefined;
              if (photoId && sideFile && isLikelyImageFile(sideFile)) {
                try {
                  if (hit) {
                    await fillPhotoFieldWithSnapshot(canvas, hit, sideFile);
                  } else {
                    await addImageFileToCanvas(canvas, sideFile, resolveImageFileUrlRef.current);
                  }
                  onSidebarPhotoDroppedRef.current?.(photoId);
                } catch {
                  /* ошибки сети/декода — молча */
                }
                return;
              }
            }

            const file = Array.from(dt.files ?? []).find((f) => isLikelyImageFile(f));
            if (file) {
              if (hit) {
                await fillPhotoFieldWithSnapshot(canvas, hit, file);
              } else {
                await addImageFileToCanvas(canvas, file, resolveImageFileUrlRef.current);
              }
              return;
            }

            const raw =
              dt.getData('text/uri-list') ||
              dt.getData('text/plain') ||
              dt.getData('URL') ||
              '';
            const firstUrl = raw
              .split(/\r?\n/)
              .map((s) => s.trim())
              .find((s) => looksLikeHttpUrl(s));
            if (firstUrl && remoteUrlHandlerRef.current) {
              try {
                await remoteUrlHandlerRef.current(firstUrl);
              } catch {
                /* ошибку показывает родитель */
              }
            }
          };

          wrapper.addEventListener('dragover', onDragOver);
          wrapper.addEventListener('dragleave', onDragLeave);
          wrapper.addEventListener('drop', onDrop);
          removeCanvasDropListeners = () => {
            wrapper.removeEventListener('dragover', onDragOver);
            wrapper.removeEventListener('dragleave', onDragLeave);
            wrapper.removeEventListener('drop', onDrop);
          };
        }

        // Keyboard: Delete, undo/redo, copy/paste and precise movement.
        const onKeyDown = (e: KeyboardEvent) => {
          const active = document.activeElement;
          const wrapper2 = canvasElRef.current?.closest('.fabric-canvas-outer') as HTMLElement | null;
          if (active && active !== document.body && !(wrapper2?.contains(active as Node) ?? false)) {
            return;
          }
          // IText in edit mode — let Fabric handle keys
          const activeObj = canvas.getActiveObject();
          if (activeObj && (activeObj as unknown as AnyObj).isEditing) return;
          const key = e.key.toLowerCase();
          const isModifierShortcut = e.ctrlKey || e.metaKey;

          if (isModifierShortcut && key === 'c') {
            const targets = getKeyboardTargetObjects(canvas, modeRef.current);
            if (targets.length > 0) {
              e.preventDefault();
              void cloneFabricObjects(targets).then((clones) => {
                clipboardObjectsRef.current = clones;
              });
            }
            return;
          }

          if (isModifierShortcut && key === 'v') {
            if (clipboardObjectsRef.current.length > 0) {
              e.preventDefault();
              void cloneFabricObjects(clipboardObjectsRef.current, {
                offset: CLIPBOARD_PASTE_OFFSET_PX,
                regenerateIds: true,
              }).then((clones) => {
                let pastedClones = clones;
                if (modeRef.current === 'basic') {
                  pastedClones = clones.filter((clone) => canKeyboardTransformObject(clone, 'basic'));
                  pastedClones.forEach((clone) => canvas.add(clone));
                  applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
                } else {
                  pastedClones.forEach((clone) => canvas.add(clone));
                }
                if (pastedClones.length === 0) return;
                activateClonedObjects(canvas, pastedClones);
                clipboardObjectsRef.current = pastedClones;
                canvas.requestRenderAll();
                onSelectionChange(pastedClones.length === 1 ? getObjProps(pastedClones[0]!) : null);
                scheduleTextAnchorRef.current?.();
                saveSnapshot();
              });
            }
            return;
          }

          if (!e.altKey && !isModifierShortcut && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
            const step = resolveKeyboardNudgePx(canvas, e.shiftKey);
            const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
            const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
            if (moveActiveObjectsByKeyboard(canvas, dx, dy, modeRef.current)) {
              e.preventDefault();
              const nextActive = canvas.getActiveObject();
              if (nextActive) onSelectionChange(getObjProps(nextActive));
              scheduleTextAnchorRef.current?.();
              saveSnapshot();
            }
            return;
          }

          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const targets = canvas.getActiveObjects().filter((obj) => (
              modeRef.current === 'basic'
                ? canDeleteObjectInBasicMode(obj)
                : !asAny(obj).isBackground
            ));
            if (targets.length === 0) return;
            targets.forEach((obj) => {
              if (modeRef.current === 'basic' && (asAny(obj).isPhotoField || resolvePhotoFieldTarget(obj))) {
                deletePhotoFieldTargetInBasicMode(canvas, obj);
              } else {
                detachFabricObject(canvas, obj);
              }
            });
            canvas.discardActiveObject();
            if (modeRef.current === 'basic') {
              applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
            }
            canvas.requestRenderAll();
            onSelectionChange(null);
            saveSnapshot();
          }
          if (isModifierShortcut && key === 'z') {
            e.preventDefault();
            void undo();
          }
          if (isModifierShortcut && key === 'y') {
            e.preventDefault();
            void redo();
          }
          if (isModifierShortcut && key === 'd') {
            e.preventDefault();
            duplicateActiveObjects(canvas, modeRef.current, saveSnapshot, selectionDisplayScaleRef.current);
          }
        };
        window.addEventListener('keydown', onKeyDown);

        // Ctrl+V — вставка изображения из буфера обмена
        const onPaste = (e: ClipboardEvent) => {
          const active = document.activeElement;
          const wrapper2 = canvasElRef.current?.closest('.fabric-canvas-outer') as HTMLElement | null;
          // Не перехватываем, если фокус в текстовом поле вне холста
          if (
            active &&
            active !== document.body &&
            !(wrapper2?.contains(active as Node) ?? false) &&
            active.tagName !== 'CANVAS'
          ) return;
          const activeObj = canvas.getActiveObject();
          if (activeObj && (activeObj as unknown as AnyObj).isEditing) return;

          const items = e.clipboardData?.items ?? [];
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              e.preventDefault();
              const file = item.getAsFile();
              if (!file) break;
              const p = photoPasteSceneRef.current;
              void (async () => {
                const hit = findPhotoFieldAtScene(canvas, p.x, p.y);
                if (hit) {
                  await fillPhotoFieldWithSnapshot(canvas, hit, file);
                } else {
                  await addImageFileToCanvas(canvas, file, resolveImageFileUrlRef.current);
                }
              })();
              break;
            }
          }
        };
        window.addEventListener('paste', onPaste);

  return () => {
    restoreBasicTextClickLock();
    removeCanvasDropListeners?.();
    cancelAnimationFrame(textAnchorRafRef.current);
    scheduleTextAnchorRef.current = null;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('paste', onPaste);
    canvas.upperCanvasEl.removeEventListener('mousemove', trackPasteScene);
    canvas.upperCanvasEl.removeEventListener('touchstart', onCanvasTouchStart, true);
    canvas.lowerCanvasEl.removeEventListener('touchstart', onCanvasTouchStart, true);
    canvas.upperCanvasEl.removeEventListener('touchend', onCanvasTouchEnd, true);
    canvas.lowerCanvasEl.removeEventListener('touchend', onCanvasTouchEnd, true);
    canvas.upperCanvasEl.removeEventListener('pointerup', onCanvasPointerUp, true);
  };
}
