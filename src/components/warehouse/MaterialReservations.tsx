import React, { useState } from 'react';
import { useMaterialReservations, useCreateMaterialReservation, useCancelMaterialReservation, useFulfillMaterialReservation } from '../../api/hooks/useMaterialReservations';
import { useMaterials } from '../../api/hooks/useMaterials';
import { CreateMaterialReservationRequest } from '../../api/types';
import './MaterialReservations.css';

const MaterialReservations: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<number | null>(null);
  const [reservationData, setReservationData] = useState<CreateMaterialReservationRequest>({
    material_id: 0,
    quantity_reserved: 0,
    expires_at: '',
    notes: ''
  });

  const { data: reservations, isLoading: reservationsLoading } = useMaterialReservations();
  const { data: materials } = useMaterials();
  const createReservation = useCreateMaterialReservation();
  const cancelReservation = useCancelMaterialReservation();
  const fulfillReservation = useFulfillMaterialReservation();

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createReservation.mutateAsync(reservationData);
      setShowCreateModal(false);
      setReservationData({
        material_id: 0,
        quantity_reserved: 0,
        expires_at: '',
        notes: ''
      });
    } catch (error) {
      console.error('Ошибка при создании резервирования:', error);
    }
  };

  const handleCancelReservation = async (id: number) => {
    if (window.confirm('Вы уверены, что хотите отменить это резервирование?')) {
      try {
        await cancelReservation.mutateAsync({ id, reason: 'Отменено пользователем' });
      } catch (error) {
        console.error('Ошибка при отмене резервирования:', error);
      }
    }
  };

  const handleFulfillReservation = async (id: number) => {
    if (window.confirm('Вы уверены, что хотите выполнить это резервирование? Материал будет списан со склада.')) {
      try {
        await fulfillReservation.mutateAsync(id);
      } catch (error) {
        console.error('Ошибка при выполнении резервирования:', error);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      active: 'status-badge success',
      fulfilled: 'status-badge info',
      cancelled: 'status-badge danger',
      expired: 'status-badge warning'
    };
    
    const statusLabels = {
      active: 'Активно',
      fulfilled: 'Выполнено',
      cancelled: 'Отменено',
      expired: 'Истекло'
    };

    return (
      <span className={statusClasses[status as keyof typeof statusClasses] || 'status-badge'}>
        {statusLabels[status as keyof typeof statusLabels] || status}
      </span>
    );
  };

  if (reservationsLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Загрузка резервирований...</p>
      </div>
    );
  }

  return (
    <div className="material-reservations">
      <div className="page-header">
        <h2>Резервирование материалов</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <i className="icon-plus"></i>
          Создать резервирование
        </button>
      </div>

      <div className="reservations-table">
        <table>
          <thead>
            <tr>
              <th>Материал</th>
              <th>Количество</th>
              <th>Статус</th>
              <th>Создано</th>
              <th>Истекает</th>
              <th>Примечания</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {reservations?.map((reservation) => (
              <tr key={reservation.id}>
                <td>
                  <div className="material-info">
                    <strong>{reservation.material?.name}</strong>
                    <small>{reservation.material?.unit}</small>
                  </div>
                </td>
                <td>{reservation.quantity_reserved}</td>
                <td>{getStatusBadge(reservation.status)}</td>
                <td>{new Date(reservation.reserved_at).toLocaleDateString()}</td>
                <td>
                  {reservation.expires_at 
                    ? new Date(reservation.expires_at).toLocaleDateString()
                    : 'Не ограничено'
                  }
                </td>
                <td>{reservation.notes || '-'}</td>
                <td>
                  <div className="action-buttons">
                    {reservation.status === 'active' && (
                      <>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleFulfillReservation(reservation.id)}
                          title="Выполнить резервирование"
                        >
                          <i className="icon-check"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleCancelReservation(reservation.id)}
                          title="Отменить резервирование"
                        >
                          <i className="icon-x"></i>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {reservations?.length === 0 && (
          <div className="empty-state">
            <p>Резервирований не найдено</p>
          </div>
        )}
      </div>

      {/* Модальное окно создания резервирования */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Создать резервирование</h3>
              <button 
                className="btn-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleCreateReservation} className="modal-body">
              <div className="form-group">
                <label>Материал *</label>
                <select
                  value={reservationData.material_id}
                  onChange={(e) => setReservationData({
                    ...reservationData,
                    material_id: parseInt(e.target.value)
                  })}
                  required
                >
                  <option value={0}>Выберите материал</option>
                  {materials?.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name} (доступно: {material.quantity} {material.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Количество *</label>
                <input
                  type="number"
                  value={reservationData.quantity_reserved}
                  onChange={(e) => setReservationData({
                    ...reservationData,
                    quantity_reserved: parseFloat(e.target.value) || 0
                  })}
                  required
                  min="0.01"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label>Срок действия</label>
                <input
                  type="datetime-local"
                  value={reservationData.expires_at}
                  onChange={(e) => setReservationData({
                    ...reservationData,
                    expires_at: e.target.value
                  })}
                />
              </div>

              <div className="form-group">
                <label>Примечания</label>
                <textarea
                  value={reservationData.notes}
                  onChange={(e) => setReservationData({
                    ...reservationData,
                    notes: e.target.value
                  })}
                  rows={3}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createReservation.isPending}
                >
                  {createReservation.isPending ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialReservations;
