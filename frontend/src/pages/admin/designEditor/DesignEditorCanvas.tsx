import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback,
} from 'react';
import {
  Canvas,
  FabricImage,
  IText,
  Rect,
  Circle,
  Line,
  Triangle,
  Point,
} from 'fabric';
import type { DesignTemplate } from '../../../api';
import type { DesignPage, SelectedObjProps } from './types';
import { TEXT_FONTS } from './constants';

// ─── Custom property names saved in Fabric JSON ───────────────────────────────

const CUSTOM_PROPS = ['id', 'isBackground', 'isPhotoField', 'locked'];

// ─── Public handle exposed via forwardRef ────────────────────────────────────

export interface DesignEditorCanvasHandle {
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  addText: () => void;
  addImageFromFile: (file: File) => Promise<void>;
  addPhotoField: () => void;
  addShape: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
  getDataURL: (opts?: { multiplier?: number }) => string;
  saveCurrentPage: () => Record<string, unknown>;
  loadPage: (pageData: DesignPage) => Promise<void>;
  setTextProp: (key: string, value: unknown) => void;
  getZoom: () => number;
  setZoom: (z: number) => void;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface DesignEditorCanvasProps {
  template: DesignTemplate | null;
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
  pages: DesignPage[];
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  currentPage: number;
  showGuides: boolean;
  apiBaseUrl: string;
  onSelectionChange: (info: SelectedObjProps | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onZoomChange: (zoom: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

function asAny(obj: unknown): AnyObj {
  return obj as unknown as AnyObj;
}

function resolvePreviewUrl(template: DesignTemplate | null, apiBaseUrl: string): string | null {
  if (!template?.preview_url) return null;
  if (template.preview_url.startsWith('http')) return template.preview_url;
  const base = apiBaseUrl.replace(/\/api\/?$/, '');
  return `${base}${template.preview_url.startsWith('/') ? '' : '/'}${template.preview_url}`;
}

function getObjProps(obj: unknown): SelectedObjProps {
  const o = asAny(obj);
  const typeName = (o.type as string) ?? '';
  const isPhoto = !!o.isPhotoField;

  let type: SelectedObjProps['type'] = 'other';
  if (isPhoto) type = 'photoField';
  else if (typeName === 'i-text' || typeName === 'textbox') type = 'IText';
  else if (typeName === 'image') type = 'image';
  else if (typeName === 'rect') type = 'rect';
  else if (typeName === 'circle') type = 'circle';
  else if (typeName === 'line') type = 'line';
  else if (typeName === 'triangle') type = 'triangle';

  return {
    type,
    text: type === 'IText' ? (o.text as string) : undefined,
    fontFamily: o.fontFamily as string | undefined,
    fontSize: o.fontSize as number | undefined,
    fontWeight: (o.fontWeight as string) ?? 'normal',
    fontStyle: (o.fontStyle as string) ?? 'normal',
    underline: !!(o.underline),
    textAlign: (o.textAlign as string) ?? 'left',
    fill: o.fill as string | undefined,
    stroke: o.stroke as string | undefined,
    strokeWidth: o.strokeWidth as number | undefined,
  };
}

function canvasToJSON(canvas: Canvas): Record<string, unknown> {
  return canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
}

async function loadPageIntoCanvas(
  canvas: Canvas,
  pageData: DesignPage | undefined,
  template: DesignTemplate | null,
  pageW: number,
  pageH: number,
  apiBaseUrl: string,
  isLoadingRef: React.MutableRefObject<boolean>,
): Promise<void> {
  isLoadingRef.current = true;
  try {
    if (pageData?.fabricJSON && Object.keys(pageData.fabricJSON).length > 0) {
      await canvas.loadFromJSON(pageData.fabricJSON);
      canvas.getObjects().forEach((obj) => {
        if (asAny(obj).isBackground) {
          obj.set({ selectable: false, evented: false });
        }
      });
    } else {
      canvas.clear();
      (canvas as unknown as AnyObj).backgroundColor = 'white';
      const previewUrl = resolvePreviewUrl(template, apiBaseUrl);
      if (previewUrl) {
        try {
          const img = await FabricImage.fromURL(previewUrl, { crossOrigin: 'anonymous' });
          img.set({
            left: 0,
            top: 0,
            scaleX: pageW / (img.width || pageW),
            scaleY: pageH / (img.height || pageH),
            selectable: false,
            evented: false,
          });
          (img as unknown as AnyObj).isBackground = true;
          canvas.add(img);
          canvas.sendObjectToBack(img);
        } catch {
          // preview not available
        }
      }
    }
    canvas.requestRenderAll();
  } finally {
    isLoadingRef.current = false;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const DesignEditorCanvas = forwardRef<DesignEditorCanvasHandle, DesignEditorCanvasProps>(
  (
    {
      template,
      pageWidthPx,
      pageHeightPx,
      safeZonePx,
      pages,
      setPages,
      currentPage,
      showGuides,
      apiBaseUrl,
      onSelectionChange,
      onHistoryChange,
      onZoomChange,
    },
    ref,
  ) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
    const isLoadingRef = useRef(false);
    const prevPageRef = useRef(currentPage);
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const templateRef = useRef(template);
    templateRef.current = template;

    const [photoPickerFieldId, setPhotoPickerFieldId] = useState<string | null>(null);
    const photoFileInputRef = useRef<HTMLInputElement>(null);

    // ── History ──────────────────────────────────────────────────────────────

    const saveSnapshot = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas || isLoadingRef.current) return;
      const json = JSON.stringify(canvasToJSON(canvas));
      const { stack, index } = historyRef.current;
      const newStack = stack.slice(0, index + 1);
      newStack.push(json);
      if (newStack.length > 50) newStack.shift();
      historyRef.current = { stack: newStack, index: newStack.length - 1 };
      onHistoryChange(newStack.length > 1, false);
    }, [onHistoryChange]);

    const undo = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { stack, index } = historyRef.current;
      if (index <= 0) return;
      const newIndex = index - 1;
      historyRef.current.index = newIndex;
      isLoadingRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(stack[newIndex]) as Record<string, unknown>);
        canvas.requestRenderAll();
      } finally {
        isLoadingRef.current = false;
      }
      onHistoryChange(newIndex > 0, newIndex < stack.length - 1);
    }, [onHistoryChange]);

    const redo = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { stack, index } = historyRef.current;
      if (index >= stack.length - 1) return;
      const newIndex = index + 1;
      historyRef.current.index = newIndex;
      isLoadingRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(stack[newIndex]) as Record<string, unknown>);
        canvas.requestRenderAll();
      } finally {
        isLoadingRef.current = false;
      }
      onHistoryChange(newIndex > 0, newIndex < stack.length - 1);
    }, [onHistoryChange]);

    // ── Canvas init (once) ───────────────────────────────────────────────────

    useEffect(() => {
      if (!canvasElRef.current) return;

      const canvas = new Canvas(canvasElRef.current, {
        width: pageWidthPx,
        height: pageHeightPx,
        backgroundColor: 'white',
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      // Load initial page
      void loadPageIntoCanvas(
        canvas,
        pagesRef.current[0],
        templateRef.current,
        pageWidthPx,
        pageHeightPx,
        apiBaseUrl,
        isLoadingRef,
      ).then(() => {
        const json = JSON.stringify(canvasToJSON(canvas));
        historyRef.current = { stack: [json], index: 0 };
      });

      // Selection events
      const updateSel = () => {
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        else onSelectionChange(null);
      };
      canvas.on('selection:created', updateSel);
      canvas.on('selection:updated', updateSel);
      canvas.on('selection:cleared', () => onSelectionChange(null));

      // Persist changes & update selection info
      const handleModified = () => {
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        saveSnapshot();
      };
      canvas.on('object:modified', handleModified);
      canvas.on('object:added', () => { if (!isLoadingRef.current) saveSnapshot(); });
      canvas.on('object:removed', () => { if (!isLoadingRef.current) saveSnapshot(); });
      canvas.on('text:changed', () => {
        const active = canvas.getActiveObject();
        if (active) onSelectionChange(getObjProps(active));
        saveSnapshot();
      });

      // Zoom on mouse wheel
      canvas.on('mouse:wheel', (opt) => {
        const e = opt.e as WheelEvent;
        let zoom = canvas.getZoom() * (0.999 ** e.deltaY);
        zoom = Math.min(Math.max(zoom, 0.1), 10);
        canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
        e.preventDefault();
        e.stopPropagation();
        onZoomChange(zoom);
      });

      // Alt+drag pan
      let isPanning = false;
      let lastPan = { x: 0, y: 0 };
      canvas.on('mouse:down', (opt) => {
        if ((opt.e as MouseEvent).altKey) {
          isPanning = true;
          canvas.selection = false;
          lastPan = { x: (opt.e as MouseEvent).clientX, y: (opt.e as MouseEvent).clientY };
        }
      });
      canvas.on('mouse:move', (opt) => {
        if (!isPanning) return;
        const e = opt.e as MouseEvent;
        canvas.relativePan(new Point(e.clientX - lastPan.x, e.clientY - lastPan.y));
        lastPan = { x: e.clientX, y: e.clientY };
      });
      canvas.on('mouse:up', () => { isPanning = false; canvas.selection = true; });

      // Double-click to fill photo fields
      canvas.on('mouse:dblclick', (opt) => {
        const target = opt.target;
        if (target && asAny(target).isPhotoField) {
          const fieldId = (asAny(target).id as string) ?? '';
          setPhotoPickerFieldId(fieldId);
          setTimeout(() => photoFileInputRef.current?.click(), 0);
        }
      });

      // Drag-and-drop images onto canvas
      const wrapper = canvasElRef.current?.parentElement as HTMLElement | null;
      if (wrapper) {
        const onDragOver = (e: DragEvent) => e.preventDefault();
        const onDrop = async (e: DragEvent) => {
          e.preventDefault();
          const file = e.dataTransfer?.files?.[0];
          if (!file?.type.startsWith('image/')) return;

          // Compute canvas coordinates from DOM event
          const canvasEl = canvas.getElement();
          const rect = canvasEl.getBoundingClientRect();
          const vpt = canvas.viewportTransform;
          const zoom = canvas.getZoom();
          const x = ((e.clientX - rect.left) - (vpt ? vpt[4] : 0)) / zoom;
          const y = ((e.clientY - rect.top) - (vpt ? vpt[5] : 0)) / zoom;

          // Check for photo field under cursor
          const hit = canvas.getObjects().find((obj) => {
            if (!asAny(obj).isPhotoField) return false;
            const left = obj.left ?? 0;
            const top = obj.top ?? 0;
            const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
            const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
            return x >= left && x <= left + w && y >= top && y <= top + h;
          });

          if (hit) {
            await fillPhotoField(canvas, hit as Rect, file);
          } else {
            await addImageFileToCanvas(canvas, file);
          }
        };
        wrapper.addEventListener('dragover', onDragOver);
        wrapper.addEventListener('drop', onDrop);
      }

      // Keyboard: Delete, Ctrl+Z, Ctrl+Y
      const onKeyDown = (e: KeyboardEvent) => {
        const active = document.activeElement;
        const wrapper2 = canvasElRef.current?.closest('.fabric-canvas-outer') as HTMLElement | null;
        if (active && active !== document.body && !(wrapper2?.contains(active as Node) ?? false)) {
          return;
        }
        // IText in edit mode — let Fabric handle keys
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as unknown as AnyObj).isEditing) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          canvas.getActiveObjects().forEach((o) => {
            if (!asAny(o).isBackground) canvas.remove(o);
          });
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          void undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          e.preventDefault();
          void redo();
        }
      };
      window.addEventListener('keydown', onKeyDown);

      return () => {
        window.removeEventListener('keydown', onKeyDown);
        canvas.dispose();
        fabricRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Page switching ───────────────────────────────────────────────────────

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const prevPage = prevPageRef.current;
      if (prevPage === currentPage) return;

      // Save leaving page
      const json = canvasToJSON(canvas);
      setPages((prev) => prev.map((p, i) => (i === prevPage ? { fabricJSON: json } : p)));
      prevPageRef.current = currentPage;

      // Reset history
      historyRef.current = { stack: [], index: -1 };
      onHistoryChange(false, false);

      // Load new page
      void loadPageIntoCanvas(
        canvas,
        pagesRef.current[currentPage],
        templateRef.current,
        pageWidthPx,
        pageHeightPx,
        apiBaseUrl,
        isLoadingRef,
      ).then(() => {
        const snap = JSON.stringify(canvasToJSON(canvas));
        historyRef.current = { stack: [snap], index: 0 };
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    // ── Photo field fill from file input ─────────────────────────────────────

    const handlePhotoFileChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !fabricRef.current) return;
        const canvas = fabricRef.current;
        if (photoPickerFieldId) {
          const field = canvas.getObjects().find(
            (o) =>
              asAny(o).isPhotoField && asAny(o).id === photoPickerFieldId,
          ) as Rect | undefined;
          if (field) {
            await fillPhotoField(canvas, field, file);
          } else {
            await addImageFileToCanvas(canvas, file);
          }
          setPhotoPickerFieldId(null);
        } else {
          await addImageFileToCanvas(canvas, file);
        }
      },
      [photoPickerFieldId],
    );

    // ── Imperative API ───────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      undo,
      redo,
      deleteSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((o) => {
          if (!asAny(o).isBackground) canvas.remove(o);
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      },
      addText: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const text = new IText('Текст', {
          left: canvas.width! / 2 - 40,
          top: canvas.height! / 2 - 15,
          fontSize: 28,
          fontFamily: TEXT_FONTS[0].value,
          fill: '#000000',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      addImageFromFile: async (file: File) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        await addImageFileToCanvas(canvas, file);
      },
      addPhotoField: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const fieldId = `field-${Date.now()}`;
        const rect = new Rect({
          left: canvas.width! / 2 - 75,
          top: canvas.height! / 2 - 75,
          width: 150,
          height: 150,
          fill: 'rgba(249,250,251,0.8)',
          stroke: '#9ca3af',
          strokeWidth: 1,
          strokeDashArray: [6, 4],
        });
        (rect as unknown as AnyObj).isPhotoField = true;
        (rect as unknown as AnyObj).id = fieldId;
        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.requestRenderAll();
        saveSnapshot();
      },
      addShape: (type) => {
        const canvas = fabricRef.current;
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
        canvas.requestRenderAll();
        saveSnapshot();
      },
      getDataURL: (opts) =>
        fabricRef.current?.toDataURL({ format: 'png', multiplier: opts?.multiplier ?? 2 }) ?? '',
      saveCurrentPage: () => {
        const canvas = fabricRef.current;
        if (!canvas) return {};
        return canvasToJSON(canvas);
      },
      loadPage: async (pageData: DesignPage) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        await loadPageIntoCanvas(
          canvas,
          pageData,
          templateRef.current,
          pageWidthPx,
          pageHeightPx,
          apiBaseUrl,
          isLoadingRef,
        );
      },
      setTextProp: (key: string, value: unknown) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active) return;
        active.set({ [key]: value } as Parameters<typeof active.set>[0]);
        canvas.requestRenderAll();
        onSelectionChange(getObjProps(active));
        saveSnapshot();
      },
      getZoom: () => fabricRef.current?.getZoom() ?? 1,
      setZoom: (z: number) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.setZoom(Math.min(Math.max(z, 0.1), 10));
        onZoomChange(canvas.getZoom());
      },
    }));

    // ── Render ───────────────────────────────────────────────────────────────

    return (
      <div className="fabric-canvas-outer">
        <div className="fabric-canvas-inner" style={{ position: 'relative', display: 'inline-block' }}>
          <canvas ref={canvasElRef} />
          {showGuides && (
            <svg
              className="fabric-guides-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: pageWidthPx,
                height: pageHeightPx,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <rect
                x={1}
                y={1}
                width={pageWidthPx - 2}
                height={pageHeightPx - 2}
                fill="none"
                stroke="#c41e3a"
                strokeWidth={2}
                strokeDasharray="6,4"
              />
              {safeZonePx > 0 && (
                <rect
                  x={safeZonePx}
                  y={safeZonePx}
                  width={pageWidthPx - 2 * safeZonePx}
                  height={pageHeightPx - 2 * safeZonePx}
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth={1}
                  strokeDasharray="8,4"
                />
              )}
            </svg>
          )}
        </div>
        <input
          ref={photoFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePhotoFileChange}
        />
      </div>
    );
  },
);

DesignEditorCanvas.displayName = 'DesignEditorCanvas';

// ─── Canvas helpers (module-level) ───────────────────────────────────────────

async function addImageFileToCanvas(canvas: Canvas, file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const maxW = canvas.width! * 0.6;
    const maxH = canvas.height! * 0.6;
    const scale = Math.min(
      img.width! > maxW ? maxW / img.width! : 1,
      img.height! > maxH ? maxH / img.height! : 1,
    );
    img.set({
      left: canvas.width! / 2 - (img.width! * scale) / 2,
      top: canvas.height! / 2 - (img.height! * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fillPhotoField(canvas: Canvas, field: Rect, file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const fw = (field.width ?? 100) * (field.scaleX ?? 1);
    const fh = (field.height ?? 100) * (field.scaleY ?? 1);
    img.set({
      left: field.left ?? 0,
      top: field.top ?? 0,
      scaleX: fw / (img.width || fw),
      scaleY: fh / (img.height || fh),
    });
    canvas.remove(field);
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  } finally {
    URL.revokeObjectURL(url);
  }
}

