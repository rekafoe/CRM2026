import type { FabricObject } from 'fabric';

/** Визуальное выделение текстовых блоков на холсте (рамка + угловые маркеры). */
export const DESIGN_EDITOR_TEXT_CHROME = {
  borderColor: '#2563eb',
  cornerColor: '#2563eb',
  cornerStrokeColor: '#ffffff',
  cornerSize: 11,
  cornerStyle: 'circle' as const,
  transparentCorners: false,
  borderScaleFactor: 2.5,
  padding: 10,
  hasBorders: true,
  hasControls: true,
  touchCornerSize: 20,
};

export function isTextLikeFabricObject(obj: FabricObject): boolean {
  const type = obj.type;
  return type === 'i-text' || type === 'textbox';
}

export function applyTextSelectionChrome(
  obj: FabricObject,
  mode: 'basic' | 'advanced',
): void {
  if (!isTextLikeFabricObject(obj)) return;

  if (mode === 'basic') {
    obj.set({
      ...DESIGN_EDITOR_TEXT_CHROME,
      selectable: true,
      evented: true,
      editable: false,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
    return;
  }

  obj.set({
    ...DESIGN_EDITOR_TEXT_CHROME,
    lockScalingX: false,
    lockScalingY: false,
    lockRotation: false,
  });
}
