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
    <div className="public-design-editor__stage-watermark" aria-hidden="true">
      <img
        className="public-design-editor__stage-logo public-design-editor__stage-logo--primary"
        src={logoUrl}
        alt=""
        onError={onError}
      />
      <img
        className="public-design-editor__stage-logo public-design-editor__stage-logo--secondary"
        src={logoUrl}
        alt=""
      />
      <img
        className="public-design-editor__stage-logo public-design-editor__stage-logo--tertiary"
        src={logoUrl}
        alt=""
      />
    </div>
  );
};
