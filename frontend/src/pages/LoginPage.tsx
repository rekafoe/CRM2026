import React, { useState } from 'react';
import { setAuthToken } from '../api';
import { APP_CONFIG } from '../types';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await axios.post('/api/auth/login', { email, password });
      setAuthToken(res.data.token);
      localStorage.setItem(APP_CONFIG.storage.role, res.data.role || '');
      if (res.data.user_id) localStorage.setItem(APP_CONFIG.storage.userId, String(res.data.user_id));
      if (res.data.session_date) localStorage.setItem(APP_CONFIG.storage.sessionDate, String(res.data.session_date));
      navigate('/', { replace: true });
    } catch (e: any) {
      setError('Неверный email или пароль');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f7f8' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: 320,
          padding: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          background: '#fff'
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem' }}>Вход в CRM</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }} />
          <input placeholder="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }} />
          <button
            type="submit"
            style={{ padding: '10px', borderRadius: 6, border: '1px solid #1976d2', background: '#1976d2', color: '#fff' }}
          >
            Войти
          </button>
        </div>
        {error && <div style={{ color: '#c00', marginTop: 8 }}>{error}</div>}
      </form>
    </div>
  );
}

