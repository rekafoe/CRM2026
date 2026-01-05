import React, { useState, useEffect } from 'react';
import { useMaterials } from '../../api/hooks/useMaterials';
import { useMaterialAvailability } from '../../api/hooks/useMaterialReservations';

interface MaterialAvailabilityProps {
  materialId: number;
}

const MaterialAvailability: React.FC<MaterialAvailabilityProps> = ({ materialId }) => {
  const { data: availability, isLoading } = useMaterialAvailability(materialId);

  if (isLoading) {
    return <span className="loading-text">Загрузка...</span>;
  }

  return (
    <span className={`availability-badge ${
      (availability?.available_quantity || 0) > 10 ? 'success' : 
      (availability?.available_quantity || 0) > 0 ? 'warning' : 'danger'
    }`}>
      {availability?.available_quantity || 0}
    </span>
  );
};

export default MaterialAvailability;

