import React from 'react';
import type { RefObject } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { TextMobileToolbar } from '../../pages/admin/designEditor/TextMobileToolbar';
import type { SelectedObjProps } from '../../pages/admin/designEditor/types';
import { usePublicDesignTextFormatting } from './usePublicDesignTextFormatting';

interface PublicDesignTextMobileToolbarProps {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  selectedObj: SelectedObjProps;
}

export const PublicDesignTextMobileToolbar: React.FC<PublicDesignTextMobileToolbarProps> = ({
  canvasHandleRef,
  selectedObj,
}) => {
  const handlers = usePublicDesignTextFormatting(canvasHandleRef, selectedObj);

  return <TextMobileToolbar selectedObj={selectedObj} {...handlers} />;
};
