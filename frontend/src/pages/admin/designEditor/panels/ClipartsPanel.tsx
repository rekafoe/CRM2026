import React, { useMemo, useState } from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { useCrmDesignAssets } from '../../../../hooks/useCrmDesignAssets';
import type { DesignAsset } from '../../../../api';

type Props = {
  onClose: () => void;
  onAddClipart: (asset: DesignAsset) => void | Promise<void>;
};

export const ClipartsPanel: React.FC<Props> = ({ onClose, onAddClipart }) => {
  const { assets, categories, ready } = useCrmDesignAssets('clipart');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category !== 'all' && asset.category !== category) return false;
      if (!q) return true;
      return asset.label.toLowerCase().includes(q);
    });
  }, [assets, category, query]);

  return (
    <div className="design-editor-panel-content">
      <div className="design-editor-panel-header">
        <h3 className="design-editor-panel-title">Клипарты</h3>
        <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
          <AppIcon name="x" size="sm" />
        </button>
      </div>
      <input
        className="design-editor-panel-input"
        type="search"
        placeholder="Поиск"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {categories.length > 0 && (
        <select
          className="design-editor-panel-select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">Все категории</option>
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      )}
      {!ready ? (
        <p className="design-editor-panel-placeholder">Загрузка библиотеки…</p>
      ) : filtered.length === 0 ? (
        <p className="design-editor-panel-placeholder">В библиотеке пока нет клипартов.</p>
      ) : (
        <div className="design-editor-patterns-grid">
          {filtered.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="design-editor-bg-preset"
              disabled={busyId === asset.id}
              title={asset.label}
              onClick={() => {
                setBusyId(asset.id);
                void Promise.resolve(onAddClipart(asset)).finally(() => setBusyId(null));
              }}
            >
              <img src={asset.thumbUrl || asset.url} alt={asset.label} style={{ width: '100%', height: 52, objectFit: 'contain' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClipartsPanel;
