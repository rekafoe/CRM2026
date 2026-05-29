import React from 'react';
import { EditorMobilePagePager } from './EditorMobilePagePager';
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
  onInsertPage?: (pageIndex: number) => void;
  onDeletePage?: (pageIndex: number) => void;
  onAddSpread: () => void;
  onDeleteLast: () => void;
  onSpreadModeToggle: () => void;
  onCollapse: () => void;
  compact?: boolean;
  appearance?: 'admin' | 'client';
  showInfoLine?: boolean;
  /** Подсказка в мобильном пейджере (напр. постраничный режим на телефоне) */
  mobilePagesOnlyHint?: string;
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
  onInsertPage,
  onDeletePage,
  onAddSpread,
  onDeleteLast,
  onSpreadModeToggle,
  onCollapse,
  compact = false,
  appearance = 'admin',
  showInfoLine = true,
  mobilePagesOnlyHint,
}) => {
  if (!showWhenSingle && pageCount <= 1 && !canAddPages && !canAddSpread) return null;

  if (compact) {
    return (
      <div className="public-design-editor__page-strip public-design-editor__page-strip--pager" aria-label={navigationLabel}>
        <EditorMobilePagePager
          items={navigation.stripItems}
          currentPage={currentPage}
          thumbnails={thumbnails}
          thumbW={thumbW}
          thumbH={thumbH}
          pageStatuses={pageStatuses}
          canAddSpread={canAddSpread && spreadMode}
          addSpreadLabel={labels?.addSpread}
          pagesOnlyHint={mobilePagesOnlyHint}
          onGoTo={onGoTo}
          onAddSpread={onAddSpread}
        />
      </div>
    );
  }

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
        onInsertPage={onInsertPage}
        onDeletePage={onDeletePage}
        onDeleteLast={onDeleteLast}
        canDelete={canDeletePages}
        canAdd={canAddPages || canAddSpread}
        canAddPage={canAddPages}
        canAddSpread={canAddSpread}
        onSpreadModeToggle={onSpreadModeToggle}
        infoLine={showInfoLine ? `${pageWidth}×${pageHeight} мм · ${Math.round(zoom * 100)}%` : undefined}
        collapsed={collapsed}
        onCollapse={onCollapse}
        pageStatuses={pageStatuses}
        titleLabel={titleLabel}
        labels={labels}
        compact={compact}
        appearance={appearance}
      />
    </div>
  );
};
