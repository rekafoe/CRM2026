import React, { useState } from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import type { DesignTemplateCategory } from '../../../api';

type Props = {
  categories: DesignTemplateCategory[];
  value: string;
  onChange: (categoryName: string) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
};

export const DesignTemplateCategoryField: React.FC<Props> = ({
  categories,
  value,
  onChange,
  onCreateCategory,
}) => {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await onCreateCategory(name);
      if (created) {
        onChange(created);
        setNewName('');
        setAdding(false);
      }
    } finally {
      setCreating(false);
    }
  };

  if (adding) {
    return (
      <div className="design-category-field design-category-field--new">
        <input
          type="text"
          value={newName}
          placeholder="Название категории"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
            if (e.key === 'Escape') setAdding(false);
          }}
          autoFocus
        />
        <button type="button" className="lg-btn lg-btn--primary" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
          Создать
        </button>
        <button type="button" className="lg-btn" onClick={() => setAdding(false)}>
          Отмена
        </button>
      </div>
    );
  }

  return (
    <div className="design-category-field">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— без категории —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
      <button type="button" className="design-category-field__add-link" onClick={() => setAdding(true)}>
        <AppIcon name="plus" size="xs" /> Новая
      </button>
    </div>
  );
};
