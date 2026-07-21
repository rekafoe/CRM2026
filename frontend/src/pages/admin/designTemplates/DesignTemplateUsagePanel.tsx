import React, { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { MoneyAmount } from '../../../components/ui';
import {
  getDesignTemplateUsageAnalytics,
  type DesignTemplateUsageAnalytics,
  type DesignTemplateUsageRow,
} from '../../../api';
import { API_BASE_URL } from '../../../config/constants';
import { openSiteSandboxForDesignTemplate } from '../../../features/designTemplates/openSiteSandboxForDesignTemplate';
import { resolveTemplatePreviewUrl } from './designTemplateCatalogUtils';

type PeriodKey = '30' | '90' | '365' | 'all';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: '30', label: '30 дней' },
  { key: '90', label: '90 дней' },
  { key: '365', label: 'Год' },
  { key: 'all', label: 'Всё время' },
];

function formatPeriodLabel(data: DesignTemplateUsageAnalytics): string {
  if (data.period.allTime) return 'за всё время';
  if (data.period.days != null) return `за ${data.period.days} дн.`;
  return 'за период';
}

function formatLastUsed(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

type UsageRowProps = {
  row: DesignTemplateUsageRow;
  rank: number;
  maxLines: number;
  onOpen: (id: number) => void;
};

const UsageRow: React.FC<UsageRowProps> = ({ row, rank, maxLines, onOpen }) => {
  const barWidth = maxLines > 0 ? Math.max(4, Math.round((row.line_count / maxLines) * 100)) : 0;
  const previewSrc = resolveTemplatePreviewUrl(row.preview_url, API_BASE_URL);

  return (
    <li className="design-usage-row">
      <span className="design-usage-row__rank">{rank}</span>
      <div className="design-usage-row__thumb">
        {previewSrc ? (
          <img src={previewSrc} alt="" />
        ) : (
          <AppIcon name="image" size="sm" />
        )}
      </div>
      <div className="design-usage-row__main">
        <button type="button" className="design-usage-row__name" onClick={() => onOpen(row.design_template_id)}>
          <span className="design-usage-row__id">#{row.design_template_id}</span> {row.name}
        </button>
        <div className="design-usage-row__meta">
          {row.category && <span>{row.category}</span>}
          <span>{row.order_count} заказов</span>
          <span>{row.total_quantity} шт.</span>
          {row.draft_count > 0 && <span>{row.draft_count} черновиков</span>}
          <span>последний: {formatLastUsed(row.last_used_at)}</span>
        </div>
        <div
          className="design-usage-row__bar-track"
          aria-hidden
          style={{ ['--usage-bar' as string]: `${barWidth}%` }}
        >
          <div className="design-usage-row__bar-fill" />
        </div>
      </div>
      <div className="design-usage-row__stats">
        <strong>{row.line_count}</strong>
        <span className="design-usage-row__share">{row.share_percent}%</span>
        <span className="design-usage-row__revenue">
          <MoneyAmount value={row.total_revenue} decimals={0} />
        </span>
      </div>
    </li>
  );
};

export const DesignTemplateUsagePanel: React.FC = () => {
  const [period, setPeriod] = useState<PeriodKey>('90');
  const [data, setData] = useState<DesignTemplateUsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnused, setShowUnused] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const openOnSite = useCallback((id: number) => {
    setOpenError(null);
    void openSiteSandboxForDesignTemplate(id).catch((err) => {
      setOpenError(err instanceof Error ? err.message : 'Не удалось открыть редактор на сайте');
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDesignTemplateUsageAnalytics({ period, limit: 50 });
      setData(res.data);
    } catch (err: unknown) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxLines = data?.by_template[0]?.line_count ?? 0;

  return (
    <div className="design-usage-panel">
      <div className="design-templates-toolbar-card">
        <div className="design-templates-toolbar design-usage-panel__toolbar">
          <span className="design-usage-panel__toolbar-label">Период:</span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`lg-btn${period === opt.key ? ' lg-btn--primary' : ''}`}
              onClick={() => setPeriod(opt.key)}
            >
              {opt.label}
            </button>
          ))}
          <button type="button" className="lg-btn" onClick={() => void load()} disabled={loading}>
            <AppIcon name="refresh" size="xs" /> Обновить
          </button>
        </div>
      </div>

      <p className="design-usage-panel__hint">
        Считаются позиции заказов с <code>designTemplateId</code> в params (без отменённых заказов).
        Черновики редактора — отдельная метрика «черновиков» (интерес без оформления).
      </p>

      {error && <p className="design-usage-panel__error">{error}</p>}
      {openError && <p className="design-usage-panel__error">{openError}</p>}

      {loading && !data && (
        <div className="design-templates-loading">Загрузка аналитики…</div>
      )}

      {data && (
        <>
          <div className="design-usage-summary">
            <div className="design-usage-summary__card">
              <span className="design-usage-summary__value">{data.summary.total_lines_with_template}</span>
              <span className="design-usage-summary__label">позиций с шаблоном {formatPeriodLabel(data)}</span>
            </div>
            <div className="design-usage-summary__card">
              <span className="design-usage-summary__value">{data.summary.distinct_templates_used}</span>
              <span className="design-usage-summary__label">разных макетов в заказах</span>
            </div>
            <div className="design-usage-summary__card">
              <span className="design-usage-summary__value">{data.summary.unused_in_period}</span>
              <span className="design-usage-summary__label">без заказов за период</span>
            </div>
            <div className="design-usage-summary__card design-usage-summary__card--muted">
              <span className="design-usage-summary__value">{data.summary.never_used_all_time}</span>
              <span className="design-usage-summary__label">никогда не попадали в заказ</span>
            </div>
          </div>

          <section className="design-usage-section">
            <h3 className="design-usage-section__title">
              Чаще всего в заказах
            </h3>
            {data.by_template.length === 0 ? (
              <p className="design-usage-empty">За выбранный период нет позиций с привязкой к шаблону.</p>
            ) : (
              <ol className="design-usage-list">
                {data.by_template.map((row, index) => (
                  <UsageRow
                    key={row.design_template_id}
                    row={row}
                    rank={index + 1}
                    maxLines={maxLines}
                    onOpen={openOnSite}
                  />
                ))}
              </ol>
            )}
          </section>

          {data.by_category.length > 0 && (
            <section className="design-usage-section">
              <h3 className="design-usage-section__title">По категориям</h3>
              <ul className="design-usage-category-list">
                {data.by_category.map((cat) => (
                  <li key={`${cat.category_id ?? 'none'}-${cat.category_name}`} className="design-usage-category-item">
                    <span className="design-usage-category-item__name">{cat.category_name}</span>
                    <span className="design-usage-category-item__count">{cat.line_count} поз.</span>
                    <span className="design-usage-category-item__share">{cat.share_percent}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.unused_in_period.length > 0 && (
            <section className="design-usage-section">
              <button
                type="button"
                className="design-usage-section__toggle"
                onClick={() => setShowUnused((v) => !v)}
                aria-expanded={showUnused}
              >
                <span className="design-templates-help__chevron" aria-hidden>{showUnused ? '▾' : '▸'}</span>
                Реже / без заказов за период ({data.unused_in_period.length})
              </button>
              {showUnused && (
                <ul className="design-usage-unused-list">
                  {data.unused_in_period.map((t) => (
                    <li key={t.id} className="design-usage-unused-item">
                      <button
                        type="button"
                        className="design-usage-unused-item__name"
                        onClick={() => openOnSite(t.id)}
                      >
                        #{t.id} {t.name}
                      </button>
                      <span className="design-usage-unused-item__meta">
                        {t.category ?? 'Без категории'}
                        {t.is_active !== 1 && ' · неактивен'}
                        {t.ever_used ? ' · был в заказах раньше' : ' · ни разу в заказе'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
