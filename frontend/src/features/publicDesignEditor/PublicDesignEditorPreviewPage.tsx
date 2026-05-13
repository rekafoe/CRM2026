import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { ClientEditorRouter, type ClientEditorMode } from '../clientEditor';

const CLIENT_EDITOR_MODES: ClientEditorMode[] = ['single', 'multipage', 'photo_batch'];

export const PublicDesignEditorPreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = Number(templateId);
  const requestedMode = searchParams.get('mode') as ClientEditorMode | null;
  const mode = requestedMode && CLIENT_EDITOR_MODES.includes(requestedMode) ? requestedMode : 'single';

  return (
    <AdminPageLayout
      title="Предпросмотр клиентского редактора"
      icon={<AppIcon name="image" size="sm" />}
      onBack={() => navigate('/adminpanel/design-templates')}
      className="design-editor-fullbleed"
    >
      <ClientEditorRouter
        mode={mode}
        templateId={id}
        initialDraftToken={searchParams.get('draft')}
        showFinalizeButton
        onDraftTokenChange={(token) => {
          const next = new URLSearchParams(searchParams);
          next.set('draft', token);
          setSearchParams(next, { replace: true });
        }}
      />
    </AdminPageLayout>
  );
};

export default PublicDesignEditorPreviewPage;
