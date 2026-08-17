import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert } from '../../components/common';
import {
  createDesignAssetsBatch,
  deactivateDesignAsset,
  getDesignAssets,
  updateDesignAsset,
  type DesignAsset,
  type DesignAssetKind,
} from '../../api';
import { invalidateCrmDesignAssetsCache } from '../../hooks/useCrmDesignAssets';
import '../../styles/admin-page-layout.css';
import '../../components/admin/ProductManagement.css';
import './DesignAssetsPage.css';

const ASSET_EXTENSIONS = /\.(svg|png|webp)$/i;

function pickAssetFiles(fileList: FileList | null): File[] {
  if (!fileList?.length) return [];
  return Array.from(fileList).filter((file) => ASSET_EXTENSIONS.test(file.name));
}

export const DesignAssetsPage: React.FC = () => {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | DesignAssetKind>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [uploadKind, setUploadKind] = useState<DesignAssetKind>('clipart');
  const [uploadCategory, setUploadCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDesignAssets();
      setAssets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить библиотеку');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!showInactive && !asset.is_active) return false;
      if (kindFilter !== 'all' && asset.kind !== kindFilter) return false;
      if (!q) return true;
      return [asset.label, asset.category, asset.format].some((value) =>
        String(value || '').toLowerCase().includes(q),
      );
    });
  }, [assets, kindFilter, searchQuery, showInactive]);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files.length) {
      setError('Выберите SVG, PNG или WebP');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createDesignAssetsBatch(files, {
        kind: uploadKind,
        category: uploadCategory.trim() || undefined,
      });
      invalidateCrmDesignAssetsCache();
      setFiles([]);
      setSuccess(`Загружено: ${result.data.created}. Ошибок: ${result.data.failed}.`);
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файлы');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (asset: DesignAsset, patch: Parameters<typeof updateDesignAsset>[1]) => {
    setSaving(true);
    setError(null);
    try {
      await updateDesignAsset(asset.id, patch);
      invalidateCrmDesignAssetsCache();
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageLayout
      title="Клипарты и фоны"
      onBack={() => navigate('/adminpanel/design-templates')}
    >
      <div className="design-assets-page">
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        <form className="design-assets-upload" onSubmit={(event) => void handleUpload(event)}>
          <label className="design-assets-dropzone">
            <span>Перетащите SVG, PNG или WebP</span>
            <input
              type="file"
              accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
              multiple
              onChange={(event) => setFiles(pickAssetFiles(event.target.files))}
            />
          </label>
          <label>
            Тип
            <select value={uploadKind} onChange={(event) => setUploadKind(event.target.value as DesignAssetKind)}>
              <option value="clipart">Клипарт</option>
              <option value="background">Фон</option>
            </select>
          </label>
          <label>
            Категория
            <input
              value={uploadCategory}
              onChange={(event) => setUploadCategory(event.target.value)}
              placeholder="орнамент, лого, текстура"
            />
          </label>
          <button type="submit" disabled={saving || files.length === 0}>
            {saving ? 'Загрузка…' : `Загрузить${files.length ? ` (${files.length})` : ''}`}
          </button>
        </form>

        <div className="design-assets-toolbar">
          <input
            type="search"
            placeholder="Поиск"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as 'all' | DesignAssetKind)}
          >
            <option value="all">Все</option>
            <option value="clipart">Клипарты</option>
            <option value="background">Фоны</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Показать отключённые
          </label>
        </div>

        {loading ? (
          <p>Загрузка библиотеки…</p>
        ) : filtered.length === 0 ? (
          <p>Пока пусто. Загрузите SVG-клипарты или фоны.</p>
        ) : (
          <div className="design-assets-grid">
            {filtered.map((asset) => (
              <article
                key={asset.id}
                className={`design-assets-card${asset.is_active ? '' : ' is-inactive'}`}
              >
                <img src={asset.thumbUrl || asset.url} alt={asset.label} />
                <input
                  className="design-assets-card__label"
                  defaultValue={asset.label}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== asset.label) void handleUpdate(asset, { label: next });
                  }}
                />
                <div className="design-assets-card__meta">
                  <select
                    value={asset.kind}
                    onChange={(event) => void handleUpdate(asset, { kind: event.target.value as DesignAssetKind })}
                  >
                    <option value="clipart">Клипарт</option>
                    <option value="background">Фон</option>
                  </select>
                  <input
                    defaultValue={asset.category ?? ''}
                    placeholder="категория"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next !== (asset.category ?? '')) void handleUpdate(asset, { category: next });
                    }}
                  />
                  <span>{asset.format.toUpperCase()}</span>
                </div>
                <div className="design-assets-card__actions">
                  <label>
                    Заменить
                    <input
                      type="file"
                      accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) void handleUpdate(asset, { file });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleUpdate(asset, { is_active: !asset.is_active })}
                  >
                    {asset.is_active ? 'Отключить' : 'Включить'}
                  </button>
                  {asset.is_active && (
                    <button
                      type="button"
                      onClick={() => void deactivateDesignAsset(asset.id).then(() => {
                        invalidateCrmDesignAssetsCache();
                        return loadAssets();
                      })}
                    >
                      <AppIcon name="x" size="xs" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
};

export default DesignAssetsPage;
