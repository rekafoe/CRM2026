import React from 'react';
import { WarehouseButton } from '../common/WarehouseButton';

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
          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary">
            🔍
          </span>
        </div>
      </div>

      {/* Режимы просмотра */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onViewModeChange('grid')}
          className={`p-2 rounded ${viewMode === 'grid' ? 'bg-accent-primary text-white' : 'bg-tertiary text-text-primary'}`}
          title="Сетка"
        >
          ⊞
        </button>
        <button
          onClick={() => onViewModeChange('cards')}
          className={`p-2 rounded ${viewMode === 'cards' ? 'bg-accent-primary text-white' : 'bg-tertiary text-text-primary'}`}
          title="Строки"
        >
          ⊡
        </button>
      </div>

      {/* Действия */}
      <div className="flex items-center gap-2">
        <WarehouseButton
          variant="secondary"
          icon="🔍"
          onClick={onToggleFilters}
          className={showFilters ? 'active' : ''}
        >
          Фильтры
        </WarehouseButton>

        <WarehouseButton
          variant="secondary"
          icon="🔄"
          onClick={onRefresh}
        >
          Обновить
        </WarehouseButton>

        <WarehouseButton
          variant="primary"
          icon="➕"
          onClick={onAddMaterial}
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
            onClick={() => onBulkAction('delete')}
          >
            Удалить
          </WarehouseButton>
          <WarehouseButton
            variant="secondary"
            size="sm"
            onClick={() => onBulkAction('export')}
          >
            Экспорт
          </WarehouseButton>
        </div>
      )}
    </div>
  );
};
