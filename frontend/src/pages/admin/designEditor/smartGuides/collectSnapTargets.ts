import type { SmartGuideMode, SmartGuideRect, SmartGuideTarget } from './types';

interface CollectSnapTargetsInput {
  activeRect: SmartGuideRect;
  otherObjects: SmartGuideRect[];
  guidesPx: { axis: 'h' | 'v'; pos: number }[];
  canvasW: number;
  canvasH: number;
  safeZonePx: number;
  spreadHalfWidthPx?: number;
  mode?: SmartGuideMode;
}

const TARGET_EPS = 0.5;
export const MOBILE_SMART_GUIDE_MAX_OBJECTS = 6;

function rectEdges(rect: SmartGuideRect) {
  return {
    left: rect.left,
    cx: rect.left + rect.width / 2,
    right: rect.left + rect.width,
    top: rect.top,
    cy: rect.top + rect.height / 2,
    bottom: rect.top + rect.height,
  };
}

function pushTarget(targets: SmartGuideTarget[], target: SmartGuideTarget): void {
  const existing = targets.find((item) => Math.abs(item.pos - target.pos) <= TARGET_EPS);
  if (!existing) {
    targets.push(target);
    return;
  }
  if (target.priority < existing.priority) {
    existing.id = target.id;
    existing.priority = target.priority;
    existing.pos = target.pos;
  }
}

function rectDistanceSquared(active: SmartGuideRect, other: SmartGuideRect): number {
  const activeRight = active.left + active.width;
  const activeBottom = active.top + active.height;
  const otherRight = other.left + other.width;
  const otherBottom = other.top + other.height;
  const dx = Math.max(other.left - activeRight, active.left - otherRight, 0);
  const dy = Math.max(other.top - activeBottom, active.top - otherBottom, 0);
  return dx * dx + dy * dy;
}

function selectObjectTargets(input: CollectSnapTargetsInput): { rect: SmartGuideRect; index: number }[] {
  const indexed = input.otherObjects.map((rect, index) => ({ rect, index }));
  if (input.mode !== 'mobile') return indexed;
  return indexed
    .sort((a, b) => (
      rectDistanceSquared(input.activeRect, a.rect) - rectDistanceSquared(input.activeRect, b.rect)
      || a.index - b.index
    ))
    .slice(0, MOBILE_SMART_GUIDE_MAX_OBJECTS);
}

export function collectSnapTargets(input: CollectSnapTargetsInput): {
  xTargets: SmartGuideTarget[];
  yTargets: SmartGuideTarget[];
} {
  const xTargets: SmartGuideTarget[] = [];
  const yTargets: SmartGuideTarget[] = [];

  pushTarget(xTargets, { id: 'page-left-safe', axis: 'x', pos: input.safeZonePx, priority: 20 });
  pushTarget(xTargets, { id: 'page-center-x', axis: 'x', pos: input.canvasW / 2, priority: 5 });
  pushTarget(xTargets, { id: 'page-right-safe', axis: 'x', pos: input.canvasW - input.safeZonePx, priority: 20 });

  pushTarget(yTargets, { id: 'page-top-safe', axis: 'y', pos: input.safeZonePx, priority: 20 });
  pushTarget(yTargets, { id: 'page-center-y', axis: 'y', pos: input.canvasH / 2, priority: 5 });
  pushTarget(yTargets, { id: 'page-bottom-safe', axis: 'y', pos: input.canvasH - input.safeZonePx, priority: 20 });

  if (input.mode !== 'mobile') {
    const half = input.spreadHalfWidthPx;
    if (half != null && Math.abs(input.canvasW - half * 2) < 1) {
      pushTarget(xTargets, { id: 'spread-left-center-x', axis: 'x', pos: half / 2, priority: 8 });
      pushTarget(xTargets, { id: 'spread-right-center-x', axis: 'x', pos: half + half / 2, priority: 8 });
    }

    for (const guide of input.guidesPx) {
      const target: SmartGuideTarget = {
        id: `guide-${guide.axis}-${guide.pos.toFixed(2)}`,
        axis: guide.axis === 'v' ? 'x' : 'y',
        pos: guide.pos,
        priority: 10,
      };
      pushTarget(guide.axis === 'v' ? xTargets : yTargets, target);
    }
  }

  selectObjectTargets(input).forEach(({ rect, index }) => {
    const edges = rectEdges(rect);
    pushTarget(xTargets, { id: `object-${index}-left`, axis: 'x', pos: edges.left, priority: 30 });
    pushTarget(xTargets, { id: `object-${index}-center-x`, axis: 'x', pos: edges.cx, priority: 25 });
    pushTarget(xTargets, { id: `object-${index}-right`, axis: 'x', pos: edges.right, priority: 30 });
    pushTarget(yTargets, { id: `object-${index}-top`, axis: 'y', pos: edges.top, priority: 30 });
    pushTarget(yTargets, { id: `object-${index}-center-y`, axis: 'y', pos: edges.cy, priority: 25 });
    pushTarget(yTargets, { id: `object-${index}-bottom`, axis: 'y', pos: edges.bottom, priority: 30 });
  });

  return { xTargets, yTargets };
}
