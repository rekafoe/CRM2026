import React from 'react';
import type { GuideLine } from '../../pages/admin/designEditor/CanvasRulers';
import {
  DesignEditorCanvas,
  type DesignEditorCanvasHandle,
  type EditorMode,
} from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { DesignTemplate } from '../../api';
import type { DesignPage } from '../../pages/admin/designEditor/types';
import { EditorCanvasRulersLayer } from './EditorCanvasRulersLayer';
import { EditorCanvasViewport } from './EditorCanvasViewport';
import { EditorStageToolbar } from './EditorStageToolbar';
import { EditorStageWatermark } from './EditorStageWatermark';
import type { EditorViewOptions } from './EditorViewControls';

export interface EditorCanvasNavigationState {
  isSpreadView: boolean;
  pageLoadKey: string;
  spreadPairPages: [number, number] | null;
}

export interface EditorCanvasRefs {
  canvasHandleRef: React.Ref<DesignEditorCanvasHandle>;
  scrollAreaRef: React.Ref<HTMLDivElement>;
  viewportRef: React.Ref<HTMLDivElement>;
  fitScalerRef: React.Ref<HTMLDivElement>;
}

export interface EditorCanvasFragmentInfo {
  fragmentLabel: string;
  fragmentDetail: string;
  issueCount?: number;
}

export interface EditorCanvasDocumentState {
  currentPage: number;
  pages: DesignPage[];
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
}

export interface EditorCanvasGeometry {
  pageWidthPx: number;
  pageHeightPx: number;
  canvasWidthPx: number;
  safeZonePx: number;
  bleedPx: number;
  pageWidthMm: number;
  pageHeightMm: number;
  sceneScale: number;
}

export interface EditorCanvasViewState {
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
  viewOptions: EditorViewOptions;
  guides: GuideLine[];
  guideLinesPx: Array<{ axis: 'h' | 'v'; pos: number }>;
  fitZoom: number;
  rulerOrigin: { x: number; y: number };
}

export interface EditorCanvasHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
}

export interface EditorCanvasAssets {
  showOrganizationLogo?: boolean | string | null;
  organizationLogoUrl?: string | null;
  sidebarPhotos?: Array<{ id: string; file: File }>;
}

