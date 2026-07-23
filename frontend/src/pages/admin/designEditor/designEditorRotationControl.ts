import { Control, type FabricObject } from 'fabric';

/** Lucide rotate-ccw (https://lucide.dev/icons/rotate-ccw) */
const LUCIDE_ROTATE_CCW_ICON_URL =
  'https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/rotate-ccw.svg';

const FALLBACK_ROTATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74"/><path d="M3 3v5h5"/></svg>`;

const ROTATION_CONTROL_PATCHED = '_designEditorRotationControlPatched';

let rotationIconImage: HTMLImageElement | null = null;
let rotationIconLoadPromise: Promise<void> | null = null;

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('rotation icon load failed'));
    img.src = src;
  });
}

async function loadRotationIconFromInternet(): Promise<HTMLImageElement> {
  try {
    const response = await fetch(LUCIDE_ROTATE_CCW_ICON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawSvg = await response.text();
    const tintedSvg = rawSvg
      .replace(/stroke="currentColor"/g, 'stroke="#2563eb"')
      .replace(/stroke:currentColor/g, 'stroke:#2563eb');
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tintedSvg)}`;
    return loadImage(dataUrl);
  } catch {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FALLBACK_ROTATE_ICON_SVG)}`;
    return loadImage(dataUrl);
  }
}

/** Предзагрузка иконки поворота (Lucide CDN → data URL для canvas). */
export function preloadDesignEditorRotationIcon(): Promise<void> {
  if (rotationIconImage?.complete) return Promise.resolve();
  if (!rotationIconLoadPromise) {
    rotationIconLoadPromise = loadRotationIconFromInternet()
      .then((img) => {
        rotationIconImage = img;
      })
      .catch(() => undefined);
  }
  return rotationIconLoadPromise;
}

function renderFallbackRotationDot(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#2563eb';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function renderDesignEditorRotationControl(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  styleOverride: Record<string, unknown>,
  fabricObject: FabricObject,
): void {
  const icon = rotationIconImage;
  const cornerSize = Number(styleOverride.cornerSize ?? fabricObject.cornerSize ?? 16);
  const baseSize = this.sizeX || cornerSize;
  const iconSize = Math.max(14, Math.round(baseSize * 1.05));
  const pad = Math.max(2, Math.round(iconSize * 0.12));

  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(-degreesToRadians(fabricObject.getTotalAngle()));

  if (!icon?.complete) {
    renderFallbackRotationDot(ctx, iconSize);
    ctx.restore();
    void preloadDesignEditorRotationIcon();
    return;
  }

  const radius = iconSize / 2 + pad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.drawImage(icon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  ctx.restore();
}

function cloneRotationControl(base: Control): Control {
  const control = new Control({
    x: base.x,
    y: base.y,
    offsetX: base.offsetX,
    offsetY: base.offsetY,
    withConnection: base.withConnection,
    actionHandler: base.actionHandler,
    cursorStyleHandler: base.cursorStyleHandler,
    actionName: base.actionName,
    sizeX: base.sizeX,
    sizeY: base.sizeY,
    cursorStyle: base.cursorStyle || 'grab',
  });
  control.render = renderDesignEditorRotationControl;
  return control;
}

/** Заменяет стандартный круг mtr на иконку поворота (если поворот разрешён). */
export function applyDesignEditorRotationControl(obj: FabricObject): void {
  const meta = obj as unknown as Record<string, unknown>;
  if (meta.lockRotation === true || obj.hasControls === false) return;
  if (meta[ROTATION_CONTROL_PATCHED] === true) return;

  const controls = { ...(obj.controls as Record<string, Control>) };
  const base = controls.mtr;
  if (!base) return;
  controls.mtr = cloneRotationControl(base);
  obj.controls = controls;
  meta[ROTATION_CONTROL_PATCHED] = true;
}
