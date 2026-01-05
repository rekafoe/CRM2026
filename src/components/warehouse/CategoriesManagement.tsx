import React from 'react';
import { getMaterialCategories, getMaterialCategoryStats, createMaterialCategory, updateMaterialCategory, deleteMaterialCategory } from '../../api';
import './InventoryControl.css';

interface CategoriesManagementProps {
  onRefresh?: () => void;
}

export const CategoriesManagement: React.FC<CategoriesManagementProps> = ({ onRefresh }) => {
  const [categories, setCategories] = React.useState<Array<{ id: number; name: string; color?: string; description?: string; created_at?: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState<{ id?: number; name: string; color?: string; description?: string } | null>(null);
  const [form, setForm] = React.useState<{ name: string; color?: string; description?: string }>({ name: '', color: '', description: '' });
  const [materialsCount, setMaterialsCount] = React.useState<Record<number, number>>({});
  const palette = React.useMemo(() => [
    '#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569',
    '#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#1E88E5',
    '#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#43A047',
    '#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#FFA726', '#FB8C00',
    '#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#E53935'
  ], []);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesRes, statsRes] = await Promise.all([
        getMaterialCategories(),
        getMaterialCategoryStats()
      ]);
      setCategories(categoriesRes.data || []);
      
      // Создаем мапу количества материалов по категориям
      const countMap: Record<number, number> = {};
      if (statsRes.data) {
        statsRes.data.forEach((stat: any) => {
          countMap[stat.category_id] = stat.materials_count || 0;
        });
      }
      setMaterialsCount(countMap);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const allCategories = categories || [];
    
    // Дедупликация по id - оставляем только первое вхождение каждого id
    const uniqueCategories = allCategories.reduce((acc, category) => {
      if (!acc.find(c => c.id === category.id)) {
        acc.push(category);
      }
      return acc;
    }, [] as any[]);
    
    return uniqueCategories.filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }, [categories, search]);

  const openCreate = () => { setEditing(null); setForm({ name: '', color: '', description: '' }); setShowModal(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name || '', color: c.color || '', description: c.description || '' }); setShowModal(true); };

  const save = async () => {
    if (!form.name.trim()) return alert('Введите название');
    if (editing && editing.id) {
      await updateMaterialCategory(editing.id, form);
    } else {
      await createMaterialCategory(form);
    }
    setShowModal(false);
    await load();
    onRefresh?.();
  };

  const remove = async (id: number) => {
    if (!confirm('Удалить категорию?')) return;
    try {
      await deleteMaterialCategory(id);
      await load();
      onRefresh?.();
    } catch (error: any) {
      if (error.message?.includes('Нельзя удалить категорию, в которой есть материалы')) {
        alert('Нельзя удалить категорию, в которой есть материалы. Сначала переместите или удалите все материалы из этой категории.');
      } else {
        alert('Ошибка удаления категории: ' + (error.message || 'Неизвестная ошибка'));
      }
    }
  };

  return (
    <div className="categories-management">
      <div className="inventory-header">
        <h2>🗂️ Категории материалов</h2>
        <div className="header-actions">
          <button className="action-btn" onClick={openCreate}>➕ Добавить категорию</button>
        </div>
      </div>

      <div className="inv-filters">
        <input placeholder="Поиск по названию/описанию" value={search} onChange={e => setSearch(e.target.value)} />
        <button className="action-btn" onClick={load}>Обновить</button>
      </div>

      <div className="materials-table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Цвет</th>
              <th>Описание</th>
              <th>Материалы</th>
              <th>Создано</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>Категории не найдены</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td style={{ textAlign: 'left' }}>{c.name}</td>
                <td>{c.color ? (<span style={{ display: 'inline-block', width: 16, height: 16, background: c.color, border: '1px solid #ddd', borderRadius: 3 }} />) : '—'}</td>
                <td style={{ textAlign: 'left' }}>{c.description || '—'}</td>
                <td>
                  <span style={{ 
                    color: materialsCount[c.id] > 0 ? '#e74c3c' : '#27ae60',
                    fontWeight: 'bold'
                  }}>
                    {materialsCount[c.id] || 0}
                  </span>
                </td>
                <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="inv-actions">
                    <button className="action-btn small" onClick={() => openEdit(c)}>✏️</button>
                    <button 
                      className="action-btn small danger" 
                      onClick={() => remove(c.id)}
                      disabled={materialsCount[c.id] > 0}
                      title={materialsCount[c.id] > 0 ? 'Нельзя удалить категорию с материалами' : 'Удалить категорию'}
                      style={{
                        opacity: materialsCount[c.id] > 0 ? 0.5 : 1,
                        cursor: materialsCount[c.id] > 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{editing ? 'Редактировать категорию' : 'Новая категория'}</h3>
              <button className="action-btn small" onClick={() => setShowModal(false)}>✖</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Название</label>
                  <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Цвет</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={form.color || '#FFFFFF'} onChange={e => setForm(prev => ({ ...prev, color: e.target.value }))} />
                      <input value={form.color || ''} onChange={e => setForm(prev => ({ ...prev, color: e.target.value }))} placeholder="#DDEEFF" style={{ flex: 1 }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Палитра</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
                    {palette.map(c => (
                      <button
                        key={c}
                        type="button"
                        className="action-btn small"
                        onClick={() => setForm(prev => ({ ...prev, color: c }))}
                        title={c}
                        style={{
                          background: c,
                          border: '1px solid #d0d0d0',
                          width: 24,
                          height: 24,
                          padding: 0,
                          borderRadius: 4
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Описание</label>
                  <input value={form.description || ''} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="action-btn" onClick={save}>💾 Сохранить</button>
              <button className="action-btn" onClick={() => setShowModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
