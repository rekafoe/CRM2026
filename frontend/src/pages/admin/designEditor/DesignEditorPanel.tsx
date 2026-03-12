import React from 'react';
import { SIDEBAR_ITEMS } from './constants';
import type { SidebarSection } from './types';
import { PhotoPanel } from './panels/PhotoPanel';
import { TextPanel } from './panels/TextPanel';
import { PlaceholderPanel } from './panels/PlaceholderPanel';
import type { CanvasText } from './types';

interface DesignEditorPanelProps {
  section: SidebarSection;
  onClose: () => void;
  // Photo
  onAddImage?: () => void;
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
  selectedText?: CanvasText | null;
  onTextChange?: (text: string) => void;
  onFontChange?: (fontFamily: string) => void;
  onFontSizeChange?: (fontSize: number) => void;
}

export const DesignEditorPanel: React.FC<DesignEditorPanelProps> = ({
  section,
  onClose,
  onAddImage,
  onPhotoDrop,
  onPhotoDragOver,
  photoSort = 'name',
  onPhotoSortChange,
  photoAutofill = false,
  onPhotoAutofillChange,
  photoHideUsed = false,
  onPhotoHideUsedChange,
  onAddText,
  selectedText,
  onTextChange,
  onFontChange,
  onFontSizeChange,
}) => {
  const title = SIDEBAR_ITEMS.find((i) => i.id === section)?.label ?? '';

  if (section === 'photo' && onAddImage && onPhotoDrop && onPhotoDragOver && onPhotoSortChange && onPhotoAutofillChange && onPhotoHideUsedChange) {
    return (
      <PhotoPanel
        onAddImage={onAddImage}
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

  if (section === 'text' && onAddText && onTextChange && onFontChange && onFontSizeChange) {
    return (
      <TextPanel
        onAddText={onAddText}
        selectedText={selectedText ?? null}
        onTextChange={onTextChange}
        onFontChange={onFontChange}
        onFontSizeChange={onFontSizeChange}
        onClose={onClose}
      />
    );
  }

  const placeholderSections: SidebarSection[] = ['templates', 'background', 'collages', 'stickers', 'cliparts', 'frames'];
  if (placeholderSections.includes(section)) {
    return <PlaceholderPanel title={title} onClose={onClose} />;
  }

  return null;
};
