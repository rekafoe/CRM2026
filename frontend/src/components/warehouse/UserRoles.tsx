import React, { useState, useEffect } from 'react'
import './UserRoles.css'

interface Role {
  id: number
  name: string
  description: string
  permissions: string[]
  isActive: boolean
  created_at: string
  updated_at: string
}

interface User {
  id: number
  name: string
  email: string
  role: string
  isActive: boolean
  created_at: string
  lastLogin: string
}

interface Permission {
  id: string
  name: string
  description: string
  category: string
}

export const UserRoles: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roles' | 'users' | 'permissions'>('roles')
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Формы
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  
  // Данные форм
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: [] as string[]
  })
  
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'operator'
  })

  // Загрузка данных
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const token = localStorage.getItem('crmToken') || 'admin-token-123'
      
      // Загружаем роли
      const rolesResponse = await fetch('/api/user-roles/roles', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const rolesData = await rolesResponse.json()
      setRoles(rolesData.roles || [])
      
      // Загружаем пользователей
      const usersResponse = await fetch('/api/user-roles/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const usersData = await usersResponse.json()
      setUsers(usersData.users || [])
      
      // Загружаем разрешения
      const permissionsResponse = await fetch('/api/user-roles/permissions', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const permissionsData = await permissionsResponse.json()
      setPermissions(permissionsData.permissions || [])
      
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Создание роли
  const handleCreateRole = async () => {
    try {
      const token = localStorage.getItem('crmToken') || 'admin-token-123'
      
      const response = await fetch('/api/user-roles/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(roleForm)
      })
      
      if (!response.ok) {
        throw new Error('Ошибка создания роли')
      }
      
      setShowRoleForm(false)
      setRoleForm({ name: '', description: '', permissions: [] })
      loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Обновление роли
  const handleUpdateRole = async () => {
    if (!editingRole) return
    
    try {
      const token = localStorage.getItem('crmToken') || 'admin-token-123'
      
      const response = await fetch(`/api/user-roles/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(roleForm)
      })
      
      if (!response.ok) {
        throw new Error('Ошибка обновления роли')
      }
      
      setEditingRole(null)
      setRoleForm({ name: '', description: '', permissions: [] })
      loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Удаление роли
  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту роль?')) return
    
    try {
      const token = localStorage.getItem('crmToken') || 'admin-token-123'
      
      const response = await fetch(`/api/user-roles/roles/${roleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('Ошибка удаления роли')
      }
      
      loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Назначение роли пользователю
  const handleAssignRole = async (userId: number, roleId: number) => {
    try {
      const token = localStorage.getItem('crmToken') || 'admin-token-123'
      
      const response = await fetch('/api/user-roles/assign-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, roleId })
      })
      
      if (!response.ok) {
        throw new Error('Ошибка назначения роли')
      }
      
      loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Создание стандартных ролей
  const handleCreateDefaultRoles = async () => {
    try {
      const token = localStorage.getItem('crmToken') || 'admin-token-123'
      
      const response = await fetch('/api/user-roles/create-default-roles', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('Ошибка создания стандартных ролей')
      }
      
      loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Группировка разрешений по категориям
  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = []
    }
    acc[permission.category].push(permission)
    return acc
  }, {} as Record<string, Permission[]>)

  if (loading) {
    return (
      <div className="user-roles">
        <div className="loading">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="user-roles">
      <div className="user-roles-header">
        <h2>Управление ролями и пользователями</h2>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={handleCreateDefaultRoles}
          >
            Создать стандартные роли
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'roles' ? 'active' : ''}`}
          onClick={() =>setActiveTab('roles')}
        >
          Роли
        </button>
        <button 
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() =>setActiveTab('users')}
        >
          Пользователи
        </button>
        <button 
          className={`tab ${activeTab === 'permissions' ? 'active' : ''}`}
          onClick={() =>setActiveTab('permissions')}
        >
          Разрешения
        </button>
      </div>

      {/* Вкладка ролей */}
      {activeTab === 'roles' && (
        <div className="roles-tab">
          <div className="section-header">
            <h3>Роли системы</h3>
            <button 
              className="btn btn-primary"
              onClick={() =>{
                setEditingRole(null)
                setRoleForm({ name: '', description: '', permissions: [] })
                setShowRoleForm(true)
              }}
            >
              Создать роль
            </button>
          </div>

          <div className="roles-list">
            {roles.map(role => (
              <div key={role.id} className="role-card">
                <div className="role-header">
                  <h4>{role.name}</h4>
                  <div className="role-actions">
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={() =>{
                        setEditingRole(role)
                        setRoleForm({
                          name: role.name,
                          description: role.description,
                          permissions: role.permissions
                        })
                        setShowRoleForm(true)
                      }}
                    >
                      Редактировать
                    </button>
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={() =>handleDeleteRole(role.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                <p className="role-description">{role.description}</p>
                <div className="role-permissions">
                  <strong>Разрешения:</strong>
                  <div className="permissions-list">
                    {role.permissions.map(permission => {
                      const perm = permissions.find(p => p.id === permission)
                      return (
                        <span key={permission} className="permission-tag">
                          {perm?.name || permission}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Вкладка пользователей */}
      {activeTab === 'users' && (
        <div className="users-tab">
          <div className="section-header">
            <h3>Пользователи системы</h3>
          </div>

          <div className="users-list">
            {users.map(user => (
              <div key={user.id} className="user-card">
                <div className="user-info">
                  <h4>{user.name}</h4>
                  <p className="user-email">{user.email}</p>
                  <p className="user-role">Роль: {user.role}</p>
                  <p className="user-status">
                    Статус: {user.isActive ? 'Активен' : 'Неактивен'}
                  </p>
                  <p className="user-last-login">
                    Последний вход: {user.lastLogin}
                  </p>
                </div>
                <div className="user-actions">
                  <select 
                    className="role-select"
                    value={user.role}
                    onChange={(e) => {
                      const role = roles.find(r => r.name === e.target.value)
                      if (role) {
                        handleAssignRole(user.id, role.id)
                      }
                    }}
                  >
                    {roles.map(role => (
                      <option key={role.id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Вкладка разрешений */}
      {activeTab === 'permissions' && (
        <div className="permissions-tab">
          <div className="section-header">
            <h3>Разрешения системы</h3>
          </div>

          <div className="permissions-list">
            {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
              <div key={category} className="permission-category">
                <h4>{category}</h4>
                <div className="permissions-grid">
                  {categoryPermissions.map(permission => (
                    <div key={permission.id} className="permission-item">
                      <h5>{permission.name}</h5>
                      <p>{permission.description}</p>
                      <code>{permission.id}</code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно создания/редактирования роли */}
      {showRoleForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingRole ? 'Редактировать роль' : 'Создать роль'}</h3>
              <button 
                className="close-btn"
                onClick={() =>{
                  setShowRoleForm(false)
                  setEditingRole(null)
                  setRoleForm({ name: '', description: '', permissions: [] })
                }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Название роли</label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="Введите название роли"
                />
              </div>
              <div className="form-group">
                <label>Описание</label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="Введите описание роли"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Разрешения</label>
                <div className="permissions-selector">
                  {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                    <div key={category} className="permission-category">
                      <h5>{category}</h5>
                      <div className="permissions-checkboxes">
                        {categoryPermissions.map(permission => (
                          <label key={permission.id} className="permission-checkbox">
                            <input
                              type="checkbox"
                              checked={roleForm.permissions.includes(permission.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRoleForm({
                                    ...roleForm,
                                    permissions: [...roleForm.permissions, permission.id]
                                  })
                                } else {
                                  setRoleForm({
                                    ...roleForm,
                                    permissions: roleForm.permissions.filter(p => p !== permission.id)
                                  })
                                }
                              }}
                            />
                            <span>{permission.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() =>{
                  setShowRoleForm(false)
                  setEditingRole(null)
                  setRoleForm({ name: '', description: '', permissions: [] })
                }}
              >
                Отмена
              </button>
              <button 
                className="btn btn-primary"
                onClick={editingRole ? handleUpdateRole : handleCreateRole}
              >
                {editingRole ? 'Обновить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
