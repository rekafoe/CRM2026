import React, { useState, useEffect } from 'react';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment, type Department } from '../../api';
import { getErrorMessage } from '../../utils/errorUtils';
import { Alert } from '../../components/common';
import './UserManagement.css';

interface DepartmentManagementProps {
  onBack?: () => void;
}

type DepartmentFormData = {
  name: string;
  description?: string;
  sort_order?: number;
  code?: string | null;
  address?: string | null;
  is_pickup_point?: boolean;
  is_active?: boolean;
};

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

  const handleSave = async (data: DepartmentFormData) => {
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
            <h1 className="user-management-title">Точки / департаменты</h1>
            <p className="user-management-description">
              Точки самовывоза и орг. подразделения. Код точки = id на сайте (OFFICE_PICKUP_POINTS).
            </p>
          </div>
        </div>
        <div className="user-management-header-actions">
          <button onClick={() => { setShowCreate(true); setEditingDept(null); }} className="user-management-create-btn">
            Создать точку
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
                    {d.is_pickup_point ? (
                      <span className="user-department-badge" title="Точка самовывоза">самовывоз</span>
                    ) : null}
                    {d.is_active === 0 || d.is_active === false ? (
                      <span className="user-details" style={{ marginLeft: 8 }}>неактивна</span>
                    ) : null}
                  </div>
                  {d.code ? <div className="user-details">Код: {d.code}</div> : null}
                  {d.address ? <div className="user-details">{d.address}</div> : null}
                  {d.description && <div className="user-details">{d.description}</div>}
                  {d.sort_order != null && <div className="user-details">Порядок: {d.sort_order}</div>}
                </div>
                <div className="user-actions">
                  <button onClick={() => { setEditingDept(d); setShowCreate(false); }} className="user-edit-btn">Редактировать</button>
                  <button onClick={() => handleDelete(d.id)} className="user-delete-btn">Удалить</button>
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
  onSave: (data: DepartmentFormData) => void;
  onClose: () => void;
}

const DepartmentFormModal: React.FC<DepartmentFormModalProps> = ({ department, onSave, onClose }) => {
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [sortOrder, setSortOrder] = useState(department?.sort_order ?? 0);
  const [code, setCode] = useState(department?.code ?? '');
  const [address, setAddress] = useState(department?.address ?? '');
  const [isPickup, setIsPickup] = useState(Boolean(department?.is_pickup_point));
  const [isActive, setIsActive] = useState(department?.is_active === undefined ? true : Boolean(department.is_active));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      sort_order: sortOrder,
      code: code.trim() || null,
      address: address.trim() || null,
      is_pickup_point: isPickup,
      is_active: isActive,
    });
  };

  return (
    <div className="user-modal-overlay">
      <div className="user-modal">
        <div className="user-modal-header">
          <h3 className="user-modal-title">{department ? 'Редактировать точку' : 'Новая точка'}</h3>
          <button onClick={onClose} className="user-modal-close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="user-form">
          <div className="user-form-group">
            <label className="user-form-label">Название:</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="user-form-input" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">Код (сайт / OFFICE_PICKUP_POINTS.id):</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value)} className="user-form-input" placeholder="pickup-gikalo" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">Адрес:</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="user-form-input" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">Описание:</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="user-form-input" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">Порядок:</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value) || 0)} className="user-form-input" />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">
              <input type="checkbox" checked={isPickup} onChange={e => setIsPickup(e.target.checked)} />
              {' '}Точка самовывоза
            </label>
          </div>
          <div className="user-form-group">
            <label className="user-form-label">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              {' '}Активна
            </label>
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
