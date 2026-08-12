import { collectSnapTargets } from './collectSnapTargets';
import type {
  SmartGuideActiveSnap,
  SmartGuideAnchorKind,
  SmartGuideLine,
  SmartGuideMode,
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
  mode?: SmartGuideMode;
  /** CSS fit scale × Fabric editScale: scene units -> physical display pixels. */
  sceneToDisplayScale?: number;
}

const SNAP_IN_PX = 3.25;
const SNAP_CLEAR_MARGIN_PX = 2;
const MICRO_CORRECTION_PX = 0.25;
const SLOW_POINTER_PX_PER_MS = 0.24;
const FAST_PRECISE_SNAP_IN_PX = 1.25;
const ACTIVE_BREAKAWAY_PX = 5.5;
const MOBILE_EDGE_SNAP_IN_PX = 7;
const MOBILE_CENTER_SNAP_IN_PX = 9;
const MOBILE_SNAP_OUT_PX = 16;
const MOBILE_ACTIVE_BREAKAWAY_PX = 16;
type DragIntent = 'horizontal' | 'vertical' | null;
type SnapAcquireMode = 'normal' | 'precise';

export function createSmartGuideSession(input: CreateSmartGuideSessionInput): SmartGuideSession {
  const sceneToDisplayScale =
    Number.isFinite(input.sceneToDisplayScale) && Number(input.sceneToDisplayScale) > 0
      ? Number(input.sceneToDisplayScale)
      : 1;
  return {
    ...collectSnapTargets(input),
    activeX: null,
    activeY: null,
    startRect: input.activeRect,
    mode: input.mode ?? 'desktop',
    sceneToDisplayScale,
    lastPointer: input.pointer ?? null,
    lastPointerAt: input.pointer ? performance.now() : null,
  };
}

