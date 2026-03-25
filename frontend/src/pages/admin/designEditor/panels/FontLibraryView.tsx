import React, { useMemo, useState } from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import {
  FONT_CATALOG,
  FONT_PREVIEW_PANGRAM,
  findFontCatalogEntry,
  type FontCatalogEntry,
  type FontCategory,
} from '../fontsCatalog';
import './FontLibraryView.css';

const CATEGORY_OPTIONS: { id: 'all' | FontCategory; label: string }[] = [
  { id: 'all', label: 'Все категории' },
  { id: 'sans', label: 'Без засечек' },
  { id: 'serif', label: 'С засечками' },
  { id: 'display', label: 'Декоративные' },
  { id: 'mono', label: 'Моноширинные' },
  { id: 'handwriting', label: 'Рукописные' },
];

const SCRIPT_OPTIONS: { id: 'all' | 'cyrillic'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'cyrillic', label: 'Кириллические' },
];

function entryForUsedFamily(family: string): FontCatalogEntry {
  return (
    findFontCatalogEntry(family) ?? {
      value: family,
      label: family,
      category: 'sans',
      cyrillic: true,
    }
  );
}

interface FontLibraryViewProps {
  usedFonts: string[];
  currentFontFamily: string | undefined;
  onSelectFont: (fontFamily: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export const FontLibraryView: React.FC<FontLibraryViewProps> = ({
  usedFonts,
  currentFontFamily,
  onSelectFont,
  onBack,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [scriptFilter, setScriptFilter] = useState<'all' | 'cyrillic'>('cyrillic');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FontCategory>('all');

  const usedEntries = useMemo(
    () => usedFonts.map(entryForUsedFamily),
    [usedFonts],
  );

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FONT_CATALOG.filter((f) => {
      if (scriptFilter === 'cyrillic' && !f.cyrillic) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        f.label.toLowerCase().includes(q) ||
        f.value.toLowerCase().includes(q)
      );
    });
  }, [query, scriptFilter, categoryFilter]);

  const filteredUsed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return usedEntries.filter((f) => {
      if (scriptFilter === 'cyrillic' && !f.cyrillic) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        f.label.toLowerCase().includes(q) ||
        f.value.toLowerCase().includes(q)
      );
    });
  }, [usedEntries, query, scriptFilter, categoryFilter]);

  return (
    <div className="font-library">
      <div className="font-library__header">
        <button
          type="button"
          className="font-library__icon-btn"
          onClick={onBack}
          aria-label="Назад"
        >
          <AppIcon name="arrow-left" size="sm" />
        </button>
        <h3 className="font-library__title">Настройки текста</h3>
        <button
          type="button"
          className="font-library__icon-btn"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <AppIcon name="x" size="sm" />
        </button>
      </div>

      <div className="font-library__search-wrap">
        <span className="font-library__search-icon" aria-hidden>
          <AppIcon name="search" size="sm" />
        </span>
        <input
          type="search"
          className="font-library__search"
          placeholder="Искать шрифты…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="font-library__filters">
        <select
          className="font-library__select"
          value={scriptFilter}
          onChange={(e) => setScriptFilter(e.target.value as 'all' | 'cyrillic')}
          aria-label="Набор символов"
        >
          {SCRIPT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="font-library__select"
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as 'all' | FontCategory)
          }
          aria-label="Категория"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="font-library__scroll">
        {filteredUsed.length > 0 && (
          <section className="font-library__section" aria-label="Используемые шрифты">
            <h4 className="font-library__section-title">Используемые шрифты</h4>
            <ul className="font-library__list">
              {filteredUsed.map((f) => (
                <li key={`used-${f.value}`}>
                  <button
                    type="button"
                    className={`font-library__row${
                      currentFontFamily === f.value ? ' font-library__row--active' : ''
                    }`}
                    onClick={() => onSelectFont(f.value)}
                  >
                    <span className="font-library__name">{f.label}</span>
                    <span className="font-library__meta">Normal</span>
                    <span
                      className="font-library__preview"
                      style={{ fontFamily: `"${f.value}", sans-serif` }}
                    >
                      {FONT_PREVIEW_PANGRAM}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="font-library__section" aria-label="Все шрифты">
          <h4 className="font-library__section-title">
            Все шрифты ({filteredCatalog.length})
          </h4>
          <ul className="font-library__list">
            {filteredCatalog.map((f) => (
              <li key={f.value}>
                <button
                  type="button"
                  className={`font-library__row${
                    currentFontFamily === f.value ? ' font-library__row--active' : ''
                  }`}
                  onClick={() => onSelectFont(f.value)}
                >
                  <span className="font-library__name">{f.label}</span>
                  <span
                    className="font-library__preview font-library__preview--solo"
                    style={{ fontFamily: `"${f.value}", sans-serif` }}
                  >
                    {FONT_PREVIEW_PANGRAM}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filteredCatalog.length === 0 && (
            <p className="font-library__empty">Ничего не найдено. Измените фильтры или запрос.</p>
          )}
        </section>
      </div>
    </div>
  );
};
