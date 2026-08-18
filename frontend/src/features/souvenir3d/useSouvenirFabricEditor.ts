import '../../pages/admin/designEditor/fabricDesignSerialization';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Canvas,
  FabricImage,
  IText,
  Point,
  Rect,
  type FabricObject,
} from 'fabric';
import { getDesignTemplate } from '../../api';
import { addImageFileToCanvas } from '../../pages/admin/designEditor/canvas/canvasCommands';
import type { DesignPage, DesignState } from '../../pages/admin/designEditor/types';
import {
  crmPreviewPublicDesignEditorAdapter,
  type PublicDesignEditorAdapter,
} from '../publicDesignEditor/publicDesignEditorAdapter';
import {
  buildSouvenirDesignState,
  getUsedPrintAreaIds,
  isUsedSouvenirPage,
  normalizeSouvenirPages,
  resolveSouvenirFabricCoordSpace,
} from './souvenirDesignState';
import { printAreaFabricPx } from './scale';
import type {
  PrintAreaConfig,
  SouvenirSelectedObject,
  SouvenirSurfacePointerHandler,
} from './types';
import { uvToFabricCoords } from './uvToFabricCoords';

type ObjectWithProps = FabricObject & Record<string, any>;

export type SouvenirFabricEditorController = {
  canvasElementRef: React.RefObject<HTMLCanvasElement>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  status: string | null;
  activeAreaId: string;
  usedPrintAreaIds: string[];
  selected: SouvenirSelectedObject | null;
  textureSource: HTMLCanvasElement | null;
  textureRevision: number;
  orbitLocked: boolean;
  toolbarAnchor: { x: number; y: number } | null;
  switchArea: (areaId: string) => Promise<void>;
  addText: () => void;
  addPhoto: (file: File) => Promise<void>;
  replacePhoto: (file: File) => Promise<void>;
  updateText: (patch: { text?: string; fill?: string; fontSize?: number }) => void;
  updateOpacity: (opacity: number) => void;
  scaleSelected: (factor: number) => void;
  rotateSelected: (deltaDegrees: number) => void;
  cropSelected: () => void;
  deleteSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  onSurfacePointer: SouvenirSurfacePointerHandler;
  save: (silent?: boolean) => Promise<string>;
  readyForCart: () => Promise<void>;
};

type Input = {
  templateId: number;
  areas: PrintAreaConfig[];
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  adapter?: PublicDesignEditorAdapter;
  selectedParams?: Record<string, unknown>;
  onReadyForCart?: (draftToken: string) => void | Promise<void>;
};

function objectKind(object: ObjectWithProps | null): SouvenirSelectedObject['kind'] | null {
  if (!object) return null;
  const type = String(object.type || '').toLowerCase();
  if (type.includes('text')) return 'text';
  if (type.includes('image')) return 'image';
  return 'other';
}

function selectionFromObject(object: ObjectWithProps | null): SouvenirSelectedObject | null {
  const kind = objectKind(object);
  if (!object || !kind) return null;
  return {
    kind,
    text: kind === 'text' ? String(object.text ?? '') : undefined,
    fill: kind === 'text' && typeof object.fill === 'string' ? object.fill : undefined,
    fontSize: kind === 'text' ? Number(object.fontSize || 28) : undefined,
    opacity: Number.isFinite(Number(object.opacity)) ? Number(object.opacity) : 1,
  };
}

function readTemplateDesignState(response: unknown): DesignState | null {
  const row = response && typeof response === 'object' && 'data' in response
    ? (response as { data?: unknown }).data
    : response;
  if (!row || typeof row !== 'object') return null;
  const rawSpec = (row as { spec?: unknown }).spec;
  let spec: Record<string, unknown> = {};
  try {
    spec = typeof rawSpec === 'string'
      ? JSON.parse(rawSpec) as Record<string, unknown>
      : rawSpec && typeof rawSpec === 'object' ? rawSpec as Record<string, unknown> : {};
  } catch {
    spec = {};
  }
  const state = spec.designState;
  return state && typeof state === 'object' && !Array.isArray(state) ? state as DesignState : null;
}

function readDraftDesignState(payload: Record<string, unknown> | undefined): DesignState | null {
  const raw = payload?.designState ?? payload?.productionDesignState;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as DesignState : null;
}

