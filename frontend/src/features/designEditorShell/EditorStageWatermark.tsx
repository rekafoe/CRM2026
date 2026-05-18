import React from 'react';

interface EditorStageWatermarkProps {
  visible?: boolean | string | null;
  logoUrl?: string | null;
  onError?: () => void;
}

export const EditorStageWatermark: React.FC<EditorStageWatermarkProps> = ({
  visible,
  logoUrl,
  onError,
}) => {
  if (!visible || !logoUrl) return null;

  return (
    <img
      className="public-design-editor__stage-logo"
      src={logoUrl}
      alt=""
      aria-hidden="true"
      onError={onError}
    />
  );
};
