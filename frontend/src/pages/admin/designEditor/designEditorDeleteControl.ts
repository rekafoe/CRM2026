import { Control, type FabricObject, type TPointerEvent, type Transform } from 'fabric';

/** Lucide trash-2 — локальный SVG, без CDN. */
const FALLBACK_DELETE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

const DELETE_CONTROL_KEY = 'designEditorDelete';
const DELETE_CONTROL_PATCHED = '_designEditorDeleteControlPatched';

/** Кастомное событие canvas: запрос удаления активного объекта с маркера. */
export const DESIGN_EDITOR_DELETE_REQUEST = 'design-editor:delete-request';

let deleteIconImage: HTMLImageElement | null = null;
let deleteIconLoadPromise: Promise<void> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('delete icon load failed'));
    img.src = src;
  });
}

function ensureDeleteIconLoaded(): Promise<void> {
  if (deleteIconImage?.complete) return Promise.resolve();
  if (!deleteIconLoadPromise) {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FALLBACK_DELETE_ICON_SVG)}`;
    deleteIconLoadPromise = loadImage(dataUrl)
      .then((img) => {
        deleteIconImage = img;
      })
      .catch(() => undefined);
  }
  return deleteIconLoadPromise;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function renderDeleteFallbackDot(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function renderDesignEditorDeleteControl(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  styleOverride: Record<string, unknown>,
  fabricObject: FabricObject,
): void {
  const icon = deleteIconImage;
  const cornerSize = Number(styleOverride.cornerSize ?? fabricObject.cornerSize ?? 18);
  const baseSize = this.sizeX || cornerSize;
  const iconSize = Math.max(16, Math.round(baseSize * 1.05));
  const pad = Math.max(3, Math.round(iconSize * 0.14));

  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(-degreesToRadians(fabricObject.getTotalAngle()));

  if (!icon?.complete) {
    renderDeleteFallbackDot(ctx, iconSize);
    ctx.restore();
    void ensureDeleteIconLoaded();
    return;
  }

  const radius = iconSize / 2 + pad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.drawImage(icon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  ctx.restore();
}

function createDeleteControl(size: number): Control {
  void ensureDeleteIconLoaded();
  const control = new Control({
    x: 0.5,
    y: -0.5,
    offsetX: 18,
    offsetY: -18,
    cursorStyle: 'pointer',
    actionName: 'delete',
    sizeX: size,
    sizeY: size,
    touchSizeX: Math.max(size, 44),
    touchSizeY: Math.max(size, 44),
    mouseUpHandler: (_eventData: TPointerEvent, transform: Transform) => {
      const target = transform.target;
      const canvas = target?.canvas;
      if (!canvas || !target) return false;
      canvas.setActiveObject(target);
      canvas.fire(DESIGN_EDITOR_DELETE_REQUEST as never, { target } as never);
      return true;
    },
  });
  control.render = renderDesignEditorDeleteControl;
  return control;
}

/**
 * Добавляет маркер удаления (корзина) к выделенному объекту.
 * Для template photo без resize — оставляем только этот control.
 */
export function applyDesignEditorDeleteControl(
  obj: FabricObject,
  options?: { size?: number; onlyDeleteControl?: boolean },
): void {
  const meta = obj as unknown as Record<string, unknown>;
  if (obj.hasControls === false && !options?.onlyDeleteControl) {
    return;
  }

  const size = Math.max(18, Math.round(options?.size ?? Number(obj.cornerSize ?? 22)));
  const controls = options?.onlyDeleteControl
    ? {}
    : { ...(obj.controls as Record<string, Control>) };

  controls[DELETE_CONTROL_KEY] = createDeleteControl(size);
  obj.controls = controls;
  obj.set({ hasControls: true });
  meta[DELETE_CONTROL_PATCHED] = true;
  obj.setCoords?.();
}
