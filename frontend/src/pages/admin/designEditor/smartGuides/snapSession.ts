import { collectSnapTargets } from './collectSnapTargets';
import type {
  SmartGuideActiveSnap,
  SmartGuideAnchorKind,
  SmartGuideLine,
  SmartGuidePointer,
  SmartGuideRect,
  SmartGuideResult,
  SmartGuideSession,
  SmartGuideTarget,
} from './types';

interface CreateSmartGuideSessionInput {
  activeRect: SmartGuideRect;
  pointer?: SmartGuidePointer;
  otherObjects: SmartGuideRect[];
  guidesPx: { axis: 'h' | 'v'; pos: number }[];
  canvasW: number;
  canvasH: number;
  safeZonePx: number;
  spreadHalfWidthPx?: number;
}

const SNAP_IN_PX = 3.25;
const SNAP_CLEAR_MARGIN_PX = 2;
const MICRO_CORRECTION_PX = 0.25;
const SLOW_POINTER_PX_PER_MS = 0.24;
const FAST_PRECISE_SNAP_IN_PX = 1.25;
const ACTIVE_BREAKAWAY_PX = 3;
type DragIntent = 'horizontal' | 'vertical' | null;
type SnapAcquireMode = 'normal' | 'precise';

export function createSmartGuideSession(input: CreateSmartGuideSessionInput): SmartGuideSession {
  return {
    ...collectSnapTargets(input),
    activeX: null,
    activeY: null,
    startRect: input.activeRect,
    lastPointer: input.pointer ?? null,
    lastPointerAt: input.pointer ? performance.now() : null,
  };
}

function axisAnchors(rect: SmartGuideRect, axis: 'x' | 'y'): Record<SmartGuideAnchorKind, number> {
  if (axis === 'x') {
    return {
      start: rect.left,
      center: rect.left + rect.width / 2,
      end: rect.left + rect.width,
    };
  }

  return {
    start: rect.top,
    center: rect.top + rect.height / 2,
    end: rect.top + rect.height,
  };
}

function resolveAxisSnap(
  session: SmartGuideSession,
  rect: SmartGuideRect,
  axis: 'x' | 'y',
  intent: DragIntent,
  acquireMode: SnapAcquireMode,
  pointer?: SmartGuidePointer,
): {
  diff: number;
  active: SmartGuideActiveSnap | null;
} {
  const anchors = axisAnchors(rect, axis);
  const active = axis === 'x' ? session.activeX : session.activeY;
  let suppressedTargetId: string | null = null;
  if (active) {
    const diff = normalizeSnapDiff(active.target.pos - anchors[active.anchor]);
    if (!isPointerBreakingAway(active, axis, pointer) && Math.abs(diff) <= resolveSnapOut(active.target, axis, intent)) {
      return { diff, active };
    }
    suppressedTargetId = active.target.id;
  }

  const targets = axis === 'x' ? session.xTargets : session.yTargets;
  const candidates: { diff: number; abs: number; priority: number; active: SmartGuideActiveSnap }[] = [];

  for (const target of targets) {
    if (target.id === suppressedTargetId) continue;
    for (const anchor of Object.keys(anchors) as SmartGuideAnchorKind[]) {
      const diff = target.pos - anchors[anchor];
      const abs = Math.abs(diff);
      if (shouldSkipWeakCrossAxisSnap(axis, intent, target, anchor)) continue;
      if (abs > resolveSnapIn(target, anchor, acquireMode)) continue;
      candidates.push({
        diff,
        abs,
        priority: target.priority,
        active: { anchor, target, acquiredPointer: pointer },
      });
    }
  }

  if (candidates.length === 0) return { diff: 0, active: null };

  candidates.sort((a, b) => a.abs - b.abs || a.priority - b.priority);
  const best = candidates[0];
  const second = candidates[1];
  const hasClearPriority = second && best.priority + 8 < second.priority;
  if (second && !hasClearPriority && second.abs - best.abs < SNAP_CLEAR_MARGIN_PX) {
    return { diff: 0, active: null };
  }

  return { diff: normalizeSnapDiff(best.diff), active: best.active };
}

function isPointerBreakingAway(
  active: SmartGuideActiveSnap,
  axis: 'x' | 'y',
  pointer?: SmartGuidePointer,
): boolean {
  if (!pointer || !active.acquiredPointer) return false;
  const current = axis === 'x' ? pointer.x : pointer.y;
  const acquired = axis === 'x' ? active.acquiredPointer.x : active.acquiredPointer.y;
  return Math.abs(current - acquired) > ACTIVE_BREAKAWAY_PX;
}

