import type { MutableRefObject } from 'react';
import {
  Circle,
  FabricImage,
  Group,
  IText,
  Line,
  Rect,
  Shadow,
  Triangle,
  type Canvas,
  type FabricObject,
} from 'fabric';
import type { CollageLayout, DesignTemplate } from '../../../../api';
import { reloadFabricCanvasFonts } from '../../../../utils/fabricFontReload';
import { finalizeEmptyPhotoFieldPlacement } from '../photoFieldEmpty';
import { createEmptyPhotoField, createClientTextbox } from '../designFields';
import { resolvePhotoFieldSizeForPage } from '../photoFieldClientSizing';
import { clearPhotoFieldDropHighlight, createPhotoFieldDropHighlightState } from '../photoFieldDropHighlight';
import { loadDesignPageScene, loadSpreadMergedScene } from '../designPageLoader';
import { isRestrictiveInAppBrowser, shouldPreferTextEditSheet } from '../inAppBrowser';
import { splitSpreadCanvasToPagesSync } from '../spreadCanvas';
import { applyFormatToTextField, type TextStyleRun } from '../textStyleRuns';
import type { TextBlockPresetKind } from '../constants';
import { TEXT_BLOCK_PRESETS, TEXT_FONTS } from '../constants';
import type { DesignPage, SelectedObjProps } from '../types';
import type { PageTransitionGate } from '../pageTransitionGate';
import type { DesignEditorCanvasHandle, SavePageResult } from '../DesignEditorCanvas';
import type { PhotoPickSheetState } from '../EditorInAppFieldSheets';
import type { CanvasHistoryStack } from './canvasHistory';
import type { EditorMode, ResolveImageFileUrl } from './types';
import {
  addImageFileToCanvas,
  addImageUrlToCanvas,
} from './canvasCommands';
import {
  applyBasicModeConstraints,
  canDeleteObjectInBasicMode,
  clearFilledPhotoField,
  deletePhotoFieldTargetInBasicMode,
} from './canvasBasicMode';
import { beginTextEditingOnCanvas } from './canvasTextEditing';
import { duplicateActiveObjects } from './canvasKeyboard';
import { detachFabricObject } from './canvasObjectDetach';
import {
  findDesignObjectByIdDeep,
  findPhotoFieldByIdDeep,
  getObjProps,
  resolvePhotoFieldTarget,
} from './canvasSelection';
import { canvasToJSON, parsePageLoadKey } from './canvasSerialization';
import {
  asAny,
  isTextLikeObject,
} from './canvasUtils';
import { isCoarsePointerEnvironment } from './canvasPointer';

export interface DesignEditorCanvasHandleDeps {
  fabricRef: MutableRefObject<Canvas | null>;
  historyRef: MutableRefObject<CanvasHistoryStack>;
  isLoadingRef: MutableRefObject<boolean>;
  pageTransitionGate: PageTransitionGate;
  spreadPairPagesRef: MutableRefObject<[number, number] | null>;
  pageWidthRef: MutableRefObject<number>;
  pageHeightRef: MutableRefObject<number>;
  currentPageRef: MutableRefObject<number>;
  pagesRef: MutableRefObject<DesignPage[]>;
  pageLoadKeyRef: MutableRefObject<string>;
  templateRef: MutableRefObject<DesignTemplate | null>;
  modeRef: MutableRefObject<EditorMode>;
  selectionDisplayScaleRef: MutableRefObject<number>;
  photoPickerTargetIdRef: MutableRefObject<string | null>;
  photoFileInputRef: MutableRefObject<HTMLInputElement | null>;
  photoFieldSkipBakeOnceRef: MutableRefObject<string | null>;
  photoFieldDropHighlightRef: MutableRefObject<ReturnType<typeof createPhotoFieldDropHighlightState>>;
  inlineTextEditSessionRef: MutableRefObject<boolean>;
  scheduleTextAnchorRef: MutableRefObject<(() => void) | null>;
  resolveImageFileUrlRef: MutableRefObject<ResolveImageFileUrl | undefined>;
  safeZonePx: number;
  apiBaseUrl: string;
  undo: () => void;
  redo: () => void;
  saveSnapshot: () => void;
  fillPhotoFieldWithSnapshot: (canvas: Canvas, field: FabricObject, file: File) => Promise<void>;
  openTextEditSheetForTarget: (target: FabricObject) => boolean;
  captureTextEditBaseline: (target: FabricObject) => void;
  setPhotoPickSheet: (state: PhotoPickSheetState | null) => void;
  onSelectionChange: (info: SelectedObjProps | null) => void;
  onZoomChange: (zoom: number) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
}

