import React from 'react';
import { 
  getEnhancedProductTypes,
  getEnhancedProductSchema,
  upsertEnhancedProduct,
  upsertEnhancedProductSchema,
  deleteEnhancedProduct
} from '../../api';
import {
  listServices,
  createService,
  updateService,
  deleteService,
  listOperationNorms,
  createOperationNorm,
  updateOperationNorm,
  deleteOperationNorm,
    calculatePrice,
    type CalculateRequest,
  type Service,
  type OperationNorm
} from '../../api/pricing';

export const AdminProductManager: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [products, setProducts] = React.useState<any[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string>('');
  const [meta, setMeta] = React.useState<any>({ key: '', name: '', type: '', description: '' });
  const [schema, setSchema] = React.useState<string>('');
  // Pricing admin states
  const [services, setServices] = React.useState<Service[]>([]);
  const [operations, setOperations] = React.useState<OperationNorm[]>([]);
  const [activeAdminTab, setActiveAdminTab] = React.useState<'products'|'services'|'operations'>('products');
  // Test calculation UI
  const [specsJson, setSpecsJson] = React.useState<string>('{"format":"A6","quantity":100,"paperType":"semi-matte","paperDensity":150,"sides":1}');
  const [calcResult, setCalcResult] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await getEnhancedProductTypes();
      const list = resp?.data?.data || resp?.data || [];
      setProducts(list);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки типов продуктов');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Load pricing dictionaries
  const loadPricing = React.useCallback(async () => {
    try {
      const [sv, op] = await Promise.all([
        listServices(),
        listOperationNorms()
      ]);
      setServices(sv);
      setOperations(op);
    } catch (e) {
      // ignore to keep products page working even if pricing API not ready
    }
  }, []);
  React.useEffect(() => { loadPricing(); }, [loadPricing]);

  const onSelect = React.useCallback(async (key: string) => {
    setSelectedKey(key);
    const p = products.find(x => x.key === key) || { key };
    setMeta({ key: p.key || key, name: p.name || '', type: p.type || '', description: p.description || '' });
    try {
      const resp = await getEnhancedProductSchema(key);
      const s = resp?.data?.data || resp?.data || null;
      setSchema(JSON.stringify(s || { key, fields: [] }, null, 2));
    } catch {
      setSchema(JSON.stringify({ key, fields: [] }, null, 2));
    }
  }, [products]);

  const saveMeta = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      await upsertEnhancedProduct(meta);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения продукта');
    } finally {
      setLoading(false);
    }
  }, [meta, load]);

  const saveSchema = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const parsed = JSON.parse(schema);
      await upsertEnhancedProductSchema(selectedKey || meta.key, parsed);
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения схемы (проверьте JSON)');
    } finally {
      setLoading(false);
    }
  }, [schema, selectedKey, meta.key]);

  const onDelete = React.useCallback(async () => {
    if (!selectedKey) return;
    if (!confirm('Удалить продукт и его схему?')) return;
    try {
      setLoading(true);
      setError('');
      await deleteEnhancedProduct(selectedKey);
      setSelectedKey('');
      setMeta({ key: '', name: '', type: '', description: '' });
      setSchema('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Ошибка удаления');
    } finally {
      setLoading(false);
    }
  }, [selectedKey, load]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Управление продуктами калькулятора</h2>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { key: 'products', label: '📦 Продукты' },
          { key: 'services', label: '🛠️ Услуги' },
          { key: 'operations', label: '⚙️ Операции' }
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveAdminTab(tab.key as any)} className={activeAdminTab===tab.key ? 'active' : ''}>{tab.label}</button>
        ))}
      </div>

      {activeAdminTab === 'products' && (
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Продукты</strong>
            <button disabled={loading} onClick={load}>Обновить</button>
          </div>
          <div style={{ border: '1px solid #ddd', borderRadius: 4, maxHeight: 320, overflow: 'auto' }}>
            {products.map(p => (
              <div key={p.key} style={{ padding: 8, cursor: 'pointer', background: (selectedKey===p.key?'#f5f5f5':'#fff') }} onClick={() => onSelect(p.key)}>
                <div><strong>{p.name || p.type}</strong></div>
                <div style={{ fontSize: 12, color: '#666' }}>{p.key}</div>
              </div>
            ))}
          </div>
          <button style={{ marginTop: 8 }} disabled={loading} onClick={() => { setSelectedKey(''); setMeta({ key: '', name: '', type: '', description: '' }); setSchema(JSON.stringify({ key: '', fields: [] }, null, 2)); }}>Новый продукт</button>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h3>Метаданные</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                <input placeholder="key (латиница)" value={meta.key} onChange={e => setMeta({ ...meta, key: e.target.value })} />
                <input placeholder="type (название RU)" value={meta.type} onChange={e => setMeta({ ...meta, type: e.target.value })} />
                <input placeholder="name (кратко)" value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} />
                <input placeholder="description" value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={loading || !meta.key} onClick={saveMeta}>Сохранить продукт</button>
                  <button disabled={loading || !selectedKey} onClick={onDelete}>Удалить</button>
                </div>
              </div>
            </div>
            <div>
              <h3>Схема полей (JSON)</h3>
              <textarea style={{ width: '100%', height: 240, fontFamily: 'monospace' }} value={schema} onChange={e => setSchema(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button disabled={loading || !meta.key} onClick={saveSchema}>Сохранить схему</button>
              </div>
            </div>
          </div>
        </div>
        {/* Быстрый тест расчёта */}
        <div style={{ gridColumn: '1 / span 2', marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <h3>Тест расчёта цены (backend)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ marginBottom: 6 }}>Спецификация (JSON)</div>
              <textarea style={{ width: '100%', height: 120, fontFamily: 'monospace' }} value={specsJson} onChange={e => setSpecsJson(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button disabled={loading} onClick={async () => {
                  try {
                    setLoading(true);
                    const payload: CalculateRequest = {
                      productType: selectedKey || meta.key || products[0]?.key || 'flyers',
                      ...JSON.parse(specsJson),
                    } as any;
                    const resp = await calculatePrice(payload);
                    setCalcResult(resp);
                  } catch (e) {
                    setError('Ошибка расчёта (проверьте JSON)');
                  } finally {
                    setLoading(false);
                  }
                }}>Рассчитать</button>
              </div>
            </div>
            <div>
              <div style={{ marginBottom: 6 }}>Результат</div>
              {!calcResult && <div style={{ color: '#666' }}>Нет данных</div>}
              {calcResult && (
                <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8 }}>
                  <div>Итог: <strong>{calcResult.final?.toFixed ? calcResult.final.toFixed(2) : (calcResult.data?.finalPrice ?? '')} BYN</strong></div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Материалы</strong>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                      <thead><tr><th style={{ textAlign: 'left' }}>Наименование</th><th>Ед.</th><th>К-во</th><th>Ставка</th><th>Сумма</th></tr></thead>
                      <tbody>
                        {(calcResult.data?.breakdown?.materials || calcResult.materials || []).map((m: any, i: number) => (
                          <tr key={i}><td>{m.name}</td><td style={{ textAlign: 'center' }}>{m.unit}</td><td style={{ textAlign: 'right' }}>{m.quantity}</td><td style={{ textAlign: 'right' }}>{m.rate}</td><td style={{ textAlign: 'right' }}>{m.total?.toFixed ? m.total.toFixed(2) : m.total}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Услуги</strong>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                      <thead><tr><th style={{ textAlign: 'left' }}>Наименование</th><th>Ед.</th><th>К-во</th><th>Ставка</th><th>Сумма</th></tr></thead>
                      <tbody>
                        {(calcResult.data?.breakdown?.services || calcResult.services || []).map((s: any, i: number) => (
                          <tr key={i}><td>{s.name}</td><td style={{ textAlign: 'center' }}>{s.unit}</td><td style={{ textAlign: 'right' }}>{s.quantity}</td><td style={{ textAlign: 'right' }}>{s.rate}</td><td style={{ textAlign: 'right' }}>{s.total?.toFixed ? s.total.toFixed(2) : s.total}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {activeAdminTab === 'services' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Справочник услуг</strong>
            <button onClick={() => setServices(prev => [{ id: 0, name: '', unit: 'sheet', rate: 0, currency: 'BYN', is_active: true }, ...prev])}>+ Добавить</button>
          </div>
          <div style={{ border: '1px solid #ddd', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={{ textAlign: 'left', padding: 8 }}>Название</th><th>Ед.</th><th>Ставка</th><th>Валюта</th><th>Активна</th><th></th></tr>
              </thead>
              <tbody>
                {(Array.isArray(services) ? services : []).map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: 8 }}>
                      <input value={s.name} onChange={e => setServices(v => v.map((x,i)=> i===idx? { ...x, name: e.target.value }: x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <select value={s.unit} onChange={e => setServices(v=> v.map((x,i)=> i===idx? { ...x, unit: e.target.value as any }: x))}>
                        {['sheet','hour','m2','click','item'].map(u => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </td>
                    <td style={{ padding: 8 }}>
                      <input type="number" step="0.01" value={s.rate} onChange={e => setServices(v=> v.map((x,i)=> i===idx? { ...x, rate: Number(e.target.value) }: x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <select value={s.currency} onChange={e => setServices(v=> v.map((x,i)=> i===idx? { ...x, currency: e.target.value as any }: x))}>
                        {['BYN','USD','EUR'].map(c => (<option key={c} value={c}>{c}</option>))}
                      </select>
                    </td>
                    <td style={{ padding: 8 }}>
                      <input type="checkbox" checked={s.is_active} onChange={e => setServices(v=> v.map((x,i)=> i===idx? { ...x, is_active: e.target.checked }: x))} />
                    </td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                      {s.id === 0 ? (
                        <button onClick={async () => { const saved = await createService({ name: s.name, unit: s.unit, rate: s.rate, currency: s.currency, is_active: s.is_active }); setServices(v=> v.map((x,i)=> i===idx? saved: x)); }}>💾</button>
                      ) : (
                        <>
                          <button onClick={async () => { const saved = await updateService(s.id, s); setServices(v=> v.map(x=> x.id===s.id? saved: x)); }}>💾</button>
                          <button onClick={async () => { await deleteService(s.id); setServices(v=> v.filter(x=> x.id!==s.id)); }}>🗑️</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeAdminTab === 'operations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Операции/нормы</strong>
            <button onClick={() => setOperations(prev => [{ id: 0, product_type: selectedKey || (products[0]?.key || ''), operation: '', service_id: services[0]?.id || 0, formula: 'ceil(quantity/2)', is_active: true }, ...prev])}>+ Добавить</button>
          </div>
          <div style={{ border: '1px solid #ddd', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={{ textAlign: 'left', padding: 8 }}>Продукт</th><th>Операция</th><th>Сервис</th><th>Формула нормы</th><th>Активна</th><th></th></tr>
              </thead>
              <tbody>
                {operations.map((o, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: 8 }}>
                      <input value={o.product_type} onChange={e => setOperations(v=> v.map((x,i)=> i===idx? { ...x, product_type: e.target.value }: x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <input value={o.operation} onChange={e => setOperations(v=> v.map((x,i)=> i===idx? { ...x, operation: e.target.value }: x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <select value={o.service_id} onChange={e => setOperations(v=> v.map((x,i)=> i===idx? { ...x, service_id: Number(e.target.value) }: x))}>
                        {(Array.isArray(services) ? services : []).map((s, optIdx)=> (<option key={s.id || `new-${optIdx}`} value={s.id}>{s.name}</option>))}
                      </select>
                    </td>
                    <td style={{ padding: 8 }}>
                      <input value={o.formula} onChange={e => setOperations(v=> v.map((x,i)=> i===idx? { ...x, formula: e.target.value }: x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <input type="checkbox" checked={o.is_active} onChange={e => setOperations(v=> v.map((x,i)=> i===idx? { ...x, is_active: e.target.checked }: x))} />
                    </td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                      {o.id === 0 ? (
                        <button onClick={async () => { const saved = await createOperationNorm({ product_type: o.product_type, operation: o.operation, service_id: o.service_id, formula: o.formula, is_active: o.is_active }); setOperations(v=> v.map((x,i)=> i===idx? saved: x)); }}>💾</button>
                      ) : (
                        <>
                          <button onClick={async () => { const saved = await updateOperationNorm(o.id, o); setOperations(v=> v.map(x=> x.id===o.id? saved: x)); }}>💾</button>
                          <button onClick={async () => { await deleteOperationNorm(o.id); setOperations(v=> v.filter(x=> x.id!==o.id)); }}>🗑️</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProductManager;


