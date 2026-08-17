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

function pickAssetFiles(fileList: FileList | File[] | null): File[] {
  if (!fileList) return [];
  return Array.from(fileList).filter((file) => ASSET_EXTENSIONS.test(file.name));
}

function kindLabel(kind: DesignAssetKind): string {
  return kind === 'background' ? 'Фон' : 'Клипарт';
}

export const DesignAssetsPage: React.FC = () => {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | DesignAssetKind>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [uploadKind, setUploadKind] = useState<DesignAssetKind>('clipart');
  const [uploadCategory, setUploadCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);

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

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setFilePreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

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

  const stats = useMemo(() => ({
    total: assets.length,
    cliparts: assets.filter((asset) => asset.kind === 'clipart' && asset.is_active).length,
    backgrounds: assets.filter((asset) => asset.kind === 'background' && asset.is_active).length,
  }), [assets]);

  const notifySuccess = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 4000);
  };

  const setPickedFiles = (next: File[]) => {
    setFiles(next);
    setError(null);
  };

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
      notifySuccess(`Загружено: ${result.data.created}. Ошибок: ${result.data.failed}.`);
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
      className="design-assets-layout"
      title="Клипарты и фоны"
      icon={<AppIcon name="puzzle" size="sm" />}
      description="Каталог для 2D-редактора и сувениров: клиент выбирает из библиотеки, без своей загрузки в черновик"
      onBack={() => navigate('/adminpanel/design-templates')}
    >
      <div className="design-assets-page product-management">
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        <div className="design-assets-help">
          <button
            type="button"
            className="design-assets-help__toggle"
            onClick={() => setHelpOpen((open) => !open)}
            aria-expanded={helpOpen}
          >
            <span className="design-assets-help__chevron" aria-hidden>{helpOpen ? '▾' : '▸'}</span>
            Как устроена библиотека
          </button>
          {helpOpen && (
            <div className="design-assets-help__body">
              <p>
                Основной формат — <code>SVG</code>. PNG и WebP нужны только для сложного растра.
                Тип задаёт, куда попадёт файл: клипарты вставляются как декор, фоны — на всю страницу.
              </p>
              <p>
                Категория свободная: орнамент, лого, текстура. Можно загрузить пачку файлов сразу.
                Отключённые элементы не показываются в редакторе.
              </p>
            </div>
          )}
        </div>

        <div className="design-assets-toolbar-card">
          <div className="design-assets-toolbar">
            <button
              type="button"
              className="lg-btn lg-btn--primary"
              onClick={() => setUploadOpen((open) => !open)}
            >
              <AppIcon name="plus" size="xs" />
              {uploadOpen ? 'Скрыть форму' : 'Добавить файлы'}
            </button>
            <button type="button" className="lg-btn" onClick={() => navigate('/adminpanel/design-templates')}>
              <AppIcon name="layers" size="xs" /> К шаблонам
            </button>
            <input
              type="search"
              className="design-assets-search"
              placeholder="Поиск по названию, категории, формату…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="design-assets-pills" role="group" aria-label="Фильтр типа">
              {([
                ['all', 'Все'],
                ['clipart', 'Клипарты'],
                ['background', 'Фоны'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`design-assets-pill${kindFilter === value ? ' is-active' : ''}`}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="design-assets-filter">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Показать отключённые
            </label>
          </div>

          {uploadOpen && (
            <form className="design-assets-upload" onSubmit={(event) => void handleUpload(event)}>
              <label
                className={`design-assets-dropzone${dragOver ? ' is-dragover' : ''}${files.length ? ' has-files' : ''}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setDragOver(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  setPickedFiles(pickAssetFiles(event.dataTransfer.files));
                }}
              >
                <span className="design-assets-dropzone__icon" aria-hidden>
                  <AppIcon name="image" size="md" />
                </span>
                <span className="design-assets-dropzone__title">
                  {files.length === 0
                    ? 'Перетащите файлы сюда или нажмите, чтобы выбрать'
                    : files.length === 1
                      ? files[0].name
                      : `Выбрано файлов: ${files.length}`}
                </span>
                <span className="design-assets-dropzone__hint">SVG, PNG, WebP · можно пачкой</span>
                <input
                  type="file"
                  className="design-assets-file-input"
                  accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    setPickedFiles(pickAssetFiles(event.target.files));
                    event.target.value = '';
                  }}
                />
              </label>

              {files.length > 0 && (
                <div className="design-assets-file-previews">
                  {files.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${file.lastModified}`} className="design-assets-file-preview">
                      <span className="design-assets-thumb">
                        {filePreviews[index] ? <img src={filePreviews[index]} alt="" /> : null}
                      </span>
                      <span className="design-assets-file-preview__name">{file.name}</span>
                      <button
                        type="button"
                        className="design-assets-file-preview__remove"
                        aria-label={`Убрать ${file.name}`}
                        onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <AppIcon name="x" size="xs" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="design-assets-upload__grid">
                <div className="design-assets-field">
                  <span className="design-assets-field__label">Тип загрузки</span>
                  <div className="design-assets-pills" role="group" aria-label="Тип загрузки">
                    <button
                      type="button"
                      className={`design-assets-pill${uploadKind === 'clipart' ? ' is-active' : ''}`}
                      onClick={() => setUploadKind('clipart')}
                    >
                      Клипарт
                    </button>
                    <button
                      type="button"
                      className={`design-assets-pill${uploadKind === 'background' ? ' is-active' : ''}`}
                      onClick={() => setUploadKind('background')}
                    >
                      Фон
                    </button>
                  </div>
                </div>
                <label className="design-assets-field">
                  <span className="design-assets-field__label">Категория</span>
                  <input
                    className="design-assets-field__input"
                    value={uploadCategory}
                    onChange={(event) => setUploadCategory(event.target.value)}
                    placeholder="орнамент, лого, текстура"
                  />
                </label>
              </div>

              <div className="design-assets-upload__actions">
                <button type="submit" className="lg-btn lg-btn--primary" disabled={saving || files.length === 0}>
                  {saving
                    ? 'Загрузка…'
                    : files.length > 1
                      ? `Загрузить ${files.length} файлов`
                      : 'Загрузить'}
                </button>
                <button
                  type="button"
                  className="lg-btn"
                  onClick={() => {
                    setUploadOpen(false);
                    setFiles([]);
                    setUploadCategory('');
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="design-assets-stats">
          {stats.cliparts} клипартов · {stats.backgrounds} фонов · {stats.total} всего
          {searchQuery.trim() || kindFilter !== 'all' ? ` · показано ${filtered.length}` : ''}
        </p>

        {loading ? (
          <div className="design-assets-empty">Загрузка библиотеки…</div>
        ) : filtered.length === 0 ? (
          <div className="design-assets-empty">
            {assets.length === 0
              ? 'Пока пусто. Нажмите «Добавить файлы» и загрузите SVG-клипарты или фоны.'
              : 'Ничего не найдено по фильтру.'}
          </div>
        ) : (
          <div className="design-assets-grid">
            {filtered.map((asset) => (
              <article
                key={asset.id}
                className={`design-assets-card${asset.is_active ? '' : ' is-inactive'}`}
              >
                <div className={`design-assets-card__preview design-assets-card__preview--${asset.kind}`}>
                  <img src={asset.thumbUrl || asset.url} alt="" />
                  <div className="design-assets-card__badges">
                    <span className={`design-assets-badge design-assets-badge--${asset.kind}`}>
                      {kindLabel(asset.kind)}
                    </span>
                    <span className="design-assets-badge design-assets-badge--format">
                      {asset.format.toUpperCase()}
                    </span>
                    {!asset.is_active && (
                      <span className="design-assets-badge design-assets-badge--inactive">отключён</span>
                    )}
                  </div>
                </div>
                <div className="design-assets-card__body">
                  <input
                    className="design-assets-card__label"
                    defaultValue={asset.label}
                    aria-label="Название"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== asset.label) void handleUpdate(asset, { label: next });
                    }}
                  />
                  <div className="design-assets-card__meta">
                    <select
                      value={asset.kind}
                      aria-label="Тип"
                      onChange={(event) => void handleUpdate(asset, { kind: event.target.value as DesignAssetKind })}
                    >
                      <option value="clipart">Клипарт</option>
                      <option value="background">Фон</option>
                    </select>
                    <input
                      defaultValue={asset.category ?? ''}
                      placeholder="категория"
                      aria-label="Категория"
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next !== (asset.category ?? '')) void handleUpdate(asset, { category: next });
                      }}
                    />
                  </div>
                </div>
                <div className="design-assets-card__actions">
                  <label className="lg-btn lg-btn--sm">
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
                    className="lg-btn lg-btn--sm"
                    onClick={() => void handleUpdate(asset, { is_active: !asset.is_active })}
                  >
                    {asset.is_active ? 'Отключить' : 'Включить'}
                  </button>
                  {asset.is_active && (
                    <button
                      type="button"
                      className="lg-btn lg-btn--sm design-assets-card__remove"
                      aria-label="Удалить из библиотеки"
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
