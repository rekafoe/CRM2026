// Компонент ABC-анализа материалов

import React from 'react';
import { MaterialsAnalyticsData } from '../types';
import type { ABCSummary } from '../types';
import { MoneyAmount } from '../../../components/ui';

interface MaterialsAnalyticsProps {
  data: MaterialsAnalyticsData;
}

export const MaterialsAnalytics: React.FC<MaterialsAnalyticsProps> = ({ data }) => {
  const abcClasses = ['A', 'B', 'C'] as const satisfies ReadonlyArray<keyof ABCSummary>;
  const abcSummary = data.abcSummary ?? { A: { count: 0, total_cost: 0, percentage: 0 }, B: { count: 0, total_cost: 0, percentage: 0 }, C: { count: 0, total_cost: 0, percentage: 0 } };
  const abcAnalysis = data.abcAnalysis ?? [];
  const categoryAnalysis = data.categoryAnalysis ?? [];
  const hasData = (data.totalMaterials ?? 0) > 0;

  if (!hasData) {
    return (
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">📦 ABC-анализ материалов (по стоимости)</h4>
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          Нет движений материалов за выбранный период. Измените период или диапазон дат.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ABC-анализ материалов */}
      <div className="reports-chart" style={{ marginBottom: '20px' }}>
        <h4 className="reports-chart-title">
          📦 ABC-анализ материалов (по стоимости)
        </h4>

        {/* Сводка ABC */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            {Object.entries(abcSummary).map(([className, stats]) => (
              <div key={className} style={{
                padding: '16px',
                backgroundColor: className === 'A' ? 'var(--accent-light)' :
                               className === 'B' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                  {Number(stats?.percentage ?? 0).toFixed(1)}%
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Класс {className}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {stats?.count ?? 0} материалов<br/>
                  <MoneyAmount value={Number(stats?.total_cost ?? 0)} decimals={0} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Топ материалов по классам */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {abcClasses.map((className) => (
            <div key={className} style={{
              padding: '16px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <h5 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                Класс {className} - {(abcSummary[className as keyof ABCSummary]?.percentage ?? 0) >= 80 ? 'Высокозначимые' :
                                      (abcSummary[className as keyof ABCSummary]?.percentage ?? 0) >= 15 ? 'Среднеззначимые' : 'Низкозначимые'} материалы
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {abcAnalysis
                  .filter((m) => m.abc_class === className)
                  .slice(0, 3)
                  .map((material) => (
                    <div key={material.material_id} style={{
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: '4px',
                      border: '1px solid var(--border-light)',
                      fontSize: '13px'
                    }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {material.material_name}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                        <MoneyAmount value={Number(material.total_cost ?? 0)} decimals={0} /> • {Number(material.total_consumed ?? 0).toFixed(1)} ед.
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Анализ по категориям материалов */}
      <div className="reports-metrics" style={{ marginBottom: '20px' }}>
        <h4 className="reports-metrics-title">
          📂 Анализ по категориям материалов
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {categoryAnalysis.slice(0, 6).map((category, idx) => (
            <div key={category.category_name ?? `cat-${idx}`} style={{
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                {category.materials_count}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {category.category_name ?? 'Без категории'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                <MoneyAmount value={Number(category.total_cost ?? 0)} decimals={0} /><br/>
                {Number(category.total_consumed ?? 0).toFixed(0)} ед.
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