export interface EditorCanvasHandlers {
  onOrganizationLogoError?: () => void;
  onViewOptionsChange: (value: EditorViewOptions) => void;
  onGuidesChange: (guides: GuideLine[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onSelectionChange: Parameters<typeof DesignEditorCanvas>[0]['onSelectionChange'];
  onHistoryChange: Parameters<typeof DesignEditorCanvas>[0]['onHistoryChange'];
  onZoomChange: Parameters<typeof DesignEditorCanvas>[0]['onZoomChange'];
  onPageThumbReady: Parameters<typeof DesignEditorCanvas>[0]['onPageThumbReady'];
  onTextFloatingAnchor?: Parameters<typeof DesignEditorCanvas>[0]['onTextFloatingAnchor'];
  onSnapLinesChange?: Parameters<typeof DesignEditorCanvas>[0]['onSnapLinesChange'];
  onDropRemoteImageUrl?: (url: string) => Promise<void>;
  onSidebarPhotoDropped?: (id: string) => void;
  resolveImageFileUrl?: (file: File) => Promise<string>;
}

interface EditorCanvasStageProps {
  template: DesignTemplate;
  editorMode?: EditorMode;
  refs: EditorCanvasRefs;
  fragment: EditorCanvasFragmentInfo;
  navigation: EditorCanvasNavigationState;
  document: EditorCanvasDocumentState;
  geometry: EditorCanvasGeometry;
  view: EditorCanvasViewState;
  history: EditorCanvasHistoryState;
  assets?: EditorCanvasAssets;
  toolsSlot?: React.ReactNode;
  guideSlot?: React.ReactNode;
  /** Мобильная панель форматирования текста (в потоке стадии, не portal). */
  textToolbarSlot?: React.ReactNode;
  stageClassName?: string;
  handlers: EditorCanvasHandlers;
}

export const EditorCanvasStage: React.FC<EditorCanvasStageProps> = ({
  template,
  editorMode = 'advanced',
  refs,
  fragment,
  navigation,
  document,
  geometry,
  view,
  history,
  assets,
  toolsSlot,
  guideSlot,
  textToolbarSlot,
  stageClassName,
  handlers,
}) => (
  <section
    className={[
      'public-design-editor__stage',
      guideSlot ? 'public-design-editor__stage--with-guide' : '',
      stageClassName ?? '',
    ].filter(Boolean).join(' ')}
    aria-label="Рабочая область макета"
  >
    <EditorStageToolbar
      fragmentLabel={fragment.fragmentLabel}
      fragmentDetail={fragment.fragmentDetail}
      issueCount={fragment.issueCount ?? 0}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      zoom={history.zoom}
      viewOptions={view.viewOptions}
      toolsSlot={toolsSlot}
      onViewOptionsChange={handlers.onViewOptionsChange}
      onUndo={handlers.onUndo}
      onRedo={handlers.onRedo}
      onZoomOut={handlers.onZoomOut}
      onZoomIn={handlers.onZoomIn}
      onZoomReset={handlers.onZoomReset}
    />
    {textToolbarSlot}
    {guideSlot}
    <div
      className={`design-editor-scroll-area public-design-editor__scroll${view.viewOptions.showRulers ? '' : ' no-rulers'}`}
      ref={refs.scrollAreaRef}
    >
      <EditorStageWatermark
        visible={assets?.showOrganizationLogo}
        logoUrl={assets?.organizationLogoUrl}
        onError={handlers.onOrganizationLogoError}
      />
      <EditorCanvasRulersLayer
        visible={view.viewOptions.showRulers}
        isSpreadView={navigation.isSpreadView}
        pageWidthMm={geometry.pageWidthMm}
        pageHeightMm={geometry.pageHeightMm}
        fitZoom={view.fitZoom}
        sceneScale={geometry.sceneScale}
        rulerOrigin={view.rulerOrigin}
        showGuides={view.viewOptions.showGuides}
        guides={view.guides}
        onGuidesChange={handlers.onGuidesChange}
      />
      <EditorCanvasViewport
        template={template}
        editorMode={editorMode}
        canvasHandleRef={refs.canvasHandleRef}
        viewportRef={refs.viewportRef}
        fitScalerRef={refs.fitScalerRef}
        pageWidthPx={geometry.pageWidthPx}
        pageHeightPx={geometry.pageHeightPx}
        canvasWidthPx={geometry.canvasWidthPx}
        safeZonePx={geometry.safeZonePx}
        bleedPx={geometry.bleedPx}
        currentPage={document.currentPage}
        pages={document.pages}
        setPages={document.setPages}
        pageLoadKey={navigation.pageLoadKey}
        spreadPairPages={navigation.spreadPairPages}
        showBleed={view.showBleed}
        showTrim={view.showTrim}
        showSafeZone={view.showSafeZone}
        showGuides={view.viewOptions.showGuides}
        guideLinesPx={view.guideLinesPx}
        sidebarPhotos={assets?.sidebarPhotos}
        onSelectionChange={handlers.onSelectionChange}
        onHistoryChange={handlers.onHistoryChange}
        onZoomChange={handlers.onZoomChange}
        onPageThumbReady={handlers.onPageThumbReady}
        onTextFloatingAnchor={handlers.onTextFloatingAnchor}
        onSnapLinesChange={handlers.onSnapLinesChange}
        onDropRemoteImageUrl={handlers.onDropRemoteImageUrl}
        onSidebarPhotoDropped={handlers.onSidebarPhotoDropped}
        resolveImageFileUrl={handlers.resolveImageFileUrl}
      />
    </div>
  </section>
);
