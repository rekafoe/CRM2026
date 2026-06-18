import React from 'react';
import { Alert } from '../../components/common';
import { PublicDesignEditor } from '../publicDesignEditor/PublicDesignEditor';
import {
  crmPreviewPublicDesignEditorAdapter,
  type PublicDesignEditorAdapter,
} from '../publicDesignEditor/publicDesignEditorAdapter';
import type { PublicDesignDocumentMode } from '../publicDesignEditor/useDesignDocumentNavigation';
import type { PublicDesignPageCountLimits } from '../publicDesignEditor/usePublicDesignPageActions';
import { ClientPhotoBatchEditor } from './ClientPhotoBatchEditor';
import './clientEditor.css';

export type ClientEditorMode = 'single' | 'multipage' | 'photo_batch';

export interface ClientEditorRouterProps {
  mode: ClientEditorMode;
  productId?: number;
  typeId?: number | string;
  sizeId?: string;
  templateId?: number;
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  adapter?: PublicDesignEditorAdapter;
  showFinalizeButton?: boolean;
  onReadyForCart?: (draftToken: string) => void;
  showClientActionBar?: boolean;
  orderButtonLabel?: string;
  selectedParams?: Record<string, unknown>;
  pageCountLimits?: PublicDesignPageCountLimits;
  onPageCountChange?: (pageCount: number) => void;
}

const SCENARIO_COPY: Record<ClientEditorMode, { title: string; text: string }> = {
  single: {
    title: 'Заполнить макет',
    text: 'Замените фото и текст в выбранном листовом шаблоне. Исходный master-шаблон не изменится.',
  },
  multipage: {
    title: 'Собрать многостраничный макет',
    text: 'Заполните страницы или развороты, проверьте порядок и сохраните свой экземпляр макета.',
  },
  photo_batch: {
    title: 'Загрузить фото на печать',
    text: 'Добавьте фото, выберите формат, количество и способ вписывания для печати.',
  },
};

export const ClientEditorRouter: React.FC<ClientEditorRouterProps> = ({
  mode,
  productId,
  typeId,
  sizeId,
  templateId,
  initialDraftToken,
  onDraftTokenChange,
  adapter = crmPreviewPublicDesignEditorAdapter,
  showFinalizeButton = false,
  onReadyForCart,
  showClientActionBar = false,
  orderButtonLabel = 'Заказать',
  selectedParams,
  pageCountLimits,
  onPageCountChange,
}) => {
  const scenario = SCENARIO_COPY[mode];
  const showIntro = mode === 'photo_batch';

  return (
    <div className={`client-editor client-editor--${mode}`}>
      {showIntro && (
        <header className="client-editor__hero">
          <div>
            <span className="client-editor__eyebrow">Клиентский редактор</span>
            <h1>{scenario.title}</h1>
            <p>{scenario.text}</p>
          </div>
          <nav className="client-editor__steps" aria-label="Этапы подготовки">
            <span>Фото</span>
            <span>Текст</span>
            <span>Проверка</span>
            <span>Оформление</span>
          </nav>
        </header>
      )}

      {mode === 'photo_batch' ? (
        <ClientPhotoBatchEditor
          adapter={adapter}
          initialDraftToken={initialDraftToken}
          onDraftTokenChange={onDraftTokenChange}
          productId={productId}
          typeId={typeId}
          sizeId={sizeId}
        />
      ) : templateId != null && Number.isFinite(templateId) ? (
        <PublicDesignEditor
          templateId={templateId}
          initialDraftToken={initialDraftToken}
          onDraftTokenChange={onDraftTokenChange}
          adapter={adapter}
          documentMode={mode as PublicDesignDocumentMode}
          showFinalizeButton={showFinalizeButton}
          onReadyForCart={onReadyForCart}
          showClientActionBar={showClientActionBar}
          orderButtonLabel={orderButtonLabel}
          selectedParams={selectedParams}
          pageCountLimits={pageCountLimits}
          onPageCountChange={onPageCountChange}
        />
      ) : (
        <Alert type="error">Для редактора макета нужен templateId.</Alert>
      )}
    </div>
  );
};

export default ClientEditorRouter;
