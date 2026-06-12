import type { Canvas, FabricObject } from 'fabric';

/** Удалить объект с канваса или из родительской группы (canvas.remove только для потомков корня). */
export function detachFabricObject(canvas: Canvas, obj: FabricObject): void {
  const parent = obj.group;
  if (parent) {
    parent.remove(obj);
    parent.set({ dirty: true });
    parent.setCoords();
  } else {
    canvas.remove(obj);
  }
}
