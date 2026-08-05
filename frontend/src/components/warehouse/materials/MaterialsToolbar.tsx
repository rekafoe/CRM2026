import React from 'react';
import { WarehouseButton } from '../common/WarehouseButton';
import { AppIcon } from '../../ui/AppIcon';

interface MaterialsToolbarProps {
  viewMode: 'grid' | 'cards';
  onViewModeChange: (mode: 'grid' | 'cards') => void;
  onAddMaterial: () => void;
  onRefresh: () => void;
  onToggleFilters: () => void;
  showFilters: boolean;
  selectedCount: number;
  onBulkAction: (action: 'delete' | 'export' | 'update') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const MaterialsToolbar: React.FC<MaterialsToolbarProps> = ({
  viewMode,
  onViewModeChange,
  onAddMaterial,
  onRefresh,
  onToggleFilters,
  showFilters,
  selectedCount,
  onBulkAction,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="materials-toolbar bg-secondary rounded border border-primary">
      <div className="materials-toolbar__search">
        <input
          type="text"
          placeholder="Поиск материалов..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="materials-toolbar__search-input"
        />
        <span className="materials-toolbar__search-icon" aria-hidden>
          <AppIcon name="search" size="sm" />
        </span>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Вид списка материалов">
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          className={`action-btn small ${viewMode === 'grid' ? 'primary' : ''}`}
          title="Сетка"
          aria-pressed={viewMode === 'grid'}
        >
          <AppIcon name="layers" size="sm" />
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('cards')}
          className={`action-btn small ${viewMode === 'cards' ? 'primary' : ''}`}
          title="Строки"
          aria-pressed={viewMode === 'cards'}
        >
          <AppIcon name="receipt" size="sm" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <WarehouseButton
          variant="secondary"
          size="sm"
          icon={<AppIcon name="filter" size="sm" />}
          onClick={onToggleFilters}
          className={showFilters ? 'active' : ''}
          title="Фильтры"
        >
          Фильтры
        </WarehouseButton>

        <WarehouseButton
          variant="secondary"
          size="sm"
          icon={<AppIcon name="refresh" size="sm" />}
          onClick={onRefresh}
          title="Обновить"
        >
          Обновить
        </WarehouseButton>

        <WarehouseButton
          variant="primary"
          size="sm"
          icon={<AppIcon name="plus" size="sm" />}
          onClick={onAddMaterial}
          title="Добавить материал"
        >
          Добавить
        </WarehouseButton>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap ml-auto p-2 bg-warning-light border border-warning-border rounded">
          <span className="text-sm text-warning">
            Выбрано: {selectedCount}
          </span>
          <WarehouseButton
            variant="danger"
            size="sm"
            icon={<AppIcon name="trash" size="xs" />}
            onClick={() => onBulkAction('delete')}
            title="Удалить выбранные"
          >
            Удалить
          </WarehouseButton>
          <WarehouseButton
            variant="secondary"
            size="sm"
            icon={<AppIcon name="download" size="xs" />}
            onClick={() => onBulkAction('export')}
            title="Экспорт"
          >
            Экспорт
          </WarehouseButton>
        </div>
      )}
    </div>
  );
};
