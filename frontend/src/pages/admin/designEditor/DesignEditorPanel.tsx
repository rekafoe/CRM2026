import React from 'react';
import { SIDEBAR_ITEMS } from './constants';
import type { TextBlockPresetKind } from './constants';
import type { SidebarSection, SelectedObjProps, SidebarPhotoItem, TextEffectsValues } from './types';
import { PhotoPanel } from './panels/PhotoPanel';
import { TextPanel } from './panels/TextPanel';
import { ShapesPanel } from './panels/ShapesPanel';
import { BackgroundPanel } from './panels/BackgroundPanel';
import { ObjectPropsPanel } from './panels/ObjectPropsPanel';
import { CollagesPanel } from './panels/CollagesPanel';
import { PlaceholderPanel } from './panels/PlaceholderPanel';

interface DesignEditorPanelProps {
  section: SidebarSection;
  onClose: () => void;
  // Photo
  onAddImage?: () => void;
  onAddPhotoField?: () => void;
  onPhotoDrop?: (e: React.DragEvent) => void;
  onPhotoDragOver?: (e: React.DragEvent) => void;
  onImageUrlSubmit?: (url: string) => Promise<void>;
  photoSort?: 'name' | 'date';
  onPhotoSortChange?: (v: 'name' | 'date') => void;
  onAutofillPhotoFields?: () => void | Promise<void>;
  photoLibrary?: SidebarPhotoItem[];
  onLibraryPhotoClick?: (id: string) => void;
  onLibraryPhotoRemove?: (id: string) => void;
  // Text
  selectedObj?: SelectedObjProps | null;
  onTextChange?: (text: string) => void;
  onAddTextPreset?: (kind: TextBlockPresetKind) => void;
  onApplyFont?: (fontFamily: string) => void;
  /** Шрифты, уже встречающиеся в макете (панель «Используемые шрифты»). */
  usedFonts?: string[];
  onApplyTextColor?: (fill: string) => void;
  onApplyEffects?: (v: TextEffectsValues) => void;
  // Shapes
  onAddShape?: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
  // Background
  onSetBackground?: (color: string) => void;
  onSetBackgroundImage?: (dataUrl: string) => Promise<void>;
  onClearBackground?: () => void;
  canvasWidth?: number;
  canvasHeight?: number;
  // Object props
  onSetObjProp?: (key: string, value: unknown) => void;
  onDuplicateObj?: () => void;
  onDeleteObj?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onFlipX?: () => void;
  onFlipY?: () => void;
  // Collages
  collagePhotoCount?: number;
  onCollagePhotoCountChange?: (v: number) => void;
  collageFilterSuitable?: boolean;
  onCollageFilterSuitableChange?: (v: boolean) => void;
  collagePadding?: number;
  onCollagePaddingChange?: (v: number) => void;
  collageSelectedTemplateId?: number | null;
  onCollageSelectTemplate?: (id: number | null) => void;
}

export const DesignEditorPanel: React.FC<DesignEditorPanelProps> = ({
  section,
  onClose,
  onAddImage,
  onAddPhotoField,
  onPhotoDrop,
  onPhotoDragOver,
  onImageUrlSubmit,
  photoSort = 'name',
  onPhotoSortChange,
  onAutofillPhotoFields,
  photoLibrary = [],
  onLibraryPhotoClick,
  onLibraryPhotoRemove,
  selectedObj,
  onTextChange,
  onAddTextPreset,
  onApplyFont,
  usedFonts = [],
  onApplyTextColor,
  onApplyEffects,
  onAddShape,
  onSetBackground,
  onSetBackgroundImage,
  onClearBackground,
  canvasWidth = 340,
  canvasHeight = 220,
  onSetObjProp,
  onDuplicateObj,
  onDeleteObj,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onFlipX,
  onFlipY,
  collagePhotoCount = 3,
  onCollagePhotoCountChange,
  collageFilterSuitable = false,
  onCollageFilterSuitableChange,
  collagePadding = 20,
  onCollagePaddingChange,
  collageSelectedTemplateId = null,
  onCollageSelectTemplate,
}) => {
  const title = SIDEBAR_ITEMS.find((i) => i.id === section)?.label ?? '';

  if (
    section === 'collages' &&
    onCollagePhotoCountChange &&
    onCollageFilterSuitableChange &&
    onCollagePaddingChange &&
    onCollageSelectTemplate != null
  ) {
    return (
      <CollagesPanel
        onClose={onClose}
        photoCount={collagePhotoCount}
        onPhotoCountChange={onCollagePhotoCountChange}
        filterSuitable={collageFilterSuitable}
        onFilterSuitableChange={onCollageFilterSuitableChange}
        padding={collagePadding}
        onPaddingChange={onCollagePaddingChange}
        selectedTemplateId={collageSelectedTemplateId}
        onSelectTemplate={onCollageSelectTemplate}
      />
    );
  }

  if (section === 'photo' && onAddImage && onPhotoDrop && onPhotoDragOver && onPhotoSortChange) {
    return (
      <PhotoPanel
        onAddImage={onAddImage}
        onAddPhotoField={onAddPhotoField}
        onDrop={onPhotoDrop}
        onDragOver={onPhotoDragOver}
        onImageUrlSubmit={onImageUrlSubmit}
        sortBy={photoSort}
        onSortChange={onPhotoSortChange}
        onAutofillPhotoFields={onAutofillPhotoFields}
        libraryPhotos={photoLibrary}
        onLibraryPhotoClick={onLibraryPhotoClick}
        onLibraryPhotoRemove={onLibraryPhotoRemove}
        onClose={onClose}
      />
    );
  }

  if (
    section === 'text' &&
    onTextChange &&
    onAddTextPreset &&
    onApplyFont &&
    onApplyTextColor &&
    onApplyEffects
  ) {
    return (
      <TextPanel
        selectedObj={selectedObj ?? null}
        usedFonts={usedFonts}
        onTextChange={onTextChange}
        onAddTextPreset={onAddTextPreset}
        onApplyFont={onApplyFont}
        onApplyTextColor={onApplyTextColor}
        onApplyEffects={onApplyEffects}
        onClose={onClose}
      />
    );
  }

  if (section === 'shapes' && onAddShape) {
    return <ShapesPanel onAddShape={onAddShape} onClose={onClose} />;
  }

  if (section === 'background') {
    return (
      <BackgroundPanel
        onSetBackground={onSetBackground ?? (() => {})}
        onSetBackgroundImage={onSetBackgroundImage ?? (() => Promise.resolve())}
        onClearBackground={onClearBackground ?? (() => {})}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        onClose={onClose}
      />
    );
  }

  if (section === 'object') {
    return (
      <ObjectPropsPanel
        selectedObj={selectedObj ?? null}
        onSetObjProp={onSetObjProp ?? (() => {})}
        onDuplicate={onDuplicateObj ?? (() => {})}
        onDelete={onDeleteObj ?? (() => {})}
        onBringForward={onBringForward ?? (() => {})}
        onSendBackward={onSendBackward ?? (() => {})}
        onBringToFront={onBringToFront ?? (() => {})}
        onSendToBack={onSendToBack ?? (() => {})}
        onFlipX={onFlipX ?? (() => {})}
        onFlipY={onFlipY ?? (() => {})}
        onClose={onClose}
      />
    );
  }

  const placeholderSections: SidebarSection[] = [
    'templates',
    'stickers',
    'cliparts',
    'frames',
  ];
  if (placeholderSections.includes(section)) {
    return <PlaceholderPanel title={title} onClose={onClose} />;
  }

  return null;
};
