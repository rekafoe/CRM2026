import React, { useState, useEffect } from 'react';
import { useCreateMaterialReservation } from '../../api/hooks/useMaterialReservations';
import { useMaterials } from '../../api/hooks/useMaterials';
import { CreateMaterialReservationRequest } from '../../api/types';
import { Material } from '../../types/shared';
import './MaterialReservations.css';

interface MaterialReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  material?: Material;
  onReserve?: () => void;
}

const MaterialReservationModal: React.FC<MaterialReservationModalProps> = ({
  isOpen,
  onClose,
  material,
  onReserve
}) => {
  const [reservationData, setReservationData] = useState<CreateMaterialReservationRequest>({
    material_id: 0,
    quantity_reserved: 0,
    expires_at: '',
    notes: ''
  });

  const { data: materials } = useMaterials();
  const createReservation = useCreateMaterialReservation();

  useEffect(() => {
    if (material) {
      setReservationData({
        material_id: material.id,
        quantity_reserved: 0,
        expires_at: '',
        notes: ''
      });
    }
  }, [material]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createReservation.mutateAsync(reservationData);
      if (onReserve) onReserve();
      onClose();
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

  const handleClose = () => {
    setReservationData({
      material_id: 0,
      quantity_reserved: 0,
      expires_at: '',
      notes: ''
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>
            {material ? `Резервирование: ${material.name}` : 'Создать резервирование'}
          </h3>
          <button className="btn-close" onClick={handleClose}>
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Материал *</label>
            <select
              value={reservationData.material_id}
              onChange={(e) => setReservationData({
                ...reservationData,
                material_id: parseInt(e.target.value)
              })}
              required
              disabled={!!material}
            >
              <option value={0}>Выберите материал</option>
              {materials?.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name} (доступно: {mat.quantity} {mat.unit})
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
              placeholder="Введите количество"
            />
            {material && (
              <small className="form-help">
                Максимально доступно: {material.quantity} {material.unit}
              </small>
            )}
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
            <small className="form-help">
              Оставьте пустым для неограниченного срока
            </small>
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
              placeholder="Дополнительная информация о резервировании"
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createReservation.isPending}
            >
              {createReservation.isPending ? 'Создание...' : 'Создать резервирование'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialReservationModal;
