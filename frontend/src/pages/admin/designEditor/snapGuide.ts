/**
 * Умное выравнивание при перетаскивании: якоря, направляющие, объекты.
 * Координаты — px в системе Fabric-холста.
 */

export interface SnapResult {
  dx: number;
  dy: number;
  lines: { axis: 'h' | 'v'; pos: number }[];
}

export interface ComputeSnapOptions {
  /** Разворот: половина ширины холста — привязка к центрам левой/правой страницы. */
  spreadHalfWidthPx?: number;
}

const SNAP_THRESHOLD_PX = 10;
/** Если вторая по точности связка почти так же хороша — не привязываем (нет дрожания). */
const SNAP_CLEAR_MARGIN_PX = 5;

interface ObjRect {
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

function objEdges(o: ObjRect) {
  const w = o.width * o.scaleX;
  const h = o.height * o.scaleY;
  return {
    left: o.left,
    cx: o.left + w / 2,
    right: o.left + w,
    top: o.top,
    cy: o.top + h / 2,
    bottom: o.top + h,
  };
}

/** Сливаем почти совпадающие цели, чтобы один геометрический якорь не давал множества конкурирующих diff. */
function dedupeAxisTargets(vals: number[]): number[] {
  if (vals.length === 0) return [];
  const sorted = [...vals].sort((a, b) => a - b);
  const EPS = 0.4;
  const out: number[] = [];
  for (const x of sorted) {
    if (out.length === 0 || Math.abs(x - out[out.length - 1]) > EPS) out.push(x);
  }
  return out;
}

interface SnapCand {
  diff: number;
  abs: number;
}

function gatherCandidates(myEdges: number[], targets: number[]): SnapCand[] {
  const out: SnapCand[] = [];
  for (const tgt of targets) {
    for (const edge of myEdges) {
      const diff = tgt - edge;
      const abs = Math.abs(diff);
      if (abs < SNAP_THRESHOLD_PX) out.push({ diff, abs });
    }
  }
  return out;
}

function pickAxisSnapClear(cands: SnapCand[]): number {
  if (cands.length === 0) return 0;
  cands.sort((a, b) => a.abs - b.abs);
  const best = cands[0];
  if (cands.length === 1) return best.diff;
  const second = cands[1];
  if (second.abs - best.abs < SNAP_CLEAR_MARGIN_PX) return 0;
  return best.diff;
}

/**
 * Вычисляет смещение для привязки к направляющим, краям безопасной зоны,
 * центру холста, рёбрам/центрам других объектов (упрощённый набор «средин» между объектами).
 */
export function computeSnap(
  obj: ObjRect,
  otherObjects: ObjRect[],
  guidesPx: { axis: 'h' | 'v'; pos: number }[],
  canvasW: number,
  canvasH: number,
  safeZonePx: number,
  options?: ComputeSnapOptions,
): SnapResult {
  const me = objEdges(obj);

  const vRaw: number[] = [];
  const hRaw: number[] = [];

  vRaw.push(safeZonePx, canvasW - safeZonePx, canvasW / 2);
  hRaw.push(safeZonePx, canvasH - safeZonePx, canvasH / 2);

  const L = options?.spreadHalfWidthPx;
  if (L != null && Math.abs(canvasW - L * 2) < 1) {
    vRaw.push(L / 2, L + L / 2);
  }

  for (const g of guidesPx) {
    (g.axis === 'v' ? vRaw : hRaw).push(g.pos);
  }

  const others = otherObjects.map(objEdges);
  for (const o of others) {
    vRaw.push(o.left, o.cx, o.right);
    hRaw.push(o.top, o.cy, o.bottom);
  }

  // Средины между парами объектов дают много близких целей → дрожание; только при малом числе объектов.
  const maxOthersForMidPairs = 3;
  if (others.length > 0 && others.length <= maxOthersForMidPairs) {
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = others[i];
        const b = others[j];
        vRaw.push((a.cx + b.cx) / 2);
        vRaw.push((a.left + b.right) / 2);
        vRaw.push((a.right + b.left) / 2);
        hRaw.push((a.cy + b.cy) / 2);
        hRaw.push((a.top + b.bottom) / 2);
        hRaw.push((a.bottom + b.top) / 2);
      }
    }
  }

  const maxOthersForMidCenter = 2;
  if (others.length > 0 && others.length <= maxOthersForMidCenter) {
    for (const o of others) {
      vRaw.push((o.cx + canvasW / 2) / 2);
      hRaw.push((o.cy + canvasH / 2) / 2);
    }
  }

  const vTargets = dedupeAxisTargets(vRaw);
  const hTargets = dedupeAxisTargets(hRaw);

  const myV = [me.left, me.cx, me.right];
  const myH = [me.top, me.cy, me.bottom];

  const dx = pickAxisSnapClear(gatherCandidates(myV, vTargets));
  const dy = pickAxisSnapClear(gatherCandidates(myH, hTargets));

  const lines: SnapResult['lines'] = [];
  const TOL = 1.5;

  if (dx !== 0) {
    const snapped = [me.left + dx, me.cx + dx, me.right + dx];
    const seen = new Set<number>();
    for (const t of vTargets) {
      if (snapped.some((s) => Math.abs(t - s) < TOL) && !seen.has(Math.round(t))) {
        seen.add(Math.round(t));
        lines.push({ axis: 'v', pos: t });
      }
    }
  }
  if (dy !== 0) {
    const snapped = [me.top + dy, me.cy + dy, me.bottom + dy];
    const seen = new Set<number>();
    for (const t of hTargets) {
      if (snapped.some((s) => Math.abs(t - s) < TOL) && !seen.has(Math.round(t))) {
        seen.add(Math.round(t));
        lines.push({ axis: 'h', pos: t });
      }
    }
  }

  return { dx, dy, lines };
}
