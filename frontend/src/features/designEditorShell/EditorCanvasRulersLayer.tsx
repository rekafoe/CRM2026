import React from 'react';
import { CanvasRulers, type GuideLine } from '../../pages/admin/designEditor/CanvasRulers';

interface EditorCanvasRulersLayerProps {
  visible: boolean;
  isSpreadView: boolean;
  pageWidthMm: number;
  pageHeightMm: number;
  fitZoom: number;
  sceneScale: number;
  rulerOrigin: { x: number; y: number };
  showGuides: boolean;
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
}

export const EditorCanvasRulersLayer: React.FC<EditorCanvasRulersLayerProps> = ({
  visible,
  isSpreadView,
  pageWidthMm,
  pageHeightMm,
  fitZoom,
  sceneScale,
  rulerOrigin,
  showGuides,
  guides,
  onGuidesChange,
}) => {
  if (!visible) return null;

  return (
    <CanvasRulers
      widthMM={isSpreadView ? pageWidthMm * 2 : pageWidthMm}
      heightMM={pageHeightMm}
      fitZoom={fitZoom}
      sceneScale={sceneScale}
      originX={rulerOrigin.x}
      originY={rulerOrigin.y}
      coordinateOrigin="trim"
      guides={showGuides ? guides : []}
      onGuidesChange={onGuidesChange}
    />
  );
};
