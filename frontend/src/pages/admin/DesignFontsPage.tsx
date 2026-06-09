import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert } from '../../components/common';
import {
  createDesignFont,
  createDesignFontsBatch,
  deactivateDesignFont,
  getDesignFonts,
  updateDesignFont,
  type DesignFont,
  type DesignFontBatchItemResult,
} from '../../api';
import { loadDesignFontFromLibrary } from '../../utils/loadDesignFonts';
import { guessFontFamilyFromFilename } from '../../utils/fontFamilyNormalize';
import '../../styles/admin-page-layout.css';
import '../../components/admin/ProductManagement.css';
import './DesignFontsPage.css';

const FONT_PREVIEW = 'Съешь ещё этих мягких французских булок';
const FONT_PREVIEW_LATIN = 'VOGUE · Birthday girl · 10.02.2004';
const PREVIEW_STYLE_ID = 'design-fonts-preview-styles';
const FONT_EXTENSIONS = /\.(woff2|woff|ttf|otf)$/i;

function isFontFile(file: File): boolean {
  return FONT_EXTENSIONS.test(file.name);
}

function pickFontFiles(fileList: FileList | null): File[] {
  if (!fileList?.length) return [];
  return Array.from(fileList).filter(isFontFile);
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function syncFontPreviewStyles(fonts: DesignFont[], loadedIds: Set<number>): void {
  let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = PREVIEW_STYLE_ID;
    document.head.appendChild(el);
  }
  const rules = fonts
    .filter((font) => loadedIds.has(font.id))
    .map((font) => (
      `.design-fonts-card--id-${font.id} .design-fonts-card__preview `
      + `{ font-family: "${escapeCssString(font.family_name)}", sans-serif; }`
    ));
  el.textContent = rules.join('\n');
}

