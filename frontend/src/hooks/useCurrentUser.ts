import { useState, useEffect } from 'react';
import { getCurrentUser } from '../api';

interface User {
  id: number;
  name: string;
  role: string;
}

export const useCurrentUser = (): User | null => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error('Error fetching current user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  return loading ? null : user;
};