function normalizeSnapDiff(diff: number): number {
  if (Math.abs(diff) < MICRO_CORRECTION_PX) return 0;
  return diff;
}

function shouldSkipWeakCrossAxisSnap(
  axis: 'x' | 'y',
  intent: DragIntent,
  target: SmartGuideTarget,
  anchor: SmartGuideAnchorKind,
): boolean {
  const isCrossAxis = (axis === 'y' && intent === 'horizontal') || (axis === 'x' && intent === 'vertical');
  if (!isCrossAxis) return false;
  return !(target.priority <= 10 && anchor === 'center');
}

function resolveSnapIn(
  target: SmartGuideTarget,
  anchor: SmartGuideAnchorKind,
  acquireMode: SnapAcquireMode,
): number {
  if (acquireMode === 'precise') return FAST_PRECISE_SNAP_IN_PX;
  if (target.priority <= 10) return 4.5;
  if (anchor === 'center') return SNAP_IN_PX + 0.5;
  return SNAP_IN_PX;
}

function resolveSnapOut(target: SmartGuideTarget, axis: 'x' | 'y', intent: DragIntent): number {
  const crossAxisBonus =
    (axis === 'y' && intent === 'horizontal') || (axis === 'x' && intent === 'vertical') ? 2 : 0;
  if (target.id.includes('page-center') || target.id.includes('spread-')) return 9 + crossAxisBonus;
  if (target.id.startsWith('guide-')) return 8 + crossAxisBonus;
  if (target.id.includes('safe')) return 7 + crossAxisBonus;
  if (target.id.includes('center')) return 7 + crossAxisBonus;
  return 6 + crossAxisBonus;
}

function lineFromTarget(target: SmartGuideTarget): SmartGuideLine {
  return {
    axis: target.axis === 'x' ? 'v' : 'h',
    pos: target.pos,
  };
}

export function resolveSmartGuideSnap(session: SmartGuideSession, rect: SmartGuideRect): SmartGuideResult {
  return resolveSmartGuideSnapAtPointer(session, rect);
}

export function resolveSmartGuideSnapAtPointer(
  session: SmartGuideSession,
  rect: SmartGuideRect,
  pointer?: SmartGuidePointer,
): SmartGuideResult {
  const pointerState = resolvePointerState(session, pointer);
  const intent = resolveDragIntent(session.startRect, rect);
  const acquireMode: SnapAcquireMode = pointerState.isSlow ? 'normal' : 'precise';
  const xSnap = resolveAxisSnap(session, rect, 'x', intent, acquireMode, pointer);
  const ySnap = resolveAxisSnap(session, rect, 'y', intent, acquireMode, pointer);
  const nextSession: SmartGuideSession = {
    ...session,
    activeX: xSnap.active,
    activeY: ySnap.active,
    lastPointer: pointerState.lastPointer,
    lastPointerAt: pointerState.lastPointerAt,
  };
  const lines: SmartGuideLine[] = [];

  if (xSnap.active) lines.push(lineFromTarget(xSnap.active.target));
  if (ySnap.active) lines.push(lineFromTarget(ySnap.active.target));

  return {
    dx: xSnap.diff,
    dy: ySnap.diff,
    lines,
    session: nextSession,
  };
}

function resolvePointerState(
  session: SmartGuideSession,
  pointer?: SmartGuidePointer,
): {
  isSlow: boolean;
  lastPointer: SmartGuidePointer | null;
  lastPointerAt: number | null;
} {
  if (!pointer) {
    return {
      isSlow: true,
      lastPointer: session.lastPointer,
      lastPointerAt: session.lastPointerAt,
    };
  }

  const now = performance.now();
  if (!session.lastPointer || !session.lastPointerAt) {
    return { isSlow: true, lastPointer: pointer, lastPointerAt: now };
  }

  const dt = Math.max(1, now - session.lastPointerAt);
  const dx = pointer.x - session.lastPointer.x;
  const dy = pointer.y - session.lastPointer.y;
  const speed = Math.hypot(dx, dy) / dt;
  return {
    isSlow: speed <= SLOW_POINTER_PX_PER_MS,
    lastPointer: pointer,
    lastPointerAt: now,
  };
}

function rectCenter(rect: SmartGuideRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function resolveDragIntent(startRect: SmartGuideRect, rect: SmartGuideRect): DragIntent {
  const start = rectCenter(startRect);
  const current = rectCenter(rect);
  const dx = Math.abs(current.x - start.x);
  const dy = Math.abs(current.y - start.y);
  if (dx > 8 && dx > dy * 3) return 'horizontal';
  if (dy > 8 && dy > dx * 3) return 'vertical';
  return null;
}