export function useSouvenirFabricEditor({
  templateId,
  areas,
  initialDraftToken,
  onDraftTokenChange,
  adapter = crmPreviewPublicDesignEditorAdapter,
  selectedParams,
  onReadyForCart,
}: Input): SouvenirFabricEditorController {
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pagesRef = useRef<DesignPage[]>(normalizeSouvenirPages([], areas, 'css_px'));
  const activeAreaIdRef = useRef(areas[0]?.id ?? 'front');
  const draftTokenRef = useRef<string | null>(initialDraftToken ?? null);
  const draftVersionRef = useRef<number | null>(null);
  const suppressEventsRef = useRef(false);
  const switchQueueRef = useRef(Promise.resolve());
  const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const gestureRef = useRef<{
    pointerId: number;
    last: { x: number; y: number };
    object: ObjectWithProps;
  } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [activeAreaId, setActiveAreaId] = useState(activeAreaIdRef.current);
  const [usedPrintAreaIds, setUsedPrintAreaIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<SouvenirSelectedObject | null>(null);
  const [textureRevision, setTextureRevision] = useState(0);
  const [textureSource, setTextureSource] = useState<HTMLCanvasElement | null>(null);
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [toolbarAnchor, setToolbarAnchor] = useState<{ x: number; y: number } | null>(null);
  const dirtyRevisionRef = useRef(0);
  const savedDirtyRevisionRef = useRef(0);

  const activeArea = useCallback(() => (
    areas.find((area) => area.id === activeAreaIdRef.current) ?? areas[0]
  ), [areas]);

  const updateDerivedState = useCallback(() => {
    const ids = getUsedPrintAreaIds(pagesRef.current, areas);
    setUsedPrintAreaIds(ids);
    const area = activeArea();
    const page = area
      ? pagesRef.current.find((candidate) => candidate.printAreaId === area.id)
      : undefined;
    const fabricCanvas = canvasRef.current;
    if (isUsedSouvenirPage(page) && fabricCanvas) {
      const source = fabricCanvas.getElement();
      const preview = previewCanvasRef.current ?? document.createElement('canvas');
      previewCanvasRef.current = preview;
      preview.width = source.width;
      preview.height = source.height;
      const context = preview.getContext('2d');
      context?.clearRect(0, 0, preview.width, preview.height);
      context?.drawImage(source, 0, 0);
      const selectedObject = fabricCanvas.getActiveObject();
      if (context && selectedObject) {
        const bounds = selectedObject.getBoundingRect();
        context.save();
        context.strokeStyle = '#2563eb';
        context.lineWidth = Math.max(1.5, preview.width / 180);
        context.setLineDash([Math.max(3, preview.width / 80), Math.max(2, preview.width / 120)]);
        context.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
        context.setLineDash([]);
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#2563eb';
        const radius = Math.max(3, preview.width / 75);
        [
          [bounds.left, bounds.top],
          [bounds.left + bounds.width, bounds.top],
          [bounds.left, bounds.top + bounds.height],
          [bounds.left + bounds.width, bounds.top + bounds.height],
        ].forEach(([x, y]) => {
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        });
        context.restore();
      }
      setTextureSource(preview);
    } else {
      setTextureSource(null);
    }
    setTextureRevision((value) => value + 1);
  }, [activeArea, areas]);

  const serializeCurrentPage = useCallback((): DesignPage[] => {
    const canvas = canvasRef.current;
    const area = activeArea();
    if (!canvas || !area) return pagesRef.current;
    const serialized = canvas.toJSON() as unknown as Record<string, unknown>;
    const fabricSize = printAreaFabricPx(area.widthMm, area.heightMm, 1);
    pagesRef.current = pagesRef.current.map((page) => (
      page.printAreaId === area.id
        ? {
            ...page,
            fabricJSON: {
              ...serialized,
              width: fabricSize.widthPx,
              height: fabricSize.heightPx,
            },
            printAreaId: area.id,
            printAreaLabel: area.label,
            widthMm: area.widthMm,
            heightMm: area.heightMm,
          }
        : page
    ));
    updateDerivedState();
    return pagesRef.current;
  }, [activeArea, updateDerivedState]);

  const markChanged = useCallback(() => {
    if (suppressEventsRef.current) return;
    serializeCurrentPage();
    dirtyRevisionRef.current += 1;
    const active = canvasRef.current?.getActiveObject() as ObjectWithProps | undefined;
    setSelected(selectionFromObject(active ?? null));
  }, [serializeCurrentPage]);

  const loadArea = useCallback(async (areaId: string) => {
    const canvas = canvasRef.current;
    const area = areas.find((candidate) => candidate.id === areaId) ?? areas[0];
    if (!canvas || !area) return;
    const page = pagesRef.current.find((candidate) => candidate.printAreaId === area.id)
      ?? normalizeSouvenirPages([], [area], 'css_px')[0];
    const fabricSize = printAreaFabricPx(area.widthMm, area.heightMm, 1);
    suppressEventsRef.current = true;
    try {
      canvas.discardActiveObject();
      canvas.setDimensions({
        width: fabricSize.widthPx,
        height: fabricSize.heightPx,
      });
      await canvas.loadFromJSON(page.fabricJSON ?? {});
      canvas.getObjects().forEach((object) => {
        object.set({ selectable: true, evented: true });
        object.setCoords();
      });
      canvas.requestRenderAll();
      activeAreaIdRef.current = area.id;
      setActiveAreaId(area.id);
      setSelected(null);
      setToolbarAnchor(null);
    } finally {
      suppressEventsRef.current = false;
      updateDerivedState();
    }
  }, [areas, updateDerivedState]);

  useEffect(() => {
    const element = canvasElementRef.current;
    if (!element || areas.length === 0) return undefined;
    const first = areas[0];
    const fabricSize = printAreaFabricPx(first.widthMm, first.heightMm, 1);
    const canvas = new Canvas(element, {
      width: fabricSize.widthPx,
      height: fabricSize.heightPx,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selection: false,
    });
    canvasRef.current = canvas;
    const onMutation = () => markChanged();
    const onSelection = () => {
      const object = canvas.getActiveObject() as ObjectWithProps | undefined;
      setSelected(selectionFromObject(object ?? null));
    };
    canvas.on('object:added', onMutation);
    canvas.on('object:modified', onMutation);
    canvas.on('object:removed', onMutation);
    canvas.on('selection:created', onSelection);
    canvas.on('selection:updated', onSelection);
    canvas.on('selection:cleared', () => setSelected(null));

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const [templateResponse, draftResponse] = await Promise.all([
          getDesignTemplate(templateId),
          initialDraftToken ? adapter.getDraft(initialDraftToken) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (draftResponse && typeof draftResponse.version === 'number') {
          draftVersionRef.current = draftResponse.version;
        }
        const state = readDraftDesignState(draftResponse?.payloadParsed)
          ?? readTemplateDesignState(templateResponse);
        const coordSpace = resolveSouvenirFabricCoordSpace(state);
        pagesRef.current = normalizeSouvenirPages(state?.pages, areas, coordSpace);
        const preferredAreaId = state?.activePrintAreaId;
        const initialArea = areas.some((area) => area.id === preferredAreaId)
          ? preferredAreaId!
          : areas[0].id;
        await loadArea(initialArea);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось открыть макет');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [adapter, areas, initialDraftToken, loadArea, markChanged, templateId]);

  const ensureDraft = useCallback(async (): Promise<string> => {
    if (draftTokenRef.current) return draftTokenRef.current;
    const created = await adapter.createDraft({
      designTemplateId: templateId,
      mode: 'souvenir_3d',
      payload: {
        editorKind: 'souvenir_3d',
        printAreas: areas,
        activePrintAreaId: activeAreaIdRef.current,
        usedPrintAreaIds: getUsedPrintAreaIds(pagesRef.current, areas),
      },
    });
    if (!created.token) throw new Error('Не удалось создать черновик сувенирного макета');
    draftTokenRef.current = created.token;
    draftVersionRef.current = typeof created.version === 'number' ? created.version : null;
    onDraftTokenChange?.(created.token);
    return created.token;
  }, [adapter, areas, onDraftTokenChange, templateId]);

  const save = useCallback((silent = false): Promise<string> => {
    const persist = async (): Promise<string> => {
      try {
        setSaving(true);
        setError(null);
        const savingRevision = dirtyRevisionRef.current;
        const pages = serializeCurrentPage();
        const token = await ensureDraft();
        const designState = buildSouvenirDesignState({
          templateId,
          pages,
          areas,
          activePrintAreaId: activeAreaIdRef.current,
        });
        const patch: Record<string, unknown> = {
          designState,
          productionDesignState: designState,
          editorKind: 'souvenir_3d',
          printAreas: areas,
          activePrintAreaId: designState.activePrintAreaId,
          usedPrintAreaIds: designState.usedPrintAreaIds,
        };
        if (selectedParams) patch.selectedParams = selectedParams;
        if (draftVersionRef.current != null) patch.expectedVersion = draftVersionRef.current;
        const response = await adapter.updateDraft(token, patch);
        if (response && typeof response.version === 'number') draftVersionRef.current = response.version;
        savedDirtyRevisionRef.current = Math.max(savedDirtyRevisionRef.current, savingRevision);
        if (!silent) setStatus('Макет сохранён');
        return token;
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Не удалось сохранить макет';
        setError(message);
        throw reason;
      } finally {
        setSaving(false);
      }
    };
    const queued = persistQueueRef.current.then(persist, persist);
    persistQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, [adapter, areas, ensureDraft, selectedParams, serializeCurrentPage, templateId]);

  useEffect(() => {
    if (loading || dirtyRevisionRef.current === savedDirtyRevisionRef.current) return undefined;
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void save(true).catch(() => undefined);
    }, 3000);
    return () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    };
  }, [loading, save, textureRevision]);

  const switchArea = useCallback((areaId: string): Promise<void> => {
    switchQueueRef.current = switchQueueRef.current.then(async () => {
      if (areaId === activeAreaIdRef.current) return;
      serializeCurrentPage();
      await loadArea(areaId);
    });
    return switchQueueRef.current;
  }, [loadArea, serializeCurrentPage]);

  const addText = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const text = new IText('Ваш текст', {
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Arial',
      fontSize: Math.max(18, Math.round(canvas.width * 0.09)),
      fill: '#111827',
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.setCoords();
    canvas.requestRenderAll();
    setSelected(selectionFromObject(text as ObjectWithProps));
    markChanged();
  }, [markChanged]);

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const token = await ensureDraft();
    const uploaded = await adapter.uploadDraftFile(token, file);
    if (!uploaded.url) throw new Error('Сервер не вернул URL изображения');
    return uploaded.url;
  }, [adapter, ensureDraft]);

  const addPhoto = useCallback(async (file: File) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setError(null);
      await addImageFileToCanvas(canvas, file, uploadImage);
      markChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить фотографию');
    }
  }, [markChanged, uploadImage]);

  const replacePhoto = useCallback(async (file: File) => {
    const canvas = canvasRef.current;
    const previous = canvas?.getActiveObject() as ObjectWithProps | undefined;
    if (!canvas || !previous || objectKind(previous) !== 'image') return;
    try {
      const url = await uploadImage(file);
      const image = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' }) as ObjectWithProps;
      image.set({
        left: previous.left,
        top: previous.top,
        originX: previous.originX,
        originY: previous.originY,
        scaleX: previous.getScaledWidth() / Math.max(1, image.width),
        scaleY: previous.getScaledHeight() / Math.max(1, image.height),
        angle: previous.angle,
        opacity: previous.opacity,
      });
      suppressEventsRef.current = true;
      canvas.remove(previous);
      canvas.add(image);
      suppressEventsRef.current = false;
      canvas.setActiveObject(image);
      image.setCoords();
      canvas.requestRenderAll();
      markChanged();
    } catch (reason) {
      suppressEventsRef.current = false;
      setError(reason instanceof Error ? reason.message : 'Не удалось заменить фотографию');
    }
  }, [markChanged, uploadImage]);

  const updateSelected = useCallback((patch: Record<string, unknown>) => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject() as ObjectWithProps | undefined;
    if (!canvas || !object) return;
    object.set(patch);
    object.setCoords();
    canvas.requestRenderAll();
    setSelected(selectionFromObject(object));
    markChanged();
  }, [markChanged]);

  const updateText = useCallback((patch: { text?: string; fill?: string; fontSize?: number }) => {
    const object = canvasRef.current?.getActiveObject() as ObjectWithProps | undefined;
    if (!object || objectKind(object) !== 'text') return;
    updateSelected(patch);
  }, [updateSelected]);

  const updateOpacity = useCallback((opacity: number) => {
    updateSelected({ opacity: Math.min(1, Math.max(0.1, opacity)) });
  }, [updateSelected]);

  const scaleSelected = useCallback((factor: number) => {
    const object = canvasRef.current?.getActiveObject() as ObjectWithProps | undefined;
    if (!object || !Number.isFinite(factor) || factor <= 0) return;
    updateSelected({
      scaleX: Math.min(8, Math.max(0.05, Number(object.scaleX || 1) * factor)),
      scaleY: Math.min(8, Math.max(0.05, Number(object.scaleY || 1) * factor)),
    });
  }, [updateSelected]);

  const rotateSelected = useCallback((deltaDegrees: number) => {
    const object = canvasRef.current?.getActiveObject() as ObjectWithProps | undefined;
    if (!object || !Number.isFinite(deltaDegrees)) return;
    updateSelected({ angle: Number(object.angle || 0) + deltaDegrees });
  }, [updateSelected]);

  const cropSelected = useCallback(() => {
    const object = canvasRef.current?.getActiveObject() as ObjectWithProps | undefined;
    if (!object || objectKind(object) !== 'image') return;
    if (object.clipPath) {
      updateSelected({ clipPath: undefined });
      return;
    }
    updateSelected({
      clipPath: new Rect({
        width: Math.max(1, Number(object.width || 1) * 0.8),
        height: Math.max(1, Number(object.height || 1) * 0.8),
        originX: 'center',
        originY: 'center',
      }),
    });
  }, [updateSelected]);

  const deleteSelected = useCallback(() => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    canvas.remove(object);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setSelected(null);
    setToolbarAnchor(null);
    markChanged();
  }, [markChanged]);

  const bringForward = useCallback(() => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    canvas.bringObjectForward(object);
    markChanged();
  }, [markChanged]);

  const sendBackward = useCallback(() => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    canvas.sendObjectBackwards(object);
    markChanged();
  }, [markChanged]);

  const onSurfacePointer = useCallback<SouvenirSurfacePointerHandler>((phase, pointer) => {
    const canvas = canvasRef.current;
    const area = activeArea();
    if (!canvas || !area || loading) return false;
    const point = uvToFabricCoords(pointer.uv, canvas.width, canvas.height, area.uvRect);

    if (phase === 'down') {
      const hit = [...canvas.getObjects()]
        .reverse()
        .find((object) => object.visible !== false && object.evented !== false && object.containsPoint(new Point(point.x, point.y))) as ObjectWithProps | undefined;
      if (!hit) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setSelected(null);
        setToolbarAnchor(null);
        gestureRef.current = null;
        setOrbitLocked(false);
        updateDerivedState();
        return false;
      }
      canvas.setActiveObject(hit);
      hit.setCoords();
      canvas.requestRenderAll();
      gestureRef.current = { pointerId: pointer.pointerId, last: point, object: hit };
      setSelected(selectionFromObject(hit));
      setToolbarAnchor({ x: pointer.clientX, y: pointer.clientY });
      setOrbitLocked(true);
      updateDerivedState();
      return true;
    }

    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== pointer.pointerId) return false;
    if (phase === 'move') {
      const dx = point.x - gesture.last.x;
      const dy = point.y - gesture.last.y;
      gesture.object.set({
        left: Number(gesture.object.left || 0) + dx,
        top: Number(gesture.object.top || 0) + dy,
      });
      gesture.object.setCoords();
      gesture.last = point;
      canvas.requestRenderAll();
      setToolbarAnchor({ x: pointer.clientX, y: pointer.clientY });
      updateDerivedState();
      return true;
    }

    gestureRef.current = null;
    setOrbitLocked(false);
    markChanged();
    return true;
  }, [activeArea, loading, markChanged, updateDerivedState]);

  const readyForCart = useCallback(async () => {
    const pages = serializeCurrentPage();
    if (getUsedPrintAreaIds(pages, areas).length === 0) {
      const message = 'Добавьте текст или фото хотя бы в одну область печати';
      setError(message);
      return;
    }
    try {
      const token = await save(true);
      await onReadyForCart?.(token);
      setStatus('Макет готов к заказу');
    } catch {
      // save already exposes a user-facing error
    }
  }, [areas, onReadyForCart, save, serializeCurrentPage]);

  return {
    canvasElementRef,
    loading,
    saving,
    error,
    status,
    activeAreaId,
    usedPrintAreaIds,
    selected,
    textureSource,
    textureRevision,
    orbitLocked,
    toolbarAnchor,
    switchArea,
    addText,
    addPhoto,
    replacePhoto,
    updateText,
    updateOpacity,
    scaleSelected,
    rotateSelected,
    cropSelected,
    deleteSelected,
    bringForward,
    sendBackward,
    onSurfacePointer,
    save,
    readyForCart,
  };
}
