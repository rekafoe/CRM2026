import React, { useState, useEffect } from 'react';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment, type Department } from '../../api';
import { getErrorMessage } from '../../utils/errorUtils';
import { Alert } from '../../components/common';
import './UserManagement.css';

interface DepartmentManagementProps {
  onBack?: () => void;
}

export const DepartmentManagement: React.FC<DepartmentManagementProps> = ({ onBack }) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadDepartments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDepartments();
      setDepartments(res.data ?? []);
    } catch (e) {
      setError(getErrorMessage(e, 'Ошибка загрузки департаментов'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleSave = async (data: { name: string; description?: string; sort_order?: number }) => {
    try {
      setError(null);
      if (editingDept) {
        await updateDepartment(editingDept.id, data);
        setEditingDept(null);
        await loadDepartments();
      } else {
        await createDepartment(data);
        setShowCreate(false);
        await loadDepartments();
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Ошибка сохранения'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить департамент? Пользователи этого департамента останутся без департамента.')) return;
    try {
      setError(null);
      await deleteDepartment(id);
      setEditingDept(null);
      await loadDepartments();
    } catch (e) {
      setError(getErrorMessage(e, 'Ошибка удаления'));
    }
  };

  return (
    <div className="user-management">
      <div className="user-management-header">
        <div className="user-management-header-left">
          {onBack && (
            <button onClick={onBack} className="user-management-back-btn">← Назад</button>
          )}
          <div>
            <h1 className="user-management-title">Департаменты</h1>
            <p className="user-management-description">Создание и редактирование департаментов для распределения пользователей</p>
          </div>
        </div>
        <div className="user-management-header-actions">
          <button onClick={() => { setShowCreate(true); setEditingDept(null); }} className="user-management-create-btn">
            ➕ Создать департамент
          </button>
        </div>
      </div>

      {error && <Alert type="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}

      <div className="users-list">
        <div className="users-list-header">Список ({departments.length})</div>
        {loading ? (
          <div className="users-loading">Загрузка...</div>
        ) : departments.length === 0 ? (
          <div className="users-empty">Нет департаментов. Создайте первый.</div>
        ) : (
          <div className="users-scroll-container">
            {departments.map(d => (
              <div key={d.id} className="user-item">
                <div className="user-info">
                  <div className="user-header">
                    <div className="user-name">{d.name}</div>
                    {d.description && <span className="user-details" style={{ marginLeft: 8 }}>{d.description}</span>}
                  </div>
                  {d.sort_order != null && <div className="user-details">Порядок: {d.sort_order}</div>}
                </div>
                <div className="user-actions">
                  <button onClick={() => { setEditingDept(d); setShowCreate(false); }} className="user-edit-btn">✏️ Редактировать</button>
                  <button onClick={() => handleDelete(d.id)} className="user-delete-btn">🗑️ Удалить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showCreate || editingDept) && (
        <DepartmentFormModal
          department={editingDept}
          onSave={handleSave}
          onClose={() => { setShowCreate(false); setEditingDept(null); }}
        />
      )}
    </div>
  );
};

interface DepartmentFormModalProps {
  department: Department | null;
  onSave: (data: { name: string; description?: string; sort_order?: number }) => void;
  onClose: () => void;
}

const DepartmentFormModal: React.FC<DepartmentFormModalProps> = ({ department, onSave, onClose }) => {
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [sortOrder, setSortOrder] = useState(department?.sort_order ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name: name.trim(), description: description.trim() || undefined, sort_order: sortOrder });
  };

  return (
    <div className="user-modal-overlay">
      <div className="user-modal">
        <div className="user-modal-header">
          <h3 className="user-modal-title">{department ? 'Редактировать департамент' : 'Новый департамент'}</h3>
          <button onClick={onClose} className="user-modal-close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="user-form">
          <div className="user-form-group">
            <label className="user-form-label">Название:</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="user-form-input" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">Описание:</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="user-form-input" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">Порядок:</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value) || 0)} className="user-form-input" />
          </div>
          <div className="user-form-actions">
            <button type="button" onClick={onClose} className="user-btn-secondary">Отмена</button>
            <button type="submit" className="user-btn-primary">{department ? 'Сохранить' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
