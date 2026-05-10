import type { Canvas, FabricObject, Group } from 'fabric';

function ax(o: FabricObject): Record<string, unknown> {
  return o as unknown as Record<string, unknown>;
}

/** Попадание в bbox объекта в координатах сцены. */
function ptInFieldScene(o: FabricObject, sceneX: number, sceneY: number): boolean {
  const br = o.getBoundingRect();
  return (
    sceneX >= br.left &&
    sceneX <= br.left + br.width &&
    sceneY >= br.top &&
    sceneY <= br.top + br.height
  );
}

/**
 * Последний сверху объект с isPhotoField под точкой сцены (в глубину групп).
 */
export function findPhotoFieldAtScene(
  canvas: Canvas,
  sceneX: number,
  sceneY: number,
): FabricObject | undefined {
  const probe = (o: FabricObject): FabricObject | undefined => {
    const canHaveChildren =
      typeof (o as Group).getObjects === 'function' && !ax(o).isPhotoField;
    if (canHaveChildren) {
      const nest = [...(o as Group).getObjects()].reverse();
      for (const c of nest) {
        const h = probe(c);
        if (h) return h;
      }
    }
    if (ax(o).isPhotoField && ptInFieldScene(o, sceneX, sceneY)) return o;
    return undefined;
  };
  const top = canvas.getObjects();
  for (let i = top.length - 1; i >= 0; i--) {
    const hit = probe(top[i]!);
    if (hit) return hit;
  }
  return undefined;
}
