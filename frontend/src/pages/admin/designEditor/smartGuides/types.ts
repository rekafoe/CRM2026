export type SmartGuideAxis = 'x' | 'y';
export type SmartGuideAnchorKind = 'start' | 'center' | 'end';

export interface SmartGuideLine {
  axis: 'h' | 'v';
  pos: number;
}

export interface SmartGuideRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SmartGuidePointer {
  x: number;
  y: number;
}

export interface SmartGuideTarget {
  id: string;
  axis: SmartGuideAxis;
  pos: number;
  priority: number;
}

export interface SmartGuideActiveSnap {
  anchor: SmartGuideAnchorKind;
  target: SmartGuideTarget;
  acquiredPointer?: SmartGuidePointer;
}

export interface SmartGuideSession {
  xTargets: SmartGuideTarget[];
  yTargets: SmartGuideTarget[];
  activeX: SmartGuideActiveSnap | null;
  activeY: SmartGuideActiveSnap | null;
  startRect: SmartGuideRect;
  lastPointer: SmartGuidePointer | null;
  lastPointerAt: number | null;
}

export interface SmartGuideResult {
  dx: number;
  dy: number;
  lines: SmartGuideLine[];
  session: SmartGuideSession;
}