export function createDesignEditorCanvasHandle(d: DesignEditorCanvasHandleDeps): DesignEditorCanvasHandle {
  const getCanvasForEdit = async (): Promise<Canvas | null> => {
    await d.pageTransitionGate.waitUntilIdle();
    return d.fabricRef.current;
  };

  return {
      undo: d.undo,
      redo: d.redo,
      focusDesignObject: (id, options) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const target = findDesignObjectByIdDeep(canvas, id);
        if (!target) return false;
        const selectableTarget = target.group ?? target;
        canvas.setActiveObject(selectableTarget);
        if (options?.editText && isTextLikeObject(selectableTarget)) {
          if (shouldPreferTextEditSheet(d.modeRef.current)) {
            d.openTextEditSheetForTarget(selectableTarget);
          } else if (!isCoarsePointerEnvironment()) {
            beginTextEditingOnCanvas(canvas, selectableTarget, d.inlineTextEditSessionRef, d.captureTextEditBaseline);
          }
        }
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(selectableTarget));
        d.scheduleTextAnchorRef.current?.();
        return true;
      },
      replacePhotoField: (id) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        const selectableTarget = field.group ?? field;
        canvas.setActiveObject(selectableTarget);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(selectableTarget));
        if (isRestrictiveInAppBrowser()) {
          d.setPhotoPickSheet({ fieldId: id, label: 'Фото-поле' });
          return true;
        }
        d.photoPickerTargetIdRef.current = id;
        d.photoFileInputRef.current?.click();
        return true;
      },
      deleteSelected: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const targets = canvas.getActiveObjects().filter((obj) => (
          d.modeRef.current === 'basic'
            ? canDeleteObjectInBasicMode(obj)
            : !asAny(obj).isBackground
        ));
        if (targets.length === 0) return;
        targets.forEach((obj) => {
          if (d.modeRef.current === 'basic' && (asAny(obj).isPhotoField || resolvePhotoFieldTarget(obj))) {
            deletePhotoFieldTargetInBasicMode(canvas, obj);
          } else {
            detachFabricObject(canvas, obj);
          }
        });
        canvas.discardActiveObject();
        if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        d.onSelectionChange(null);
        d.saveSnapshot();
      },
      clearPhotoField: (id) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        const cleared = clearFilledPhotoField(canvas, field);
        if (!cleared) return false;
        if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(canvas.getActiveObject()!));
        d.saveSnapshot();
        return true;
      },
      setSelectionDisplayScale: (scale) => {
        const next = Number.isFinite(scale) && scale > 0 ? scale : 1;
        if (Math.abs(d.selectionDisplayScaleRef.current - next) < 0.01) return;
        d.selectionDisplayScaleRef.current = next;
        const canvas = d.fabricRef.current;
        if (!canvas || d.modeRef.current !== 'basic') return;
        applyBasicModeConstraints(canvas, next);
        const active = canvas.getActiveObject();
        if (active) {
          active.setCoords();
          canvas.requestRenderAll();
        }
      },
      addText: async () => {
        const canvas = await getCanvasForEdit();
        if (!canvas) return;
        const text = d.modeRef.current === 'basic'
          ? createClientTextbox({
              text: 'Текст',
              pageWidthPx: d.pageWidthRef.current,
              pageHeightPx: d.pageHeightRef.current,
              safeZonePx: d.safeZonePx,
              fontSize: 28,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#000000',
              centerInSafeZone: true,
            })
          : new IText('Текст', {
              left: canvas.width! / 2 - 40,
              top: canvas.height! / 2 - 15,
              fontSize: 28,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#000000',
            });
        canvas.add(text);
        canvas.setActiveObject(text);
        if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(text));
        d.saveSnapshot();
      },
      addTextPreset: async (kind: TextBlockPresetKind) => {
        const canvas = await getCanvasForEdit();
        if (!canvas) return;
        const p = TEXT_BLOCK_PRESETS[kind];
        const text = d.modeRef.current === 'basic'
          ? createClientTextbox({
              text: p.defaultText,
              pageWidthPx: d.pageWidthRef.current,
              pageHeightPx: d.pageHeightRef.current,
              safeZonePx: d.safeZonePx,
              fontSize: p.fontSize,
              fontWeight: p.fontWeight,
              lineHeight: p.lineHeight,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#111827',
              centerInSafeZone: true,
            })
          : new IText(p.defaultText, {
              left: canvas.width! / 2 - 120,
              top: canvas.height! / 2 - Math.round(p.fontSize / 2),
              fontSize: p.fontSize,
              fontWeight: p.fontWeight,
              lineHeight: p.lineHeight,
              fontFamily: TEXT_FONTS[0].value,
              fill: '#111827',
            });
        canvas.add(text);
        canvas.setActiveObject(text);
        if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(text));
        d.saveSnapshot();
      },
      addImageFromFile: async (file: File) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        await addImageFileToCanvas(canvas, file, d.resolveImageFileUrlRef.current);
      },
      fillPhotoFieldFromFile: async (id: string, file: File) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        await d.fillPhotoFieldWithSnapshot(canvas, field, file);
        return true;
      },
      fillPhotoFieldFromUrl: async (id: string, url: string, originalName?: string) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const field = findPhotoFieldByIdDeep(canvas, id);
        if (!field) return false;
        const response = await fetch(url);
        if (!response.ok) return false;
        const blob = await response.blob();
        const contentType = blob.type || 'image/jpeg';
        const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const file = new File([blob], originalName || `photo-field-${Date.now()}.${ext}`, { type: contentType });
        await d.fillPhotoFieldWithSnapshot(canvas, field, file);
        return true;
      },
      addPhotoField: async (options) => {
        const canvas = await getCanvasForEdit();
        if (!canvas) return;
        const pair = d.spreadPairPagesRef.current;
        const pageSafeLeft = pair && d.currentPageRef.current === pair[1] ? d.pageWidthRef.current : 0;
        const safeLeft = pageSafeLeft + d.safeZonePx;
        const safeTop = d.safeZonePx;
        const safeWidth = Math.max(1, d.pageWidthRef.current - d.safeZonePx * 2);
        const safeHeight = Math.max(1, canvas.height! - d.safeZonePx * 2);

        let width: number;
        let height: number;
        const aspectW = Number(options?.aspectW);
        const aspectH = Number(options?.aspectH);
        if (Number.isFinite(aspectW) && aspectW > 0 && Number.isFinite(aspectH) && aspectH > 0) {
          ({ width, height } = resolvePhotoFieldSizeForPage({
            aspectW,
            aspectH,
            pageWidthPx: d.pageWidthRef.current,
            pageHeightPx: d.pageHeightRef.current,
            safeZonePx: d.safeZonePx,
          }));
        } else if (options?.width != null && options?.height != null) {
          width = Math.max(32, Number(options.width) || 32);
          height = Math.max(32, Number(options.height) || width);
        } else {
          ({ width, height } = resolvePhotoFieldSizeForPage({
            aspectW: 1,
            aspectH: 1,
            pageWidthPx: d.pageWidthRef.current,
            pageHeightPx: d.pageHeightRef.current,
            safeZonePx: d.safeZonePx,
          }));
        }

        const fieldId = `field-${Date.now()}`;
        const fieldLeft = safeLeft + (safeWidth - width) / 2;
        const fieldTop = safeTop + (safeHeight - height) / 2;
        const field = createEmptyPhotoField({
          id: fieldId,
          left: fieldLeft,
          top: fieldTop,
          width,
          height,
          clientAdded: true,
        });
        d.photoFieldSkipBakeOnceRef.current = fieldId;
        canvas.add(field);
        finalizeEmptyPhotoFieldPlacement(field as Group, { x: fieldLeft, y: fieldTop });
        canvas.setActiveObject(field);
        if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(field));
        d.saveSnapshot();
      },
      applyCollageLayout: (layout: CollageLayout, paddingPercent: number) => {
        const canvas = d.fabricRef.current;
        if (!canvas || d.modeRef.current === 'basic') return;
        const cells = Array.isArray(layout.cells) ? layout.cells : [];
        if (cells.length === 0) return;

        const pair = d.spreadPairPagesRef.current;
        const pageSafeLeft = pair && d.currentPageRef.current === pair[1] ? d.pageWidthRef.current : 0;
        const safeLeft = pageSafeLeft + d.safeZonePx;
        const safeTop = d.safeZonePx;
        const safeWidth = Math.max(1, d.pageWidthRef.current - d.safeZonePx * 2);
        const safeHeight = Math.max(1, canvas.height! - d.safeZonePx * 2);
        const margin = Math.min(0.3, Math.max(0, paddingPercent) / 100 / 2);
        const scale = 1 - 2 * margin;
        const stamp = Date.now();
        const fields = cells
          .map((cell, index) => {
            const x = Math.max(0, Math.min(1, Number(cell.x) || 0));
            const y = Math.max(0, Math.min(1, Number(cell.y) || 0));
            const w = Math.max(0.02, Math.min(1, Number(cell.w) || 0));
            const h = Math.max(0.02, Math.min(1, Number(cell.h) || 0));
            const left = safeLeft + (margin + x * scale) * safeWidth;
            const top = safeTop + (margin + y * scale) * safeHeight;
            return {
              field: createEmptyPhotoField({
                id: `field-${stamp}-${index}`,
                left,
                top,
                width: Math.max(24, w * scale * safeWidth),
                height: Math.max(24, h * scale * safeHeight),
              }),
              anchor: { x: left, y: top },
            };
          });

        canvas.add(...fields.map((entry) => entry.field));
        for (const entry of fields) {
          finalizeEmptyPhotoFieldPlacement(entry.field as Group, entry.anchor);
        }
        canvas.discardActiveObject();
        canvas.setActiveObject(fields[0]!.field);
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      autofillPhotoFields: async () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const objects = canvas.getObjects();
        const sources = objects.filter(
          (o) =>
            o.type === 'image' &&
            !asAny(o).isBackground &&
            !asAny(o).isPhotoField,
        ) as FabricImage[];
        const targets = objects.filter((o) => {
          if (!asAny(o).isPhotoField) return false;
          /* Пустая рамка (rect/group) или старый макет: одно image с флагом */
          return o.type === 'rect' || o.type === 'group' || o.type === 'image';
        }) as FabricObject[];
        if (sources.length === 0 || targets.length === 0) return;

        const sortReading = (objs: FabricObject[]) =>
          [...objs].sort((a, b) => {
            const ra = a.getBoundingRect();
            const rb = b.getBoundingRect();
            const cya = ra.top + ra.height / 2;
            const cyb = rb.top + rb.height / 2;
            const rowTol = Math.min(96, Math.max(24, canvas.height! * 0.04));
            if (Math.abs(cya - cyb) > rowTol) return cya - cyb;
            return ra.left + ra.width / 2 - (rb.left + rb.width / 2);
          });

        const sortSources = sortReading(sources as FabricObject[]) as FabricImage[];
        const orderedTargets = sortReading(targets);
        const n = Math.min(sortSources.length, orderedTargets.length);
        for (let i = 0; i < n; i++) {
          const src = sortSources[i];
          const field = orderedTargets[i];
          if (src.canvas !== canvas || field.canvas !== canvas) continue;
          const dataUrl = src.toDataURL({ format: 'png', multiplier: 1 });
          const blob = await fetch(dataUrl).then((r) => r.blob());
          const file = new File([blob], `autofill-${i}.png`, { type: 'image/png' });
          await d.fillPhotoFieldWithSnapshot(canvas, field, file);
          if (src.canvas === canvas) canvas.remove(src);
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      },
      addShape: async (type) => {
        const canvas = await getCanvasForEdit();
        if (!canvas) return;
        const cx = canvas.width! / 2;
        const cy = canvas.height! / 2;
        let obj;
        switch (type) {
          case 'rect':
            obj = new Rect({ left: cx - 50, top: cy - 30, width: 100, height: 60, fill: '#3b82f6' });
            break;
          case 'circle':
            obj = new Circle({ left: cx - 40, top: cy - 40, radius: 40, fill: '#3b82f6' });
            break;
          case 'line':
            obj = new Line([cx - 60, cy, cx + 60, cy], { stroke: '#1f2937', strokeWidth: 3 });
            break;
          case 'triangle':
            obj = new Triangle({ left: cx - 40, top: cy - 40, width: 80, height: 80, fill: '#3b82f6' });
            break;
          default:
            return;
        }
        canvas.add(obj);
        canvas.setActiveObject(obj);
        if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(obj));
        d.saveSnapshot();
      },
      getDataURL: (opts) =>
        d.fabricRef.current?.toDataURL({ format: 'png', multiplier: opts?.multiplier ?? 2 }) ?? '',
      saveCurrentPage: async (): Promise<SavePageResult> => {
        await d.pageTransitionGate.waitUntilIdle();
        const canvas = d.fabricRef.current;
        if (!canvas) return { kind: 'single', json: {} };
        const pw = d.pageWidthRef.current;
        clearPhotoFieldDropHighlight(canvas, d.photoFieldDropHighlightRef.current);
        if (d.spreadPairPagesRef.current) {
          const { left, right } = splitSpreadCanvasToPagesSync(canvas, pw);
          return { kind: 'spread', left, right };
        }
        return { kind: 'single', json: canvasToJSON(canvas) };
      },
      loadPageForExport: async (pageData: DesignPage, pageIndex = 0) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const pw = d.pageWidthRef.current;
        const ph = d.pageHeightRef.current;
        clearPhotoFieldDropHighlight(canvas, d.photoFieldDropHighlightRef.current);
        d.isLoadingRef.current = true;
        try {
          canvas.setDimensions({ width: pw, height: ph });
          await loadDesignPageScene({
            canvas,
            pageData,
            pageIndex,
            template: d.templateRef.current,
            pageW: pw,
            pageH: ph,
            apiBaseUrl: d.apiBaseUrl,
          });
          if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
          canvas.requestRenderAll();
        } finally {
          d.isLoadingRef.current = false;
        }
      },
      reloadTextFonts: async () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        await reloadFabricCanvasFonts(canvas);
      },
      applyEditorViewState: async (pagesOverride?: DesignPage[]) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        clearPhotoFieldDropHighlight(canvas, d.photoFieldDropHighlightRef.current);
        const pagesSource = pagesOverride ?? d.pagesRef.current;
        const pair = d.spreadPairPagesRef.current;
        const key = parsePageLoadKey(d.pageLoadKeyRef.current);
        const pw = d.pageWidthRef.current;
        const ph = d.pageHeightRef.current;
        d.isLoadingRef.current = true;
        try {
          if (pair && key?.type === 'spread') {
            canvas.setDimensions({ width: pw * 2, height: ph });
            await loadSpreadMergedScene({
              canvas,
              leftPage: pagesSource[pair[0]],
              rightPage: pagesSource[pair[1]],
              leftPageIndex: pair[0],
              rightPageIndex: pair[1],
              pageW: pw,
              pageH: ph,
              template: d.templateRef.current,
              apiBaseUrl: d.apiBaseUrl,
            });
          } else if (key?.type === 'single') {
            canvas.setDimensions({ width: pw, height: ph });
            await loadDesignPageScene({
              canvas,
              pageData: pagesSource[key.index],
              pageIndex: key.index,
              template: d.templateRef.current,
              pageW: pw,
              pageH: ph,
              apiBaseUrl: d.apiBaseUrl,
            });
          }
          if (d.modeRef.current === 'basic') applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
          canvas.requestRenderAll();
          if (pagesOverride) {
            const snap = JSON.stringify(canvasToJSON(canvas));
            d.historyRef.current.reset(snap);
            d.onHistoryChange(false, false);
          }
        } finally {
          d.isLoadingRef.current = false;
        }
      },
      duplicateSelected: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        duplicateActiveObjects(canvas, d.modeRef.current, d.saveSnapshot, d.selectionDisplayScaleRef.current);
      },
      addImageFromUrl: async (url: string) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        await addImageUrlToCanvas(canvas, url);
      },
      setTextProp: (key: string, value: unknown) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return;
        applyFormatToTextField(active as IText & { textStyleRuns?: TextStyleRun[] }, { [key]: value });
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(active));
        d.saveSnapshot();
      },
      setTextStyle: (props: { fontWeight?: string; fontStyle?: string }) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return;
        applyFormatToTextField(active as IText & { textStyleRuns?: TextStyleRun[] }, props);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(active));
        d.saveSnapshot();
      },
      applyTextPropsToSelection: (props: Record<string, unknown>) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return;
        const next: Record<string, unknown> = { ...props };
        if (next.shadow != null && typeof next.shadow === 'object' && !(next.shadow instanceof Shadow)) {
          next.shadow = new Shadow(next.shadow as object);
        }
        applyFormatToTextField(active as IText & { textStyleRuns?: TextStyleRun[] }, next);
        canvas.requestRenderAll();
        d.onSelectionChange(getObjProps(active));
        d.saveSnapshot();
      },
      setObjProp: (key: string, value: unknown) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (!asAny(o).isBackground) o.set({ [key]: value } as Parameters<typeof o.set>[0]);
        });
        canvas.requestRenderAll();
        const active = canvas.getActiveObject();
        if (active) d.onSelectionChange(getObjProps(active));
        d.saveSnapshot();
      },
      setCanvasBackground: (color: string) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.backgroundColor = color;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).backgroundImage = undefined;
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      setCanvasBackgroundImage: async (dataUrl: string) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
        img.set({
          scaleX: canvas.width! / (img.width || canvas.width!),
          scaleY: canvas.height! / (img.height || canvas.height!),
          originX: 'left',
          originY: 'top',
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
        });
        canvas.set({ backgroundImage: img });
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      clearCanvasBackground: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.backgroundColor = '#ffffff';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).backgroundImage = undefined;
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      bringForward: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => canvas.bringObjectForward(o));
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      sendBackward: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => canvas.sendObjectBackwards(o));
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      bringToFront: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => canvas.bringObjectToFront(o));
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      sendToBack: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (!asAny(o).isBackground) canvas.sendObjectToBack(o);
        });
        // Убеждаемся, что фон остаётся сзади
        const bg = canvas.getObjects().find((o) => asAny(o).isBackground);
        if (bg) canvas.sendObjectToBack(bg);
        canvas.requestRenderAll();
        d.saveSnapshot();
      },
      flipSelected: (axis: 'x' | 'y') => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (axis === 'x') o.set({ flipX: !o.flipX });
          else o.set({ flipY: !o.flipY });
        });
        canvas.requestRenderAll();
        const active = canvas.getActiveObject();
        if (active) d.onSelectionChange(getObjProps(active));
        d.saveSnapshot();
      },
      captureThumb: () =>
        d.fabricRef.current?.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 }) ?? '',
      getZoom: () => d.fabricRef.current?.getZoom() ?? 1,
      setZoom: (z: number) => {
        const canvas = d.fabricRef.current;
        if (!canvas) return;
        canvas.setZoom(Math.min(Math.max(z, 0.1), 10));
        d.onZoomChange(canvas.getZoom());
        if (d.modeRef.current === 'basic') {
          applyBasicModeConstraints(canvas, d.selectionDisplayScaleRef.current);
        }
      },
      syncTextFloatingAnchor: () => {
        d.scheduleTextAnchorRef.current?.();
      },
      syncCanvasOffset: () => {
        const c = d.fabricRef.current;
        if (!c) return;
        c.calcOffset();
        c.requestRenderAll();
      },
      openTextEditSheetForActive: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return false;
        return d.openTextEditSheetForTarget(active);
      },
      beginTextEditingForActive: () => {
        const canvas = d.fabricRef.current;
        if (!canvas) return false;
        const active = canvas.getActiveObject();
        if (!active || !isTextLikeObject(active)) return false;
        if (shouldPreferTextEditSheet(d.modeRef.current)) {
          return d.openTextEditSheetForTarget(active);
        }
        if (isCoarsePointerEnvironment()) {
          return true;
        }
        beginTextEditingOnCanvas(canvas, active, d.inlineTextEditSessionRef, d.captureTextEditBaseline);
        return true;
      },
      whenPageTransitionIdle: () => d.pageTransitionGate.waitUntilIdle(),
      isPageTransitionBusy: () => d.pageTransitionGate.isBusy(),
    };
}
