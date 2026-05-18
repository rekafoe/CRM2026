import React from 'react';
import { PageStrip, type PageStripLabels, type PageStripStatus } from '../../pages/admin/designEditor/PageStrip';

export interface EditorShellNavigationState {
  stripItems: Parameters<typeof PageStrip>[0]['items'];
  isSpreadView: boolean;
}

interface EditorPageNavigatorProps {
  pageCount: number;
  navigationLabel: string;
  navigation: EditorShellNavigationState;
  currentPage: number;
  thumbnails: Record<number, string>;
  thumbW: number;
  thumbH: number;
  pageWidth: number;
  pageHeight: number;
  zoom: number;
  spreadMode: boolean;
  collapsed: boolean;
  pageStatuses?: Record<number, PageStripStatus>;
  canAddPages?: boolean;
  canAddSpread?: boolean;
  canDeletePages?: boolean;
  showWhenSingle?: boolean;
  titleLabel?: string;
  labels?: PageStripLabels;
  onGoTo: (pageIndex: number) => void;
  onAddPage: () => void;
  onAddSpread: () => void;
  onDeleteLast: () => void;
  onSpreadModeToggle: () => void;
  onCollapse: () => void;
}

export const EditorPageNavigator: React.FC<EditorPageNavigatorProps> = ({
  pageCount,
  navigationLabel,
  navigation,
  currentPage,
  thumbnails,
  thumbW,
  thumbH,
  pageWidth,
  pageHeight,
  zoom,
  spreadMode,
  collapsed,
  pageStatuses,
  canAddPages = false,
  canAddSpread = false,
  canDeletePages = false,
  showWhenSingle = false,
  titleLabel = 'Карта макета',
  labels,
  onGoTo,
  onAddPage,
  onAddSpread,
  onDeleteLast,
  onSpreadModeToggle,
  onCollapse,
}) => {
  if (!showWhenSingle && pageCount <= 1 && !canAddPages && !canAddSpread) return null;

  return (
    <div className="public-design-editor__page-strip" aria-label={navigationLabel}>
      <PageStrip
        items={navigation.stripItems}
        currentPage={currentPage}
        thumbnails={thumbnails}
        thumbW={thumbW}
        thumbH={thumbH}
        spreadMode={navigation.isSpreadView || spreadMode}
        onGoTo={onGoTo}
        onAddSpread={onAddSpread}
        onAddPage={onAddPage}
        onDeleteLast={onDeleteLast}
        canDelete={canDeletePages}
        canAdd={canAddPages || canAddSpread}
        canAddPage={canAddPages}
        canAddSpread={canAddSpread}
        onSpreadModeToggle={onSpreadModeToggle}
        infoLine={`${pageWidth}×${pageHeight} мм · ${Math.round(zoom * 100)}%`}
        collapsed={collapsed}
        onCollapse={onCollapse}
        pageStatuses={pageStatuses}
        titleLabel={titleLabel}
        labels={labels}
      />
    </div>
  );
};
