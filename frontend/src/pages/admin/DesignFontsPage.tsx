import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert } from '../../components/common';
import {
  createDesignFont,
  deactivateDesignFont,
  getDesignFonts,
  updateDesignFont,
  type DesignFont,
} from '../../api';
import { loadDesignFontFromLibrary } from '../../utils/loadDesignFonts';
import '../../styles/admin-page-layout.css';
import '../../components/admin/ProductManagement.css';
import './DesignFontsPage.css';

const FONT_PREVIEW = 'Съешь ещё этих мягких французских булок';
const FONT_PREVIEW_LATIN = 'VOGUE · Birthday girl · 10.02.2004';
const PREVIEW_STYLE_ID = 'design-fonts-preview-styles';

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
    label: '',
    file: null as File | null,
  });
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file || !form.family_name.trim()) {
      setError('Укажите family_name и файл шрифта (woff2, woff, ttf, otf)');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createDesignFont({
        family_name: form.family_name.trim(),
        label: form.label.trim() || form.family_name.trim(),
        file: form.file,
      });
      setForm({ family_name: '', label: '', file: null });
      setUploadOpen(false);
      notifySuccess('Шрифт добавлен в библиотеку');
      await loadFonts();
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
                Поле <strong>family_name</strong> должно совпадать с именем в SVG / Corel / Illustrator
                (например <code>Ceremonious One</code>, <code>Voguella</code>).
              </p>
              <p>
                Файлы из папки <code>fonts/</code> в ZIP не переименуют шрифт в макете — только
                доставят файл, если имя совпадает. Подробнее: <code>docs/design-fonts.md</code>.
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
              <div className="design-fonts-upload__grid">
                <label className="design-fonts-field">
                  <span className="design-fonts-field__label">family_name (как в макете)</span>
                  <input
                    className="design-fonts-field__input"
                    value={form.family_name}
                    onChange={(e) => setForm((p) => ({ ...p, family_name: e.target.value }))}
                    placeholder="Ceremonious One"
                    required
                  />
                  <span className="design-fonts-field__hint">Точное имя из SVG / font-family</span>
                </label>
                <label className="design-fonts-field">
                  <span className="design-fonts-field__label">Подпись в админке</span>
                  <input
                    className="design-fonts-field__input"
                    value={form.label}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder="Ceremonious One"
                  />
                </label>
                <label className="design-fonts-field design-fonts-field--file">
                  <span className="design-fonts-field__label">Файл шрифта</span>
                  <span className="design-fonts-file-picker">
                    <span className="design-fonts-file-picker__btn">Выбрать файл</span>
                    <span className="design-fonts-file-picker__name">
                      {form.file?.name ?? 'woff2, woff, ttf, otf'}
                    </span>
                    <input
                      type="file"
                      className="design-fonts-file-picker__input"
                      accept=".woff2,.woff,.ttf,.otf"
                      onChange={(e) => setForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
                      required
                    />
                  </span>
                </label>
              </div>
              <div className="design-fonts-upload__actions">
                <button type="submit" className="lg-btn lg-btn--primary" disabled={saving}>
                  {saving ? 'Загрузка…' : 'Загрузить в библиотеку'}
                </button>
                <button
                  type="button"
                  className="lg-btn"
                  onClick={() => {
                    setUploadOpen(false);
                    setForm({ family_name: '', label: '', file: null });
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
              ? 'Пока нет шрифтов. Нажмите «Добавить шрифт» и загрузите первый файл.'
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
