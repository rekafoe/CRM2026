import React from 'react';

interface OrderMetaProps {
  contextDate: string;
  contextUserId: number | null;
  currentUser: { id: number; name: string; role: string } | null;
  allUsers: Array<{ id: number; name: string }>;
  onDateChange: (date: string) => void;
  onUserChange: (userId: number | null) => void;
}

export const OrderMeta: React.FC<OrderMetaProps> = ({
  contextDate,
  contextUserId,
  currentUser,
  allUsers,
  onDateChange,
  onUserChange,
}) => {
  return (
    <div className="detail-header-meta">
      <div className="form-group">
        <label>Дата</label>
        <input 
          type="date" 
          value={contextDate} 
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Пользователь</label>
        <select 
          value={String(contextUserId ?? currentUser?.id ?? '')} 
          onChange={(e) => {
            const uid = e.target.value ? Number(e.target.value) : null;
            onUserChange(uid);
          }}
        >
          {currentUser?.role === 'admin' ? (
            allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)
          ) : (
            <option value={currentUser?.id}>{currentUser?.name}</option>
          )}
        </select>
      </div>
    </div>
  );
};
