import React, { useState, useRef } from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { BG_PATTERNS, svgToDataUrl } from '../bgPatterns';

type Tab = 'color' | 'pattern' | 'custom';

interface BackgroundPanelProps {
  /** Установить сплошной цвет фона */
  onSetBackground: (color: string) => void;
  /** Установить SVG/изображение как фон (data URL или обычный URL) */
  onSetBackgroundImage: (dataUrl: string) => Promise<void>;
  /** Сбросить фон к белому */
  onClearBackground: () => void;
  /** Размеры холста (чтобы паттерны генерировались под них) */
  canvasWidth: number;
  canvasHeight: number;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#ffffff', '#f8f9fa', '#f1f3f5', '#e9ecef',
  '#000000', '#212529', '#343a40', '#495057',
  '#c92a2a', '#e03131', '#f03e3e', '#ff6b6b',
  '#862e9c', '#ae3ec9', '#cc5de8', '#da77f2',
  '#1864ab', '#1971c2', '#1c7ed6', '#74c0fc',
  '#087f5b', '#099268', '#0ca678', '#63e6be',
  '#e67700', '#f08c00', '#f59f00', '#ffd43b',
  '#5c7cfa', '#748ffc', '#91a7ff', '#bac8ff',
];

const PREVIEW_W = 80;
const PREVIEW_H = 52;

export const BackgroundPanel: React.FC<BackgroundPanelProps> = ({
  onSetBackground,
  onSetBackgroundImage,
  onClearBackground,
  canvasWidth,
  canvasHeight,
  onClose,
}) => {
  const [tab, setTab] = useState<Tab>('color');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [patternColor, setPatternColor] = useState<string>('');
  const [patternBg, setPatternBg] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const svgInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const applyPattern = async (patternId: string) => {
    const pat = BG_PATTERNS.find((p) => p.id === patternId);
    if (!pat) return;
    const c = patternColor || pat.defaultColor;
    const b = patternBg || pat.defaultBg;
    const svgStr = pat.svg(canvasWidth || 340, canvasHeight || 220, c, b);
    setApplying(true);
    try {
      await onSetBackgroundImage(svgToDataUrl(svgStr));
    } finally {
      setApplying(false);
    }
  };

  const handleSvgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.endsWith('.svg') && file.type !== 'image/svg+xml') {
      setUploadError('Нужен файл .svg');
      return;
    }
    setUploadError('');
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      void onSetBackgroundImage(svgToDataUrl(text));
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Нужно изображение');
      return;
    }
    setUploadError('');
    const reader = new FileReader();
    reader.onload = () => {
      void onSetBackgroundImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="design-editor-panel-content">
      <div className="design-editor-panel-header">
        <h3 className="design-editor-panel-title">Фон</h3>
        <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
          <AppIcon name="x" size="sm" />
        </button>
      </div>

      {/* Вкладки */}
      <div className="design-editor-bg-tabs">
        {(['color', 'pattern', 'custom'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`design-editor-bg-tab${tab === t ? ' is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'color' ? 'Цвет' : t === 'pattern' ? 'Паттерн' : 'Свой файл'}
          </button>
        ))}
      </div>

      {/* ── Цвет ── */}
      {tab === 'color' && (
        <>
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Произвольный цвет</label>
            <div className="design-editor-color-row">
              <input
                type="color"
                className="design-editor-color-input design-editor-color-input--large"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  onSetBackground(e.target.value);
                }}
              />
              <span className="design-editor-color-value">{customColor}</span>
            </div>
          </div>

          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Готовые цвета</label>
            <div className="design-editor-bg-presets">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="design-editor-bg-preset"
                  style={{ background: c, border: c === '#ffffff' ? '1px solid #d1d5db' : 'none' }}
                  title={c}
                  onClick={() => { setCustomColor(c); onSetBackground(c); }}
                />
              ))}
            </div>
          </div>

          <div className="design-editor-panel-field">
            <button type="button" className="design-editor-transparent-btn" onClick={onClearBackground}>
              <span className="design-editor-transparent-swatch" />
              Сбросить (белый)
            </button>
          </div>
        </>
      )}

      {/* ── Паттерны ── */}
      {tab === 'pattern' && (
        <>
          <div className="design-editor-panel-field">
            <div className="design-editor-pattern-colors">
              <div>
                <label className="design-editor-panel-label">Цвет узора</label>
                <input
                  type="color"
                  className="design-editor-color-input"
                  value={patternColor || '#94a3b8'}
                  onChange={(e) => setPatternColor(e.target.value)}
                  title="Цвет элементов паттерна"
                />
              </div>
              <div>
                <label className="design-editor-panel-label">Цвет фона</label>
                <input
                  type="color"
                  className="design-editor-color-input"
                  value={patternBg || '#ffffff'}
                  onChange={(e) => setPatternBg(e.target.value)}
                  title="Цвет фона паттерна"
                />
              </div>
            </div>
            <p className="design-editor-panel-url-hint">
              Настройте цвета выше, затем нажмите на паттерн чтобы применить
            </p>
          </div>

          <div className="design-editor-patterns-grid">
            {BG_PATTERNS.map((pat) => {
              const previewSvg = pat.svg(
                PREVIEW_W,
                PREVIEW_H,
                patternColor || pat.defaultColor,
                patternBg || pat.defaultBg,
              );
              const previewUrl = svgToDataUrl(previewSvg);
              return (
                <button
                  key={pat.id}
                  type="button"
                  className={`design-editor-pattern-btn${applying ? ' is-loading' : ''}`}
                  disabled={applying}
                  onClick={() => void applyPattern(pat.id)}
                  title={pat.label}
                >
                  <img
                    src={previewUrl}
                    alt={pat.label}
                    className="design-editor-pattern-preview"
                    width={PREVIEW_W}
                    height={PREVIEW_H}
                  />
                  <span className="design-editor-pattern-label">{pat.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Свой файл ── */}
      {tab === 'custom' && (
        <div className="design-editor-panel-field">
          <p className="design-editor-panel-url-hint" style={{ marginBottom: 12 }}>
            Загрузите SVG-файл (логотип, декор, текстура) или растровое изображение (PNG/JPG).
            Файл растянется под весь холст.
          </p>

          <div className="design-editor-custom-bg-btns">
            <button
              type="button"
              className="design-editor-custom-bg-btn"
              onClick={() => svgInputRef.current?.click()}
            >
              <AppIcon name="layers" size="sm" />
              <span>Загрузить SVG</span>
            </button>
            <button
              type="button"
              className="design-editor-custom-bg-btn"
              onClick={() => imgInputRef.current?.click()}
            >
              <AppIcon name="image" size="sm" />
              <span>Загрузить PNG / JPG</span>
            </button>
          </div>

          {uploadError && (
            <p className="design-editor-panel-url-hint" style={{ color: '#dc2626', marginTop: 8 }}>
              {uploadError}
            </p>
          )}

          <input
            ref={svgInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            style={{ display: 'none' }}
            onChange={handleSvgUpload}
          />
          <input
            ref={imgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />

          <div className="design-editor-panel-field" style={{ marginTop: 16 }}>
            <button type="button" className="design-editor-transparent-btn" onClick={onClearBackground}>
              <AppIcon name="x" size="xs" />
              Сбросить фон
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
