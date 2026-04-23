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
    <div className="materials-toolbar flex items-center justify-between p-4 bg-secondary rounded shadow mb-4">
      {/* Поиск */}
      <div className="flex items-center gap-4 flex-grow">
        <div className="relative">
          <input
            type="text"
            placeholder="Поиск материалов..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="px-4 py-2 border border-primary rounded-lg bg-primary text-primary placeholder-text-secondary focus:border-accent-primary focus:outline-none"
          />
          <span
            className="absolute right-3 top-1/2 flex -translate-y-1/2 transform text-text-secondary pointer-events-none"
            aria-hidden
          >
            <AppIcon name="search" size="sm" />
          </span>
        </div>
      </div>

      {/* Режимы просмотра */}
      <div className="flex items-center gap-2" role="group" aria-label="Вид списка материалов">
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          className={`inline-flex h-9 w-9 items-center justify-center rounded ${viewMode === 'grid' ? 'bg-accent-primary text-white' : 'bg-tertiary text-text-primary'}`}
          title="Сетка"
          aria-pressed={viewMode === 'grid'}
        >
          <AppIcon name="layers" size="sm" />
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('cards')}
          className={`inline-flex h-9 w-9 items-center justify-center rounded ${viewMode === 'cards' ? 'bg-accent-primary text-white' : 'bg-tertiary text-text-primary'}`}
          title="Строки"
          aria-pressed={viewMode === 'cards'}
        >
          <AppIcon name="receipt" size="sm" />
        </button>
      </div>

      {/* Действия */}
      <div className="flex items-center gap-2">
        <WarehouseButton
          variant="secondary"
          icon={<AppIcon name="filter" size="sm" />}
          onClick={onToggleFilters}
          className={showFilters ? 'active' : ''}
          title="Фильтры"
        >
          Фильтры
        </WarehouseButton>

        <WarehouseButton
          variant="secondary"
          icon={<AppIcon name="refresh" size="sm" />}
          onClick={onRefresh}
          title="Обновить"
        >
          Обновить
        </WarehouseButton>

        <WarehouseButton
          variant="primary"
          icon={<AppIcon name="plus" size="sm" />}
          onClick={onAddMaterial}
          title="Добавить материал"
        >
          Добавить
        </WarehouseButton>
      </div>

      {/* Массовые действия */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 ml-4 p-2 bg-warning-light border border-warning-border rounded">
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
