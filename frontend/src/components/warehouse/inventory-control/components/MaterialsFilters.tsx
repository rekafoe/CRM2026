import React from 'react';

interface MaterialsFiltersProps {
  search: string;
  categoryFilter: string;
  statusFilter: string;
  categories: string[];
  onSearchChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
}

export const MaterialsFilters: React.FC<MaterialsFiltersProps> = React.memo(({
  search,
  categoryFilter,
  statusFilter,
  categories,
  onSearchChange,
  onCategoryFilterChange,
  onStatusFilterChange,
}) => {
  return (
    <div className="inv-filters">
      <input
        placeholder="Найти материал..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />
      <select value={statusFilter} onChange={e => onStatusFilterChange(e.target.value)}>
        <option value="">Все остатки</option>
        <option value="ok">В норме</option>
        <option value="low">Мало</option>
        <option value="out_of_stock">Нет в наличии</option>
      </select>
      <select value={categoryFilter} onChange={e => onCategoryFilterChange(e.target.value)}>
        <option value="">Все категории</option>
        {categories.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
});
