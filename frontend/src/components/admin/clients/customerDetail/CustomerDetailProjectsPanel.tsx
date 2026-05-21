import React, { useCallback, useEffect, useState } from 'react';
import { getCustomerProjects } from '../../../../api';
import './CustomerDetailProjectsPanel.css';

type CustomerProject = {
  id: number;
  title: string | null;
  source_order_id: number | null;
  source_order_item_id: number | null;
  editor_mode: string | null;
  editable: number;
  expires_at: string;
  designState: unknown;
};

interface CustomerDetailProjectsPanelProps {
  customerId: number;
}

export const CustomerDetailProjectsPanel: React.FC<CustomerDetailProjectsPanelProps> = ({ customerId }) => {
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getCustomerProjects(customerId);
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить проекты');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="customer-detail-projects customer-detail-projects--loading">Загрузка макетов…</div>;
  if (error) return <div className="customer-detail-projects customer-detail-projects--error">{error}</div>;
  if (projects.length === 0) {
    return <div className="customer-detail-projects customer-detail-projects--empty">Сохранённых макетов пока нет.</div>;
  }

  return (
    <div className="customer-detail-projects">
      <p className="customer-detail-projects__hint">
        Архив макетов клиента (~1 год). Редактирование отправленного в печать заказа недоступно — только дубль через сайт.
      </p>
      <ul className="customer-detail-projects__list">
        {projects.map((project) => {
          const pageCount = project.designState && typeof project.designState === 'object'
            && Array.isArray((project.designState as { pages?: unknown }).pages)
            ? (project.designState as { pages: unknown[] }).pages.length
            : 0;
          return (
            <li key={project.id} className="customer-detail-projects__card">
              <strong>{project.title ?? `Проект #${project.id}`}</strong>
              <span>{pageCount > 0 ? `${pageCount} стр.` : '—'} · {project.editor_mode ?? 'single'}</span>
              {project.source_order_id != null && (
                <span>Заказ #{project.source_order_id}{project.source_order_item_id != null ? ` / поз. ${project.source_order_item_id}` : ''}</span>
              )}
              <span className="customer-detail-projects__meta">
                {Number(project.editable) === 0 ? 'Только просмотр' : 'Можно клонировать'}
                {' · до '}{new Date(project.expires_at).toLocaleDateString('ru-RU')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