export const DesignFontsPage: React.FC = () => {
  const navigate = useNavigate();
  const [fonts, setFonts] = useState<DesignFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loadedPreviewIds, setLoadedPreviewIds] = useState<Set<number>>(() => new Set());
  const [form, setForm] = useState({
    family_name: '',
    files: [] as File[],
  });
  const [editFamilyName, setEditFamilyName] = useState(false);
  const [batchResults, setBatchResults] = useState<DesignFontBatchItemResult[] | null>(null);
  const [replaceId, setReplaceId] = useState<number | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadFonts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDesignFonts();
      setFonts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить шрифты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFonts();
  }, [loadFonts]);

  useEffect(() => {
    if (!fonts.length) {
      setLoadedPreviewIds(new Set());
      syncFontPreviewStyles([], new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = new Set<number>();
      for (const font of fonts) {
        const ok = await loadDesignFontFromLibrary(font);
        if (ok && !cancelled) loaded.add(font.id);
      }
      if (!cancelled) {
        setLoadedPreviewIds(loaded);
        syncFontPreviewStyles(fonts, loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fonts]);

  useEffect(() => () => {
    document.getElementById(PREVIEW_STYLE_ID)?.remove();
  }, []);

  const filteredFonts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fonts.filter((font) => {
      if (!showInactive && !font.is_active) return false;
      if (!q) return true;
      return (
        font.label.toLowerCase().includes(q)
        || font.family_name.toLowerCase().includes(q)
        || font.format.toLowerCase().includes(q)
        || String(font.id).includes(q)
      );
    });
  }, [fonts, searchQuery, showInactive]);

  const stats = useMemo(() => ({
    total: fonts.length,
    active: fonts.filter((f) => f.is_active).length,
  }), [fonts]);

  const notifySuccess = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 4000);
  };

  const handleFilesSelect = (fileList: FileList | null) => {
    const files = pickFontFiles(fileList);
    if (!files.length) {
      setForm({ family_name: '', files: [] });
      setEditFamilyName(false);
      setBatchResults(null);
      return;
    }
    setForm({
      files,
      family_name: files.length === 1 ? guessFontFamilyFromFilename(files[0].name) : '',
    });
    setEditFamilyName(false);
    setBatchResults(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.files.length) {
      setError('Выберите файл шрифта (woff2, woff, ttf, otf)');
      return;
    }
    const isSingle = form.files.length === 1;
    try {
      setSaving(true);
      setError(null);
      setBatchResults(null);

      if (isSingle) {
        const file = form.files[0];
        const family_name = form.family_name.trim() || guessFontFamilyFromFilename(file.name);
        await createDesignFont({
          family_name: family_name || undefined,
          file,
        });
        setForm({ family_name: '', files: [] });
        setEditFamilyName(false);
        setUploadOpen(false);
        notifySuccess('Шрифт добавлен в библиотеку');
        await loadFonts();
      } else {
        const res = await createDesignFontsBatch(form.files);
        const { created, updated, skipped, failed, results } = res.data;
        setBatchResults(results);
        setForm({ family_name: '', files: [] });
        setEditFamilyName(false);
        if (created > 0 || updated > 0) {
          await loadFonts();
        }
        if (failed === 0 && skipped === 0) {
          setUploadOpen(false);
          const ok = created + updated;
          notifySuccess(ok === created
            ? `Добавлено шрифтов: ${created}`
            : `Обработано шрифтов: ${ok} (новых ${created}, обновлено ${updated})`);
        } else {
          const parts: string[] = [];
          if (created > 0) parts.push(`добавлено ${created}`);
          if (updated > 0) parts.push(`обновлено ${updated}`);
          if (skipped > 0) parts.push(`пропущено ${skipped}`);
          if (failed > 0) parts.push(`ошибок ${failed}`);
          notifySuccess(`Загрузка завершена: ${parts.join(', ')}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить шрифт');
    } finally {
      setSaving(false);
    }
  };

  const handleReplace = async (id: number) => {
    if (!replaceFile) {
      setError('Выберите файл для замены');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await updateDesignFont(id, { file: replaceFile });
      setReplaceId(null);
      setReplaceFile(null);
      notifySuccess('Файл шрифта обновлён');
      await loadFonts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить файл');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!window.confirm('Отключить шрифт в библиотеке? Макеты с этим family_name перестанут его находить.')) return;
    try {
      await deactivateDesignFont(id);
      notifySuccess('Шрифт отключён');
      await loadFonts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отключить шрифт');
    }
  };

  const handleCopyFamily = async (font: DesignFont) => {
    try {
      await navigator.clipboard.writeText(font.family_name);
      setCopiedId(font.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Не удалось скопировать family_name');
    }
  };

  return (
    <AdminPageLayout
      className="design-fonts-layout"
      title="Библиотека шрифтов"
      icon={<AppIcon name="document" size="sm" />}
      description="Единая база для импорта шаблонов, редактора, production PDF и сайта"
      onBack={() => navigate('/adminpanel/design-templates')}
    >
      <div className="design-fonts-page product-management">
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        <div className="design-fonts-help">
          <button
            type="button"
            className="design-fonts-help__toggle"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
          >
            <span className="design-fonts-help__chevron" aria-hidden>{helpOpen ? '▾' : '▸'}</span>
            Как подключить шрифт к макету
          </button>
          {helpOpen && (
            <div className="design-fonts-help__body">
              <p>
                Можно выбрать несколько файлов или целую папку — имена берутся из названий
                (<code>HappyTime.otf</code> → <code>Happy Time</code>).
              </p>
              <p>
                Уже загруженные шрифты пропускаются. Для одного файла с другим написанием
                (например <code>Voguella</code>) нажмите «Изменить имя» перед загрузкой.
              </p>
            </div>
          )}
        </div>

        <div className="design-fonts-toolbar-card">
          <div className="design-fonts-toolbar">
            <button
              type="button"
              className="lg-btn lg-btn--primary"
              onClick={() => setUploadOpen((v) => !v)}
            >
              <AppIcon name="plus" size="xs" />
              {uploadOpen ? 'Скрыть форму' : 'Добавить шрифт'}
            </button>
            <button type="button" className="lg-btn" onClick={() => navigate('/adminpanel/design-templates')}>
              <AppIcon name="layers" size="xs" /> К шаблонам
            </button>
            <input
              type="search"
              className="design-fonts-search"
              placeholder="Поиск по названию, family_name, формату…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <label className="design-fonts-filter">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Показать отключённые
            </label>
          </div>

          {uploadOpen && (
            <form className="design-fonts-upload" onSubmit={(e) => void handleCreate(e)}>
              <label className="design-fonts-dropzone">
                <span className="design-fonts-dropzone__icon" aria-hidden>
                  <AppIcon name="download" size="md" />
                </span>
                <span className="design-fonts-dropzone__title">
                  {form.files.length === 0
                    ? 'Выберите файлы или папку со шрифтами'
                    : form.files.length === 1
                      ? form.files[0].name
                      : `Выбрано файлов: ${form.files.length}`}
                </span>
                <span className="design-fonts-dropzone__hint">woff2, woff, ttf, otf · до 100 за раз</span>
                <input
                  type="file"
                  className="design-fonts-file-picker__input"
                  accept=".woff2,.woff,.ttf,.otf"
                  multiple
                  onChange={(e) => handleFilesSelect(e.target.files)}
                />
              </label>

              <div className="design-fonts-upload__pickers">
                <label className="design-fonts-folder-picker">
                  <AppIcon name="folder" size="xs" />
                  Выбрать папку
                  <input
                    type="file"
                    className="design-fonts-file-picker__input"
                    accept=".woff2,.woff,.ttf,.otf"
                    multiple
                    onChange={(e) => handleFilesSelect(e.target.files)}
                    // @ts-expect-error webkitdirectory is supported in Chromium-based browsers
                    webkitdirectory=""
                  />
                </label>
              </div>

              {form.files.length === 1 && (
                <div className="design-fonts-detected">
                  {!editFamilyName ? (
                    <p className="design-fonts-detected__text">
                      Имя в библиотеке: <strong>{form.family_name}</strong>
                      <button
                        type="button"
                        className="design-fonts-detected__edit"
                        onClick={() => setEditFamilyName(true)}
                      >
                        Изменить имя
                      </button>
                    </p>
                  ) : (
                    <label className="design-fonts-field">
                      <span className="design-fonts-field__label">Имя как в макете (font-family)</span>
                      <input
                        className="design-fonts-field__input"
                        value={form.family_name}
                        onChange={(e) => setForm((p) => ({ ...p, family_name: e.target.value }))}
                        autoFocus
                      />
                    </label>
                  )}
                </div>
              )}

              {form.files.length > 1 && (
                <ul className="design-fonts-batch-list">
                  {form.files.map((file) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}`} className="design-fonts-batch-list__item">
                      <span className="design-fonts-batch-list__file">{file.name}</span>
                      <span className="design-fonts-batch-list__family">
                        {guessFontFamilyFromFilename(file.name)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {batchResults && batchResults.length > 0 && (
                <ul className="design-fonts-batch-results">
                  {batchResults.map((item) => (
                    <li
                      key={`${item.filename}-${item.status}-${item.family_name ?? ''}`}
                      className={`design-fonts-batch-results__item design-fonts-batch-results__item--${item.status}`}
                    >
                      <span className="design-fonts-batch-results__file">{item.filename}</span>
                      <span className="design-fonts-batch-results__detail">
                        {item.status === 'created' && `→ ${item.family_name}`}
                        {item.status === 'updated' && `обновлён: ${item.family_name}`}
                        {item.status === 'skipped' && `пропущен: ${item.reason}`}
                        {item.status === 'error' && (item.error ?? 'ошибка')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="design-fonts-upload__actions">
                <button type="submit" className="lg-btn lg-btn--primary" disabled={saving || !form.files.length}>
                  {saving
                    ? 'Загрузка…'
                    : form.files.length > 1
                      ? `Загрузить ${form.files.length} шрифтов`
                      : 'Загрузить'}
                </button>
                <button
                  type="button"
                  className="lg-btn"
                  onClick={() => {
                    setUploadOpen(false);
                    setForm({ family_name: '', files: [] });
                    setEditFamilyName(false);
                    setBatchResults(null);
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="design-fonts-stats">
          {stats.active} активных · {stats.total} всего
          {searchQuery.trim() ? ` · найдено ${filteredFonts.length}` : ''}
        </p>

        {loading ? (
          <div className="design-fonts-empty">Загрузка библиотеки…</div>
        ) : filteredFonts.length === 0 ? (
          <div className="design-fonts-empty">
            {fonts.length === 0
              ? 'Пока нет шрифтов. Нажмите «Добавить шрифт» и загрузите файлы или папку.'
              : 'Ничего не найдено по фильтру.'}
          </div>
        ) : (
          <div className="design-fonts-grid">
            {filteredFonts.map((font) => (
              <article
                key={font.id}
                className={[
                  'design-fonts-card',
                  `design-fonts-card--id-${font.id}`,
                  font.is_active ? '' : 'design-fonts-card--inactive',
                  loadedPreviewIds.has(font.id) ? 'design-fonts-card--loaded' : '',
                ].filter(Boolean).join(' ')}
              >
                <header className="design-fonts-card__header">
                  <div className="design-fonts-card__titles">
                    <h3 className="design-fonts-card__label">{font.label}</h3>
                    <code className="design-fonts-card__family">{font.family_name}</code>
                  </div>
                  <div className="design-fonts-card__badges">
                    <span className="design-fonts-badge design-fonts-badge--format">{font.format}</span>
                    {!font.is_active && (
                      <span className="design-fonts-badge design-fonts-badge--inactive">отключён</span>
                    )}
                  </div>
                </header>

                <div className="design-fonts-card__preview-wrap">
                  <p className="design-fonts-card__preview">{FONT_PREVIEW}</p>
                  <p className="design-fonts-card__preview design-fonts-card__preview--latin">{FONT_PREVIEW_LATIN}</p>
                  {!loadedPreviewIds.has(font.id) && (
                    <span className="design-fonts-card__preview-fallback">Превью недоступно</span>
                  )}
                </div>

                <footer className="design-fonts-card__footer">
                  {replaceId === font.id ? (
                    <div className="design-fonts-card__replace">
                      <label className="design-fonts-file-picker design-fonts-file-picker--compact">
                        <span className="design-fonts-file-picker__btn">Файл</span>
                        <span className="design-fonts-file-picker__name">
                          {replaceFile?.name ?? 'не выбран'}
                        </span>
                        <input
                          type="file"
                          className="design-fonts-file-picker__input"
                          accept=".woff2,.woff,.ttf,.otf"
                          onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <button
                        type="button"
                        className="lg-btn lg-btn--primary lg-btn--sm"
                        onClick={() => void handleReplace(font.id)}
                        disabled={saving}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className="lg-btn lg-btn--sm"
                        onClick={() => { setReplaceId(null); setReplaceFile(null); }}
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <div className="design-fonts-card__actions">
                      <button
                        type="button"
                        className="lg-btn lg-btn--sm"
                        onClick={() => void handleCopyFamily(font)}
                      >
                        <AppIcon name="copy" size="xs" />
                        {copiedId === font.id ? 'Скопировано' : 'family_name'}
                      </button>
                      <button
                        type="button"
                        className="lg-btn lg-btn--sm"
                        onClick={() => setReplaceId(font.id)}
                      >
                        <AppIcon name="refresh" size="xs" /> Заменить файл
                      </button>
                      {font.is_active && (
                        <button
                          type="button"
                          className="lg-btn lg-btn--sm"
                          onClick={() => void handleDeactivate(font.id)}
                        >
                          <AppIcon name="ban" size="xs" /> Отключить
                        </button>
                      )}
                    </div>
                  )}
                  <span className="design-fonts-card__id">ID {font.id}</span>
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
};

export default DesignFontsPage;
