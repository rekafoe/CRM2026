import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAdminBackTarget, type LocationStateWithBack } from '../utils/adminNavigation';

export function useAdminBack(explicitBackTo?: string) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const stateBack = (location.state as LocationStateWithBack | null)?.backTo;
    navigate(explicitBackTo ?? stateBack ?? getAdminBackTarget(location.pathname, location.search));
  }, [navigate, location.state, location.pathname, location.search, explicitBackTo]);
}
