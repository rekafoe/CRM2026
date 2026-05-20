import React from 'react';
import type { RefObject } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { TextFloatingToolbar } from '../../pages/admin/designEditor/TextFloatingToolbar';
import type { SelectedObjProps } from '../../pages/admin/designEditor/types';
import { usePublicDesignTextFormatting } from './usePublicDesignTextFormatting';

interface PublicDesignTextFloatingControlsProps {
  anchor: { x: number; y: number } | null;
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  selectedObj: SelectedObjProps | null;
}

/** Плавающая панель форматирования — только десктоп (на мобилке — PublicDesignTextMobileToolbar). */
export const PublicDesignTextFloatingControls: React.FC<PublicDesignTextFloatingControlsProps> = ({
  anchor,
  canvasHandleRef,
  selectedObj,
}) => {
  const handlers = usePublicDesignTextFormatting(canvasHandleRef, selectedObj);

  if (selectedObj?.type !== 'IText' || !anchor) return null;

  return (
    <TextFloatingToolbar
      anchor={anchor}
      selectedObj={selectedObj}
      {...handlers}
    />
  );
};
