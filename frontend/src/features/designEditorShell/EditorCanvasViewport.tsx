import React from 'react';
import { API_BASE_URL } from '../../config/constants';
import {
  DesignEditorCanvas,
  type DesignEditorCanvasHandle,
  type EditorMode,
} from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { DesignTemplate } from '../../api';
import type { DesignPage } from '../../pages/admin/designEditor/types';

interface EditorCanvasViewportProps {
  template: DesignTemplate;
  canvasHandleRef: React.Ref<DesignEditorCanvasHandle>;
  viewportRef: React.Ref<HTMLDivElement>;
  fitScalerRef: React.Ref<HTMLDivElement>;
  pageWidthPx: number;
  pageHeightPx: number;
  canvasWidthPx: number;
  safeZonePx: number;
  bleedPx: number;
  currentPage: number;
  pages: DesignPage[];
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  pageLoadKey: string;
  spreadPairPages: [number, number] | null;
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
  showGuides: boolean;
  guideLinesPx: Array<{ axis: 'h' | 'v'; pos: number }>;
  sidebarPhotos?: Array<{ id: string; file: File }>;
  onSelectionChange: Parameters<typeof DesignEditorCanvas>[0]['onSelectionChange'];
  onHistoryChange: Parameters<typeof DesignEditorCanvas>[0]['onHistoryChange'];
  onZoomChange: Parameters<typeof DesignEditorCanvas>[0]['onZoomChange'];
  onPageThumbReady: Parameters<typeof DesignEditorCanvas>[0]['onPageThumbReady'];
  onTextFloatingAnchor?: Parameters<typeof DesignEditorCanvas>[0]['onTextFloatingAnchor'];
  onTextFillHint?: Parameters<typeof DesignEditorCanvas>[0]['onTextFillHint'];
  onTextEditCommitted?: Parameters<typeof DesignEditorCanvas>[0]['onTextEditCommitted'];
  onCanvasDocumentCommit?: Parameters<typeof DesignEditorCanvas>[0]['onCanvasDocumentCommit'];
  onSnapLinesChange?: Parameters<typeof DesignEditorCanvas>[0]['onSnapLinesChange'];
  onDropRemoteImageUrl?: (url: string) => Promise<void>;
  onSidebarPhotoDropped?: (id: string) => void;
  resolveImageFileUrl?: (file: File) => Promise<string>;
  editorMode?: EditorMode;
}

export const EditorCanvasViewport: React.FC<EditorCanvasViewportProps> = ({
  template,
  canvasHandleRef,
  viewportRef,
  fitScalerRef,
  pageWidthPx,
  pageHeightPx,
  canvasWidthPx,
  safeZonePx,
  bleedPx,
  currentPage,
  pages,
  setPages,
  pageLoadKey,
  spreadPairPages,
  showBleed,
  showTrim,
  showSafeZone,
  showGuides,
  guideLinesPx,
  sidebarPhotos = [],
  onSelectionChange,
  onHistoryChange,
  onZoomChange,
  onPageThumbReady,
  onTextFloatingAnchor,
  onTextFillHint,
  onTextEditCommitted,
  onCanvasDocumentCommit,
  onSnapLinesChange,
  onDropRemoteImageUrl,
  onSidebarPhotoDropped,
  resolveImageFileUrl,
  editorMode = 'advanced',
}) => (
  <div className="design-editor-viewport" ref={viewportRef}>
    <div ref={fitScalerRef} className="design-editor-fit-scaler" data-ready="false">
      <div className="design-editor-canvas-wrap">
        <DesignEditorCanvas
          ref={canvasHandleRef}
          template={template}
          pageWidthPx={pageWidthPx}
          canvasWidthPx={canvasWidthPx}
          pageHeightPx={pageHeightPx}
          safeZonePx={safeZonePx}
          bleedPx={bleedPx}
          showBleed={showBleed}
          showTrim={showTrim}
          showSafeZone={showSafeZone}
          pages={pages}
          setPages={setPages}
          currentPage={currentPage}
          pageLoadKey={pageLoadKey}
          spreadPairPages={spreadPairPages}
          showGuides={showGuides}
          apiBaseUrl={API_BASE_URL}
          mode={editorMode}
          onSelectionChange={onSelectionChange}
          onHistoryChange={onHistoryChange}
          onZoomChange={onZoomChange}
          onPageThumbReady={onPageThumbReady}
          onTextFloatingAnchor={onTextFloatingAnchor}
          onTextFillHint={onTextFillHint}
          onTextEditCommitted={onTextEditCommitted}
          onCanvasDocumentCommit={onCanvasDocumentCommit}
          onSnapLinesChange={onSnapLinesChange}
          guideLinesPx={showGuides ? guideLinesPx : []}
          onDropRemoteImageUrl={onDropRemoteImageUrl}
          getSidebarPhotoFile={(id) => sidebarPhotos.find((photo) => photo.id === id)?.file}
          onSidebarPhotoDropped={onSidebarPhotoDropped}
          resolveImageFileUrl={resolveImageFileUrl}
        />
      </div>
    </div>
  </div>
);