function sceneThreshold(session: SmartGuideSession, displayPx: number): number {
  return displayPx / session.sceneToDisplayScale;
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
  if (active) {
    const diff = normalizeSnapDiff(session, active.target.pos - anchors[active.anchor]);
    if (
      !isPointerBreakingAway(session, active, axis, pointer)
      && Math.abs(diff) <= resolveSnapOut(session, active.target, axis, intent)
    ) {
      return { diff, active };
    }
    // Не перескакиваем на соседнюю грань в том же pointer frame:
    // один свободный кадр делает breakaway предсказуемым и убирает дрожание.
    return { diff: 0, active: null };
  }

  const targets = axis === 'x' ? session.xTargets : session.yTargets;
  const candidates: { diff: number; abs: number; priority: number; active: SmartGuideActiveSnap }[] = [];

  for (const target of targets) {
    for (const anchor of Object.keys(anchors) as SmartGuideAnchorKind[]) {
      const diff = target.pos - anchors[anchor];
      const abs = Math.abs(diff);
      if (!isMobileAnchorCompatible(session, target, anchor)) continue;
      if (shouldSkipWeakCrossAxisSnap(axis, intent, target, anchor)) continue;
      if (abs > resolveSnapIn(session, target, anchor, acquireMode)) continue;
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
  if (
    second
    && !hasClearPriority
    && second.abs - best.abs < sceneThreshold(session, SNAP_CLEAR_MARGIN_PX)
  ) {
    return { diff: 0, active: null };
  }

  return { diff: normalizeSnapDiff(session, best.diff), active: best.active };
}

function isPointerBreakingAway(
  session: SmartGuideSession,
  active: SmartGuideActiveSnap,
  axis: 'x' | 'y',
  pointer?: SmartGuidePointer,
): boolean {
  if (!pointer || !active.acquiredPointer) return false;
  const current = axis === 'x' ? pointer.x : pointer.y;
  const acquired = axis === 'x' ? active.acquiredPointer.x : active.acquiredPointer.y;
  const breakawayPx = session.mode === 'mobile' ? MOBILE_ACTIVE_BREAKAWAY_PX : ACTIVE_BREAKAWAY_PX;
  return Math.abs(current - acquired) > sceneThreshold(session, breakawayPx);
}

function normalizeSnapDiff(session: SmartGuideSession, diff: number): number {
  if (Math.abs(diff) < sceneThreshold(session, MICRO_CORRECTION_PX)) return 0;
  return diff;
}

function isMobileAnchorCompatible(
  session: SmartGuideSession,
  target: SmartGuideTarget,
  anchor: SmartGuideAnchorKind,
): boolean {
  if (session.mode !== 'mobile') return true;
  if (target.id.includes('center')) return anchor === 'center';
  if (target.id === 'page-left-safe' || target.id === 'page-top-safe') {
    return anchor === 'start';
  }
  if (target.id === 'page-right-safe' || target.id === 'page-bottom-safe') {
    return anchor === 'end';
  }
  if (target.id.startsWith('object-')) return anchor !== 'center';
  return true;
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
  session: SmartGuideSession,
  target: SmartGuideTarget,
  anchor: SmartGuideAnchorKind,
  acquireMode: SnapAcquireMode,
): number {
  let displayPx: number;
  if (session.mode === 'mobile') {
    displayPx = anchor === 'center' ? MOBILE_CENTER_SNAP_IN_PX : MOBILE_EDGE_SNAP_IN_PX;
  }
  else if (acquireMode === 'precise') displayPx = FAST_PRECISE_SNAP_IN_PX;
  else if (target.priority <= 10) displayPx = 4.5;
  else if (anchor === 'center') displayPx = SNAP_IN_PX + 0.5;
  else displayPx = SNAP_IN_PX;
  return sceneThreshold(session, displayPx);
}

function resolveSnapOut(
  session: SmartGuideSession,
  target: SmartGuideTarget,
  axis: 'x' | 'y',
  intent: DragIntent,
): number {
  const crossAxisBonus =
    (axis === 'y' && intent === 'horizontal') || (axis === 'x' && intent === 'vertical') ? 2 : 0;
  if (session.mode === 'mobile') {
    return sceneThreshold(session, MOBILE_SNAP_OUT_PX + crossAxisBonus);
  }
  let displayPx: number;
  if (target.id.includes('page-center') || target.id.includes('spread-')) displayPx = 9 + crossAxisBonus;
  else if (target.id.startsWith('guide-')) displayPx = 8 + crossAxisBonus;
  else if (target.id.includes('safe')) displayPx = 7 + crossAxisBonus;
  else if (target.id.includes('center')) displayPx = 7 + crossAxisBonus;
  else displayPx = 6 + crossAxisBonus;
  return sceneThreshold(session, displayPx);
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
  const intent = resolveDragIntent(session, session.startRect, rect);
  const acquireMode: SnapAcquireMode =
    session.mode === 'mobile' || pointerState.isSlow ? 'normal' : 'precise';
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

export function resolveSmartGuideHaptic(
  previousSignature: string,
  session: SmartGuideSession,
): { signature: string; shouldVibrate: boolean } {
  const activeTargets = [session.activeX, session.activeY]
    .filter((active): active is SmartGuideActiveSnap => active != null)
    .map((active) => `${active.target.axis}:${active.target.id}`)
    .sort();
  const signature = activeTargets.join('|');
  const previousTargets = new Set(previousSignature ? previousSignature.split('|') : []);
  return {
    signature,
    shouldVibrate: activeTargets.some((target) => !previousTargets.has(target)),
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
  const speed = (Math.hypot(dx, dy) * session.sceneToDisplayScale) / dt;
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

function resolveDragIntent(
  session: SmartGuideSession,
  startRect: SmartGuideRect,
  rect: SmartGuideRect,
): DragIntent {
  const start = rectCenter(startRect);
  const current = rectCenter(rect);
  const dx = Math.abs(current.x - start.x) * session.sceneToDisplayScale;
  const dy = Math.abs(current.y - start.y) * session.sceneToDisplayScale;
  if (dx > 8 && dx > dy * 3) return 'horizontal';
  if (dy > 8 && dy > dx * 3) return 'vertical';
  return null;
}
