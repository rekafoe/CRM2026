import React, { useCallback, useEffect, useState } from 'react';
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
import '../../styles/admin-page-layout.css';
import '../../components/admin/ProductManagement.css';
import './DesignFontsPage.css';

const FONT_PREVIEW = 'Съешь ещё этих мягких французских булок';

export const DesignFontsPage: React.FC = () => {
  const navigate = useNavigate();
  const [fonts, setFonts] = useState<DesignFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    family_name: '',
    label: '',
    file: null as File | null,
  });
  const [replaceId, setReplaceId] = useState<number | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

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
      await loadFonts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить файл');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!window.confirm('Отключить шрифт в библиотеке?')) return;
    try {
      await deactivateDesignFont(id);
      await loadFonts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отключить шрифт');
    }
  };

  return (
    <AdminPageLayout
      title="Библиотека шрифтов"
      description="Шрифты для импорта шаблонов и production PDF. Сайт загружает их через public API."
      onBack={() => navigate('/adminpanel/design-templates')}
    >
      {error && <Alert type="error">{error}</Alert>}

      <section className="design-fonts-upload">
        <h2>Добавить шрифт</h2>
        <form className="design-fonts-upload__form" onSubmit={(e) => void handleCreate(e)}>
          <label>
            <span>family_name (как в макете)</span>
            <input
              className="form-input"
              value={form.family_name}
              onChange={(e) => setForm((p) => ({ ...p, family_name: e.target.value }))}
              placeholder="Happy Time"
            />
          </label>
          <label>
            <span>Подпись в админке</span>
            <input
              className="form-input"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="Happy Time"
            />
          </label>
          <label>
            <span>Файл (.woff2 предпочтительно)</span>
            <input
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              onChange={(e) => setForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
            />
          </label>
          <button type="submit" className="lg-btn lg-btn--primary" disabled={saving}>
            {saving ? 'Сохранение…' : 'Загрузить'}
          </button>
        </form>
      </section>

      <section className="design-fonts-list">
        <h2>Загруженные шрифты</h2>
        {loading ? <p>Загрузка…</p> : (
          <ul className="design-fonts-list__items">
            {fonts.map((font) => (
              <li key={font.id} className={`design-fonts-list__item${font.is_active ? '' : ' design-fonts-list__item--inactive'}`}>
                <div className="design-fonts-list__meta">
                  <strong>{font.label}</strong>
                  <span className="design-fonts-list__family">{font.family_name}</span>
                  <span className="design-fonts-list__format">{font.format}</span>
                  {!font.is_active && <span className="design-fonts-list__badge">отключён</span>}
                </div>
                <p
                  className="design-fonts-list__preview"
                  style={{ fontFamily: `"${font.family_name}", sans-serif` }}
                >
                  {FONT_PREVIEW}
                </p>
                <div className="design-fonts-list__actions">
                  {replaceId === font.id ? (
                    <>
                      <input
                        type="file"
                        accept=".woff2,.woff,.ttf,.otf"
                        onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                      />
                      <button type="button" className="lg-btn lg-btn--primary" onClick={() => void handleReplace(font.id)} disabled={saving}>
                        Сохранить файл
                      </button>
                      <button type="button" className="lg-btn" onClick={() => { setReplaceId(null); setReplaceFile(null); }}>
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="lg-btn" onClick={() => setReplaceId(font.id)}>Заменить файл</button>
                      {font.is_active && (
                        <button type="button" className="lg-btn" onClick={() => void handleDeactivate(font.id)}>Отключить</button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
            {fonts.length === 0 && <li className="design-fonts-list__empty">Пока нет шрифтов в библиотеке.</li>}
          </ul>
        )}
      </section>
    </AdminPageLayout>
  );
};

export default DesignFontsPage;
