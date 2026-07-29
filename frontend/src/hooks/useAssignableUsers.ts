import { useCallback, useEffect, useState } from 'react';
import {
  getAssignableUsers,
  type AssignableUser,
  type AssignableUsersResponse,
} from '../api';

export type UseAssignableUsersOptions = {
  date?: string;
  departmentId?: number | null;
  enabled?: boolean;
};

const EMPTY: AssignableUsersResponse = { onShift: [], all: [] };

export function useAssignableUsers(options: UseAssignableUsersOptions = {}) {
  const { date, departmentId = null, enabled = true } = options;
  const [data, setData] = useState<AssignableUsersResponse>(EMPTY);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!enabled) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    getAssignableUsers({ date, department_id: departmentId })
      .then((res) => {
        setData({
          onShift: Array.isArray(res.data?.onShift) ? res.data.onShift : [],
          all: Array.isArray(res.data?.all) ? res.data.all : [],
        });
      })
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false));
  }, [date, departmentId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, reload };
}

export type { AssignableUser, AssignableUsersResponse };
