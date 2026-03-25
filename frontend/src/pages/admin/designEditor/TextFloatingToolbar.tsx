import React from 'react';
import { createPortal } from 'react-dom';
import { TextFormattingControls, type TextFormattingHandlers } from './TextFormattingControls';
import type { SelectedObjProps } from './types';

export type TextFloatingToolbarProps = TextFormattingHandlers & {
  anchor: { x: number; y: number };
  selectedObj: SelectedObjProps;
};

export const TextFloatingToolbar: React.FC<TextFloatingToolbarProps> = ({
  anchor,
  selectedObj,
  ...handlers
}) => {
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <TextFormattingControls
      {...handlers}
      selectedObj={selectedObj}
      variant="floating"
      floatingStyle={{ left: anchor.x, top: anchor.y }}
      onFloatingMouseDown={stop}
    />,
    document.body,
  );
};
