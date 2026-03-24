import React from 'react';
import { SIDEBAR_ITEMS } from './constants';
import type { SidebarSection, SelectedObjProps } from './types';
import { PhotoPanel } from './panels/PhotoPanel';
import { TextPanel } from './panels/TextPanel';
import { ShapesPanel } from './panels/ShapesPanel';
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
  photoSort?: 'name' | 'date';
  onPhotoSortChange?: (v: 'name' | 'date') => void;
  photoAutofill?: boolean;
  onPhotoAutofillChange?: (v: boolean) => void;
  photoHideUsed?: boolean;
  onPhotoHideUsedChange?: (v: boolean) => void;
  // Text
  onAddText?: () => void;
  selectedObj?: SelectedObjProps | null;
  onTextChange?: (text: string) => void;
  onFontChange?: (fontFamily: string) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onTextColorChange?: (color: string) => void;
  onFontWeightToggle?: () => void;
  onFontStyleToggle?: () => void;
  onUnderlineToggle?: () => void;
  onTextAlignChange?: (align: string) => void;
  // Shapes
  onAddShape?: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
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
  photoSort = 'name',
  onPhotoSortChange,
  photoAutofill = false,
  onPhotoAutofillChange,
  photoHideUsed = false,
  onPhotoHideUsedChange,
  onAddText,
  selectedObj,
  onTextChange,
  onFontChange,
  onFontSizeChange,
  onTextColorChange,
  onFontWeightToggle,
  onFontStyleToggle,
  onUnderlineToggle,
  onTextAlignChange,
  onAddShape,
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

  if (
    section === 'photo' &&
    onAddImage &&
    onPhotoDrop &&
    onPhotoDragOver &&
    onPhotoSortChange &&
    onPhotoAutofillChange &&
    onPhotoHideUsedChange
  ) {
    return (
      <PhotoPanel
        onAddImage={onAddImage}
        onAddPhotoField={onAddPhotoField}
        onDrop={onPhotoDrop}
        onDragOver={onPhotoDragOver}
        sortBy={photoSort}
        onSortChange={onPhotoSortChange}
        autofill={photoAutofill}
        onAutofillChange={onPhotoAutofillChange}
        hideUsed={photoHideUsed}
        onHideUsedChange={onPhotoHideUsedChange}
        onClose={onClose}
      />
    );
  }

  if (
    section === 'text' &&
    onAddText &&
    onTextChange &&
    onFontChange &&
    onFontSizeChange &&
    onTextColorChange &&
    onFontWeightToggle &&
    onFontStyleToggle &&
    onUnderlineToggle &&
    onTextAlignChange
  ) {
    return (
      <TextPanel
        onAddText={onAddText}
        selectedObj={selectedObj ?? null}
        onTextChange={onTextChange}
        onFontChange={onFontChange}
        onFontSizeChange={onFontSizeChange}
        onTextColorChange={onTextColorChange}
        onFontWeightToggle={onFontWeightToggle}
        onFontStyleToggle={onFontStyleToggle}
        onUnderlineToggle={onUnderlineToggle}
        onTextAlignChange={onTextAlignChange}
        onClose={onClose}
      />
    );
  }

  if (section === 'shapes' && onAddShape) {
    return <ShapesPanel onAddShape={onAddShape} onClose={onClose} />;
  }

  const placeholderSections: SidebarSection[] = [
    'templates',
    'background',
    'stickers',
    'cliparts',
    'frames',
  ];
  if (placeholderSections.includes(section)) {
    return <PlaceholderPanel title={title} onClose={onClose} />;
  }

  return null;
};
