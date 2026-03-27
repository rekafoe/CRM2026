import React from 'react';
import { Button, StatusBadge } from '../../../components/common';
import { AppIcon } from '../../../components/ui/AppIcon';
import { productCanBeDuplicated } from '../../../components/admin/ProductDuplicateModal';
import type { ProductWithDetails } from '../../../services/products';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface TemplateHeaderExtraProps {
  product: ProductWithDetails | null;
  hasUnsavedChanges: boolean;
  autoSaveStatus: AutoSaveStatus;
  onOpenMeta: () => void;
  onOpenDuplicate: () => void;
}

export const TemplateHeaderExtra: React.FC<TemplateHeaderExtraProps> = ({
  product,
  hasUnsavedChanges,
  autoSaveStatus,
  onOpenMeta,
  onOpenDuplicate,
}) => (
  <>
    {product && (
      <StatusBadge
        status={product.is_active ? 'Активен' : 'Отключен'}
        color={product.is_active ? 'success' : 'error'}
        size="sm"
      />
    )}

    {!hasUnsavedChanges && autoSaveStatus !== 'idle' && (
      <div
        className="auto-save-indicator"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color:
            autoSaveStatus === 'saved'
              ? '#10b981'
              : autoSaveStatus === 'error'
                ? '#ef4444'
                : '#64748b',
        }}
      >
        {autoSaveStatus === 'saving' && (
          <span>
            <AppIcon name="save" size="xs" /> Сохранение...
          </span>
        )}
        {autoSaveStatus === 'saved' && (
          <span>
            <AppIcon name="check" size="xs" /> Сохранено
          </span>
        )}
        {autoSaveStatus === 'error' && (
          <span>
            <AppIcon name="warning" size="xs" /> Ошибка сохранения
          </span>
        )}
      </div>
    )}

    <Button
      variant="secondary"
      size="sm"
      onClick={onOpenMeta}
      icon={
        <span style={{ marginRight: '4px' }}>
          <AppIcon name="edit" size="xs" />
        </span>
      }
    >
      Основные поля
    </Button>

    {product && productCanBeDuplicated(product) && (
      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenDuplicate}
        icon={
          <span style={{ marginRight: '4px' }}>
            <AppIcon name="copy" size="xs" />
          </span>
        }
      >
        Копировать продукт
      </Button>
    )}
  </>
);

