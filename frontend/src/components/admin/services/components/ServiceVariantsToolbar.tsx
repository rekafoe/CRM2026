import React from 'react';
import { Button } from '../../../common';

export type ServiceVariantsAutoSaveHint = 'idle' | 'saving' | 'saved';

export interface ServiceVariantsToolbarProps {
  serviceName: string;
  serviceMinQuantity?: number;
  serviceMaxQuantity?: number;
  autoSaveHint: ServiceVariantsAutoSaveHint;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSaveNow: () => void | Promise<void>;
  onCancelDraft: () => void;
  onAddRangeClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ServiceVariantsToolbar: React.FC<ServiceVariantsToolbarProps> = ({
  serviceName,
  serviceMinQuantity,
  serviceMaxQuantity,
  autoSaveHint,
  hasUnsavedChanges,
  isSaving,
  onSaveNow,
  onCancelDraft,
  onAddRangeClick,
}) => (
  <div className="service-variants-toolbar">
    <div className="service-variants-toolbar__left">
      <div>
        <h3 className="service-variants-title">Варианты услуги: {serviceName}</h3>
        {(serviceMinQuantity !== undefined || serviceMaxQuantity !== undefined) && (
          <div className="service-variants-subtitle">
            Тираж: от {serviceMinQuantity ?? 1}
            {serviceMaxQuantity !== undefined ? ` до ${serviceMaxQuantity}` : ' (без максимума)'}
          </div>
        )}
      </div>
      {autoSaveHint !== 'idle' && (
        <span
          className={
            autoSaveHint === 'saved'
              ? 'service-variants-save-hint service-variants-save-hint--ok'
              : 'service-variants-save-hint service-variants-save-hint--saving'
          }
        >
          {autoSaveHint === 'saving' ? 'Сохранение…' : 'Сохранено'}
        </span>
      )}
      {hasUnsavedChanges && (
        <div className="service-variants-actions">
          {autoSaveHint === 'idle' && (
            <span className="service-variants-actions-muted">Будет сохранено автоматически</span>
          )}
          <Button variant="secondary" size="sm" disabled={isSaving} onClick={() => void onSaveNow()}>
            Сохранить сейчас
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancelDraft}>
            Отменить
          </Button>
        </div>
      )}
    </div>
    <div className="service-variants-toolbar__right">
      <button
        type="button"
        className="el-button el-button--info el-button--mini is-plain"
        onClick={onAddRangeClick}
      >
        <i className="el-icon-plus"></i>
        <span>Диапазон</span>
      </button>
    </div>
  </div>
);
