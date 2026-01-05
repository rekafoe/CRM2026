import React from 'react';
import { Material } from '../../types/shared';
import { getWarehouseSummary, getLowStockItems, getSupplierSummary, getMaterialMovements, generatePdfReport, getABCAnalysis, getTurnoverAnalysis, getCostAnalysis, getSupplierAnalytics, getForecastingData } from '../../api';

interface WarehouseReportsProps {
  materials: Material[];
  stats: {
    totalMaterials: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
    categories: number;
    suppliers: number;
    alerts: number;
  };
}

type ReportTab = 'summary' | 'low-stock' | 'movements' | 'suppliers' | 'abc-analysis' | 'turnover' | 'cost-analysis' | 'supplier-analytics' | 'forecasting';

export const WarehouseReports: React.FC<WarehouseReportsProps> = ({ materials, stats }) => {
  const [active, setActive] = React.useState<ReportTab>('summary');
  const [category, setCategory] = React.useState<string>('');
  const [supplier, setSupplier] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  
  // Данные с бэкенда
  const [backendSummary, setBackendSummary] = React.useState<any>(null);
  const [lowStockData, setLowStockData] = React.useState<any[]>([]);
  const [supplierData, setSupplierData] = React.useState<any[]>([]);
  const [movementsData, setMovementsData] = React.useState<any[]>([]);
  
  // Расширенная аналитика
  const [abcData, setAbcData] = React.useState<any[]>([]);
  const [turnoverData, setTurnoverData] = React.useState<any[]>([]);
  const [costData, setCostData] = React.useState<any[]>([]);
  const [supplierAnalyticsData, setSupplierAnalyticsData] = React.useState<any[]>([]);
  const [forecastingData, setForecastingData] = React.useState<any[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = React.useState<number | undefined>(undefined);

  const categories = React.useMemo(() => {
    return Array.from(new Set((materials || []).map(m => (m as any).category_name).filter(Boolean))) as string[];
  }, [materials]);

  const suppliers = React.useMemo(() => {
    return Array.from(new Set((materials || []).map(m => (m as any).supplier_name).filter(Boolean))) as string[];
  }, [materials]);

  // Загрузка данных с бэкенда
  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const filters: any = {
        categoryId: category ? categories.findIndex(c => c === category) + 1 : undefined,
        supplierId: supplier ? suppliers.findIndex(s => s === supplier) + 1 : undefined
      };
      if (selectedMaterialId) filters.materialId = selectedMaterialId;
      
      const promises = [
        getWarehouseSummary(filters),
        getLowStockItems(filters),
        getSupplierSummary(filters),
        getMaterialMovements(filters)
      ];
      
      // Загружаем расширенную аналитику только для соответствующих вкладок
      if (['abc-analysis', 'turnover', 'cost-analysis', 'supplier-analytics', 'forecasting'].includes(active)) {
        promises.push(
          getABCAnalysis(filters),
          getTurnoverAnalysis(filters),
          getCostAnalysis(filters),
          getSupplierAnalytics(filters),
          getForecastingData(filters)
        );
      }
      
      const results = await Promise.all(promises);
      
      setBackendSummary(results[0]?.data?.data ?? null);
      setLowStockData(Array.isArray(results[1]?.data?.data) ? results[1].data.data : []);
      setSupplierData(Array.isArray(results[2]?.data?.data) ? results[2].data.data : []);
      setMovementsData(Array.isArray(results[3]?.data?.data) ? results[3].data.data : []);
      
      if (results.length > 4) {
        setAbcData(Array.isArray(results[4]?.data?.data) ? results[4].data.data : []);
        setTurnoverData(Array.isArray(results[5]?.data?.data) ? results[5].data.data : []);
        setCostData(Array.isArray(results[6]?.data?.data) ? results[6].data.data : []);
        setSupplierAnalyticsData(Array.isArray(results[7]?.data?.data) ? results[7].data.data : []);
        setForecastingData(Array.isArray(results[8]?.data?.data) ? results[8].data.data : []);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
      console.error('Error loading warehouse reports:', err);
    } finally {
      setLoading(false);
    }
  }, [category, supplier, categories, suppliers, selectedMaterialId, active]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const toCsv = (rows: any[], headers: string[], selector: (row: any) => any[]) => {
    const escape = (val: any) => {
      const s = val === undefined || val === null ? '' : String(val)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csvRows = [headers.join(',')]
    for (const r of rows) csvRows.push(selector(r).map(escape).join(','))
    return csvRows.join('\n')
  }

  const downloadCsv = (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = () => {
    try {
      if (active === 'low-stock') {
        const headers = ['ID','Материал','Категория','Поставщик','Кол-во','Ед.','Мин.','Стоимость']
        const csv = toCsv(lowStockData, headers, (i) => [i.id, i.name, i.category_name || '', i.supplier_name || '', i.quantity || 0, i.unit || '', i.min_quantity || 0, Math.round(i.total_value || 0)])
        downloadCsv('low-stock.csv', csv)
      } else if (active === 'movements') {
        const headers = ['Дата','Материал','Тип','Кол-во','Ед.','Причина','Пользователь']
        const csv = toCsv(movementsData, headers, (m) => [new Date(m.created_at).toLocaleString(), m.material_name, m.movement_type, m.quantity, m.unit, m.reason || '', m.created_by])
        downloadCsv('movements.csv', csv)
      } else if (active === 'suppliers') {
        const headers = ['Поставщик','Позиций','Суммарный остаток','Общая стоимость','Низкий остаток','Нет в наличии']
        const csv = toCsv(supplierData, headers, (s) => [s.supplier_name, s.materials_count, s.total_quantity, Math.round(s.total_value), s.low_stock_count, s.out_of_stock_count])
        downloadCsv('suppliers.csv', csv)
      } else if (active === 'summary') {
        const s = backendSummary || stats
        const rows = [
          { k: 'Всего позиций', v: s.totalMaterials },
          { k: 'В наличии', v: s.inStock },
          { k: 'Низкий остаток', v: s.lowStock },
          { k: 'Нет в наличии', v: s.outOfStock },
          { k: 'Общая стоимость (BYN)', v: Math.round(s.totalValue) }
        ]
        const csv = toCsv(rows, ['Показатель','Значение'], (r) => [r.k, r.v])
        downloadCsv('summary.csv', csv)
      }
    } catch (e) {
      console.error('Export failed', e)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportXlsx = async () => {
    try {
      // @ts-ignore - dynamic ESM import from CDN
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs')
      const aoa: any[] = []
      if (active === 'low-stock') {
        aoa.push(['ID','Материал','Категория','Поставщик','Кол-во','Ед.','Мин.','Стоимость (BYN)'])
        for (const i of lowStockData) aoa.push([i.id, i.name, i.category_name || '', i.supplier_name || '', i.quantity || 0, i.unit || '', i.min_quantity || 0, Math.round(i.total_value || 0)])
      } else if (active === 'movements') {
        aoa.push(['Дата','Материал','Тип','Кол-во','Ед.','Причина','Пользователь'])
        for (const m of movementsData) aoa.push([new Date(m.created_at).toLocaleString(), m.material_name, m.movement_type, m.quantity, m.unit, m.reason || '', m.created_by])
      } else if (active === 'suppliers') {
        aoa.push(['Поставщик','Позиций','Суммарный остаток','Общая стоимость (BYN)','Низкий остаток','Нет в наличии'])
        for (const s of supplierData) aoa.push([s.supplier_name, s.materials_count, s.total_quantity, Math.round(s.total_value), s.low_stock_count, s.out_of_stock_count])
      } else {
        const s = backendSummary || stats
        aoa.push(['Показатель','Значение'])
        aoa.push(['Всего позиций', s.totalMaterials])
        aoa.push(['В наличии', s.inStock])
        aoa.push(['Низкий остаток', s.lowStock])
        aoa.push(['Нет в наличии', s.outOfStock])
        aoa.push(['Общая стоимость (BYN)', Math.round(s.totalValue)])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, active)
      XLSX.writeFile(wb, `${active}.xlsx`)
    } catch (e) {
      console.error('XLSX export failed', e)
    }
  }

  const handleExportPdf = async () => {
    try {
      setLoading(true)
      const reportType = active === 'summary' ? 'summary' : 
                        active === 'low-stock' ? 'low-stock' : 
                        active === 'movements' ? 'movements' : 
                        active === 'suppliers' ? 'suppliers' :
                        active === 'abc-analysis' ? 'abc-analysis' :
                        active === 'turnover' ? 'turnover' :
                        active === 'cost-analysis' ? 'cost-analysis' :
                        active === 'supplier-analytics' ? 'supplier-analytics' :
                        active === 'forecasting' ? 'forecasting' : 'summary'
      
      console.log('🔄 Generating PDF for report type:', reportType)
      const response = await generatePdfReport(reportType)
      
      // Создаем blob и скачиваем файл
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `warehouse-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
    } catch (e) {
      console.error('PDF export failed', e)
      alert('Ошибка генерации PDF отчета')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="warehouse-reports">
      <div className="tabs-header" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`tab-btn ${active === 'summary' ? 'active' : ''}`} onClick={() => setActive('summary')}>Итоги</button>
        <button className={`tab-btn ${active === 'low-stock' ? 'active' : ''}`} onClick={() => setActive('low-stock')}>Дефицит</button>
        <button className={`tab-btn ${active === 'movements' ? 'active' : ''}`} onClick={() => setActive('movements')}>Движения</button>
        <button className={`tab-btn ${active === 'suppliers' ? 'active' : ''}`} onClick={() => setActive('suppliers')}>Поставщики</button>
        <button className={`tab-btn ${active === 'abc-analysis' ? 'active' : ''}`} onClick={() => setActive('abc-analysis')}>ABC-анализ</button>
        <button className={`tab-btn ${active === 'turnover' ? 'active' : ''}`} onClick={() => setActive('turnover')}>Оборачиваемость</button>
        <button className={`tab-btn ${active === 'cost-analysis' ? 'active' : ''}`} onClick={() => setActive('cost-analysis')}>Стоимость</button>
        <button className={`tab-btn ${active === 'supplier-analytics' ? 'active' : ''}`} onClick={() => setActive('supplier-analytics')}>Аналитика поставщиков</button>
        <button className={`tab-btn ${active === 'forecasting' ? 'active' : ''}`} onClick={() => setActive('forecasting')}>Прогнозирование</button>
      </div>

      <div className="filters" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Все категории</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="">Все поставщики</option>
          {suppliers.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExport}>Экспорт CSV</button>
          <button className="btn btn-secondary" onClick={handleExportXlsx}>Экспорт XLSX</button>
          <button className="btn btn-secondary" onClick={handleExportPdf}>Экспорт PDF</button>
          <button className="btn btn-secondary" onClick={handlePrint}>Печать</button>
        </div>
      </div>

      {loading && <div style={{ padding: 12, textAlign: 'center' }}>Загрузка данных...</div>}
      {error && <div style={{ padding: 12, color: '#e74c3c', background: '#ffeaea', borderRadius: 4, marginBottom: 12 }}>{error}</div>}
      
      {active === 'summary' && (
        <div className="summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
          <div className="card"><div className="card-body"><div>Всего позиций</div><strong>{backendSummary?.totalMaterials || stats.totalMaterials}</strong></div></div>
          <div className="card"><div className="card-body"><div>В наличии</div><strong>{backendSummary?.inStock || stats.inStock}</strong></div></div>
          <div className="card"><div className="card-body"><div>Низкий остаток</div><strong>{backendSummary?.lowStock || stats.lowStock}</strong></div></div>
          <div className="card"><div className="card-body"><div>Нет в наличии</div><strong>{backendSummary?.outOfStock || stats.outOfStock}</strong></div></div>
          <div className="card"><div className="card-body"><div>Общая стоимость</div><strong>{Math.round(backendSummary?.totalValue || stats.totalValue)} BYN</strong></div></div>
        </div>
      )}

      {active === 'low-stock' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Материал</th>
                <th>Категория</th>
                <th>Поставщик</th>
                <th>Кол-во</th>
                <th>Мин.</th>
                <th>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {lowStockData.length === 0 ? (
                <tr><td colSpan={7}>Нет дефицитных материалов</td></tr>
              ) : lowStockData.map(item => (
                <tr key={item.id} onClick={() => { setSelectedMaterialId(item.id); setActive('movements'); }} style={{ cursor: 'pointer' }}>
                  <td>{item.id}</td>
                  <td style={{ textAlign: 'left' }}>{item.name}</td>
                  <td style={{ textAlign: 'left' }}>{item.category_name || '—'}</td>
                  <td style={{ textAlign: 'left' }}>{item.supplier_name || '—'}</td>
                  <td>{item.quantity || 0} {item.unit}</td>
                  <td>{item.min_quantity || 10}</td>
                  <td>{Math.round(item.total_value || 0)} BYN</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active === 'movements' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Материал</th>
                <th>Тип</th>
                <th>Кол-во</th>
                <th>Причина</th>
                <th>Пользователь</th>
              </tr>
            </thead>
            <tbody>
              {movementsData.length === 0 ? (
                <tr><td colSpan={6}>Нет движений материалов</td></tr>
              ) : movementsData.map(movement => (
                <tr key={movement.id}>
                  <td>{new Date(movement.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'left' }}>{movement.material_name}</td>
                  <td>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      background: movement.movement_type === 'in' ? '#e8f5e8' : 
                                 movement.movement_type === 'out' ? '#ffeaea' : '#fff3cd',
                      color: movement.movement_type === 'in' ? '#2d5a2d' : 
                             movement.movement_type === 'out' ? '#8b0000' : '#856404'
                    }}>
                      {movement.movement_type === 'in' ? 'Приход' : 
                       movement.movement_type === 'out' ? 'Расход' : 'Корректировка'}
                    </span>
                  </td>
                  <td>{movement.quantity} {movement.unit}</td>
                  <td style={{ textAlign: 'left' }}>{movement.reason || '—'}</td>
                  <td>{movement.created_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active === 'suppliers' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Поставщик</th>
                <th>Позиций</th>
                <th>Суммарный остаток</th>
                <th>Общая стоимость</th>
                <th>Низкий остаток</th>
                <th>Нет в наличии</th>
              </tr>
            </thead>
            <tbody>
              {supplierData.length === 0 ? (
                <tr><td colSpan={6}>Данные отсутствуют</td></tr>
              ) : supplierData.map(row => (
                <tr key={row.supplier_name} onClick={() => { setSupplier(row.supplier_name); setActive('low-stock'); }} style={{ cursor: 'pointer' }}>
                  <td style={{ textAlign: 'left' }}>{row.supplier_name}</td>
                  <td>{row.materials_count}</td>
                  <td>{row.total_quantity}</td>
                  <td>{Math.round(row.total_value)} BYN</td>
                  <td style={{ color: row.low_stock_count > 0 ? '#e74c3c' : '#27ae60' }}>
                    {row.low_stock_count}
                  </td>
                  <td style={{ color: row.out_of_stock_count > 0 ? '#e74c3c' : '#27ae60' }}>
                    {row.out_of_stock_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ABC-анализ */}
      {active === 'abc-analysis' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Категория</th>
                <th>Стоимость (BYN)</th>
                <th>% от общей стоимости</th>
                <th>Кумулятивный %</th>
                <th>ABC класс</th>
                <th>Оборачиваемость</th>
                <th>Рекомендации</th>
              </tr>
            </thead>
            <tbody>
              {abcData.length === 0 ? (
                <tr><td colSpan={8}>Нет данных для ABC-анализа</td></tr>
              ) : abcData.map(item => (
                <tr key={item.material_id}>
                  <td style={{ textAlign: 'left' }}>{item.material_name}</td>
                  <td style={{ textAlign: 'left' }}>{item.category_name}</td>
                  <td>{Math.round(item.total_value)}</td>
                  <td>{item.percentage.toFixed(1)}%</td>
                  <td>{((item.cumulative_value / abcData[abcData.length - 1]?.cumulative_value) * 100).toFixed(1)}%</td>
                  <td>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: item.abc_class === 'A' ? '#ff6b6b' : 
                                 item.abc_class === 'B' ? '#ffd93d' : '#6bcf7f',
                      color: item.abc_class === 'A' ? 'white' : 'black'
                    }}>
                      {item.abc_class}
                    </span>
                  </td>
                  <td>{item.turnover_rate.toFixed(1)}</td>
                  <td style={{ textAlign: 'left', fontSize: '12px' }}>{item.recommendations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Анализ оборачиваемости */}
      {active === 'turnover' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Категория</th>
                <th>Текущий запас</th>
                <th>Среднемесячное потребление</th>
                <th>Оборачиваемость</th>
                <th>Дней запаса</th>
                <th>Точка заказа</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {turnoverData.length === 0 ? (
                <tr><td colSpan={8}>Нет данных для анализа оборачиваемости</td></tr>
              ) : turnoverData.map(item => (
                <tr key={item.material_id}>
                  <td style={{ textAlign: 'left' }}>{item.material_name}</td>
                  <td style={{ textAlign: 'left' }}>{item.category_name}</td>
                  <td>{item.current_stock}</td>
                  <td>{item.avg_monthly_consumption.toFixed(1)}</td>
                  <td>{item.turnover_rate.toFixed(2)}</td>
                  <td>{item.days_of_supply.toFixed(0)}</td>
                  <td>{item.reorder_point.toFixed(0)}</td>
                  <td>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      background: item.status === 'critical' ? '#ff6b6b' : 
                                 item.status === 'understock' ? '#ffd93d' : 
                                 item.status === 'overstock' ? '#ff9f43' : '#6bcf7f',
                      color: item.status === 'critical' ? 'white' : 'black'
                    }}>
                      {item.status === 'critical' ? 'Критический' :
                       item.status === 'understock' ? 'Недостаток' :
                       item.status === 'overstock' ? 'Избыток' : 'Оптимальный'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Анализ стоимости */}
      {active === 'cost-analysis' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Категория</th>
                <th>Количество материалов</th>
                <th>Общая стоимость (BYN)</th>
                <th>Средняя цена за единицу</th>
                <th>Тренд цен</th>
                <th>Волатильность (%)</th>
                <th>ROI (%)</th>
                <th>Маржа (мин/сред/макс)</th>
              </tr>
            </thead>
            <tbody>
              {costData.length === 0 ? (
                <tr><td colSpan={8}>Нет данных для анализа стоимости</td></tr>
              ) : costData.map(item => (
                <tr key={item.category_id}>
                  <td style={{ textAlign: 'left' }}>{item.category_name}</td>
                  <td>{item.total_materials}</td>
                  <td>{Math.round(item.total_value)}</td>
                  <td>{item.avg_cost_per_unit.toFixed(2)}</td>
                  <td>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      background: item.cost_trend === 'increasing' ? '#ff6b6b' : 
                                 item.cost_trend === 'decreasing' ? '#6bcf7f' : '#ffd93d',
                      color: item.cost_trend === 'increasing' ? 'white' : 'black'
                    }}>
                      {item.cost_trend === 'increasing' ? 'Рост' :
                       item.cost_trend === 'decreasing' ? 'Снижение' : 'Стабильно'}
                    </span>
                  </td>
                  <td>{item.price_volatility.toFixed(1)}%</td>
                  <td>{item.roi_percentage.toFixed(1)}%</td>
                  <td style={{ fontSize: '12px' }}>
                    {item.margin_analysis.min_margin.toFixed(1)}% / 
                    {item.margin_analysis.avg_margin.toFixed(1)}% / 
                    {item.margin_analysis.max_margin.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Аналитика поставщиков */}
      {active === 'supplier-analytics' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Поставщик</th>
                <th>Материалов</th>
                <th>Общая стоимость (BYN)</th>
                <th>Средняя цена</th>
                <th>Тренд цен</th>
                <th>Надежность</th>
                <th>Доставка</th>
                <th>Качество</th>
                <th>Эффективность</th>
                <th>Рекомендации</th>
              </tr>
            </thead>
            <tbody>
              {supplierAnalyticsData.length === 0 ? (
                <tr><td colSpan={10}>Нет данных для аналитики поставщиков</td></tr>
              ) : supplierAnalyticsData.map(item => (
                <tr key={item.supplier_id}>
                  <td style={{ textAlign: 'left' }}>{item.supplier_name}</td>
                  <td>{item.total_materials}</td>
                  <td>{Math.round(item.total_value)}</td>
                  <td>{item.avg_price.toFixed(2)}</td>
                  <td>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      background: item.price_trend === 'increasing' ? '#ff6b6b' : 
                                 item.price_trend === 'decreasing' ? '#6bcf7f' : '#ffd93d',
                      color: item.price_trend === 'increasing' ? 'white' : 'black'
                    }}>
                      {item.price_trend === 'increasing' ? 'Рост' :
                       item.price_trend === 'decreasing' ? 'Снижение' : 'Стабильно'}
                    </span>
                  </td>
                  <td>{item.reliability_score.toFixed(0)}%</td>
                  <td>{item.delivery_performance.toFixed(0)}%</td>
                  <td>{item.quality_rating.toFixed(0)}%</td>
                  <td>{item.cost_effectiveness.toFixed(0)}%</td>
                  <td style={{ textAlign: 'left', fontSize: '12px' }}>
                    {item.recommendations.length > 0 ? item.recommendations.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Прогнозирование */}
      {active === 'forecasting' && (
        <div className="materials-table-wrapper" style={{ marginTop: 8 }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Текущий запас</th>
                <th>Сезонный фактор</th>
                <th>Тренд</th>
                <th>Рекомендуемый заказ</th>
                <th>Дата заказа</th>
                <th>Прогноз на 3 месяца</th>
              </tr>
            </thead>
            <tbody>
              {forecastingData.length === 0 ? (
                <tr><td colSpan={7}>Нет данных для прогнозирования</td></tr>
              ) : forecastingData.map(item => (
                <tr key={item.material_id}>
                  <td style={{ textAlign: 'left' }}>{item.material_name}</td>
                  <td>{item.historical_consumption[item.historical_consumption.length - 1]?.quantity || 0}</td>
                  <td>{item.seasonal_factor.toFixed(2)}</td>
                  <td>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      background: item.trend === 'increasing' ? '#6bcf7f' : 
                                 item.trend === 'decreasing' ? '#ff6b6b' : '#ffd93d',
                      color: item.trend === 'increasing' ? 'white' : 'black'
                    }}>
                      {item.trend === 'increasing' ? 'Рост' :
                       item.trend === 'decreasing' ? 'Снижение' : 'Стабильно'}
                    </span>
                  </td>
                  <td>{item.recommended_order_quantity.toFixed(0)}</td>
                  <td>{new Date(item.recommended_order_date).toLocaleDateString()}</td>
                  <td style={{ fontSize: '12px' }}>
                    {item.predicted_consumption.slice(0, 3).map(p => 
                      `${p.month}: ${p.quantity} (${(p.confidence * 100).toFixed(0)}%)`
                    ).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
