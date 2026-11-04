import React from 'react';
import { Alert } from '../../components/common';
import { PublicDesignEditor } from '../publicDesignEditor/PublicDesignEditor';
import {
  crmPreviewPublicDesignEditorAdapter,
  type PublicDesignEditorAdapter,
} from '../publicDesignEditor/publicDesignEditorAdapter';
import type { PublicDesignDocumentMode } from '../publicDesignEditor/useDesignDocumentNavigation';
import type { PublicDesignPageCountLimits } from '../publicDesignEditor/usePublicDesignPageActions';
import type { PublicDesignBlankPageSpec } from '../publicDesignEditor/usePublicDesignBootstrap';
import { Souvenir3dEditor } from '../souvenir3d';
import { ClientPhotoBatchEditor } from './ClientPhotoBatchEditor';
import './clientEditor.css';

export type ClientEditorMode = 'single' | 'multipage' | 'photo_batch' | 'souvenir_3d';

export interface ClientEditorRouterProps {
  mode: ClientEditorMode;
  productId?: number;
  typeId?: number | string;
  sizeId?: string;
  /** ID шаблона из галереи; если не передан (или <= 0) для single/multipage — открывается конструктор с чистого листа */
  templateId?: number | null;
  /** ID пустого 3D-шаблона из product schema (`simplified.souvenirBlankTemplateId`) для режима souvenir_3d без выбранного дизайна */
  souvenirBlankTemplateId?: number | null;
  /** Размеры и параметры чистого листа (для сценария «Создать макет в редакторе с нуля») */
  blankPageSpec?: PublicDesignBlankPageSpec;
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
  /** Зоны печати для souvenir_3d (из product schema). */
  printAreas?: unknown;
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
  souvenir_3d: {
    title: 'Оформить сувенир',
    text: 'Разместите текст и фото в зоне печати и проверьте результат на 3D-модели. В производство уходит плоский макет.',
  },
};

export const ClientEditorRouter: React.FC<ClientEditorRouterProps> = ({
  mode,
  productId,
  typeId,
  sizeId,
  templateId,
  souvenirBlankTemplateId,
  blankPageSpec,
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
  printAreas,
}) => {
  const scenario = SCENARIO_COPY[mode];
  const showIntro = mode === 'photo_batch';
  const resolvedSouvenirTemplateId =
    templateId != null && Number.isFinite(templateId) && templateId > 0
      ? templateId
      : (souvenirBlankTemplateId != null && Number.isFinite(souvenirBlankTemplateId) && souvenirBlankTemplateId > 0
        ? souvenirBlankTemplateId
        : null);

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
      ) : mode === 'souvenir_3d' ? (
        resolvedSouvenirTemplateId != null ? (
          <Souvenir3dEditor
            templateId={resolvedSouvenirTemplateId}
            initialDraftToken={initialDraftToken}
            onDraftTokenChange={onDraftTokenChange}
            adapter={adapter}
            showFinalizeButton={showFinalizeButton}
            onReadyForCart={onReadyForCart}
            showClientActionBar={showClientActionBar}
            orderButtonLabel={orderButtonLabel}
            selectedParams={selectedParams}
            pageCountLimits={pageCountLimits}
            onPageCountChange={onPageCountChange}
            printAreas={printAreas}
          />
        ) : (
          <Alert type="error">Для сувенирного редактора нужен templateId или souvenirBlankTemplateId.</Alert>
        )
      ) : (
        <PublicDesignEditor
          templateId={templateId}
          productId={productId}
          typeId={typeId}
          sizeId={sizeId}
          blankPageSpec={blankPageSpec}
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
      )}
    </div>
  );
};

export default ClientEditorRouter;
