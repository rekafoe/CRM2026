import type { SmartGuideRect, SmartGuideTarget } from './types';

interface CollectSnapTargetsInput {
  otherObjects: SmartGuideRect[];
  guidesPx: { axis: 'h' | 'v'; pos: number }[];
  canvasW: number;
  canvasH: number;
  safeZonePx: number;
  spreadHalfWidthPx?: number;
}

const TARGET_EPS = 0.5;

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

  input.otherObjects.forEach((rect, index) => {
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
