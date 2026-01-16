import React, { useState } from 'react';
import { createShift, getShifts, setAuthToken } from '../api';
import { APP_CONFIG } from '../types';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'shift'>('login');
  const [hours, setHours] = useState('');
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
      const today = new Date().toISOString().slice(0, 10);
      try {
        const shifts = await getShifts({ date: today });
        if (Array.isArray(shifts.data) && shifts.data.length > 0) {
          navigate('/', { replace: true });
        } else {
          setStep('shift');
        }
      } catch {
        setStep('shift');
      }
    } catch (e: any) {
      setError('Неверный email или пароль');
    }
  }

  async function handleShiftSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const hoursValue = Number(hours);
    if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
      setError('Введите корректное количество часов');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      await createShift({ date: today, hours: hoursValue });
      navigate('/', { replace: true });
    } catch (e: any) {
      setError('Не удалось сохранить часы');
    }
  }

  return (
    <div className="login-page">
      {step === 'login' ? (
        <form onSubmit={handleSubmit} className="login-card">
          <h2 className="login-title">Вход в CRM</h2>
          <div className="login-field-group">
            <input
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="login-input"
            />
            <input
              placeholder="Пароль"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="login-input"
            />
            <button type="submit" className="login-button">
              Войти
            </button>
          </div>
          {error && <div className="login-error">{error}</div>}
        </form>
      ) : (
        <form onSubmit={handleShiftSubmit} className="login-card">
          <h2 className="login-title">Смена сегодня</h2>
          <div className="login-field-group">
            <div className="login-shift-info">
              Укажите количество рабочих часов на сегодня, чтобы продолжить.
            </div>
            <input
              placeholder="Часы за день"
              type="number"
              min={0}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="login-input"
            />
            <button type="submit" className="login-button">
              Сохранить и продолжить
            </button>
          </div>
          {error && <div className="login-error">{error}</div>}
        </form>
      )}
    </div>
  );
}

