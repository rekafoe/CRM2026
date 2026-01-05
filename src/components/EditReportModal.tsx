// frontend/src/components/EditReportModal.tsx
import React, { useEffect, useState } from 'react';
import { DailyReport, UserRef } from '../types';
import { getUsers } from '../api';

interface Props {
  report: DailyReport;
  onClose: () => void;
  onSave: (updates: {
    orders_count?: number;
    total_revenue?: number;
    user_id?: number;
  }) => void;
}

const EditModal: React.FC<Props> = ({ report, onClose, onSave }) => {
  const [ordersCount, setOrdersCount] = useState(report.orders_count);
  const [totalRevenue, setTotalRevenue] = useState(report.total_revenue);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [userId, setUserId] = useState<number | undefined>(report.user_id);

  useEffect(() => { getUsers().then(r => setUsers(r.data)); }, []);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Редактировать отчёт за {report.report_date}</h3>
        <label>
          Число заказов:
          <input
            type="number"
            value={ordersCount}
            onChange={e => setOrdersCount(+e.target.value)}
          />
        </label>
        <label>
          Выручка:
          <input
            type="number"
            step="0.01"
            value={totalRevenue}
            onChange={e => setTotalRevenue(+e.target.value)}
          />
        </label>
        <label>
          Ответственный:
          <select value={userId ?? ''} onChange={e => setUserId(e.target.value ? +e.target.value : undefined)}>
            <option value="">Не назначен</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>Отмена</button>
          <button
            onClick={() =>
              onSave({
                orders_count: ordersCount,
                total_revenue: totalRevenue,
                user_id: userId
              })
            }
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
