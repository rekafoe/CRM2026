// Компонент ABC-анализа материалов

import React from 'react';
import { MaterialsAnalyticsData } from '../types';

interface MaterialsAnalyticsProps {
  data: MaterialsAnalyticsData;
}

export const MaterialsAnalytics: React.FC<MaterialsAnalyticsProps> = ({ data }) => {
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
            {Object.entries(data.abcSummary).map(([className, stats]) => (
              <div key={className} style={{
                padding: '16px',
                backgroundColor: className === 'A' ? 'var(--accent-light)' :
                               className === 'B' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                  {stats.percentage.toFixed(1)}%
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Класс {className}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {stats.count} материалов<br/>
                  {stats.total_cost.toLocaleString('ru-RU')} BYN
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Топ материалов по классам */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {['A', 'B', 'C'].map(className => (
            <div key={className} style={{
              padding: '16px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <h5 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                Класс {className} - {data.abcSummary[className].percentage >= 80 ? 'Высокозначимые' :
                                      data.abcSummary[className].percentage >= 15 ? 'Среднеззначимые' : 'Низкозначимые'} материалы
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.abcAnalysis
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
                        {material.total_cost.toLocaleString('ru-RU')} BYN • {material.total_consumed.toFixed(1)} ед.
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
          {data.categoryAnalysis.slice(0, 6).map((category) => (
            <div key={category.category_name} style={{
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
                {category.category_name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {category.total_cost.toLocaleString('ru-RU')} BYN<br/>
                {category.total_consumed.toFixed(0)} ед.
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
