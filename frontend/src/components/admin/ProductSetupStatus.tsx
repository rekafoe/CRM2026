import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { getAxiosErrorMessage } from '../../utils/errorUtils';
import './ProductSetupStatus.css';

export type SetupStatus = 'draft' | 'materials_configured' | 'operations_configured' | 'ready';

interface SetupStep {
  step: string;
  isCompleted: boolean;
  completedAt?: string;
  validationNotes?: string;
}

interface ProductSetupState {
  productId: number;
  productName: string;
  currentStatus: SetupStatus;
  canActivate: boolean;
  steps: SetupStep[];
  missingSteps: string[];
}

interface ProductSetupStatusProps {
  productId: number;
  onStatusChange?: () => void;
}

const STEP_LABELS: Record<string, string> = {
  materials: 'Материалы',
  operations: 'Операции',
  pricing_rules: 'Правила ценообразования'
};

const STATUS_LABELS: Record<SetupStatus, string> = {
  draft: 'Черновик',
  materials_configured: 'Материалы настроены',
  operations_configured: 'Операции настроены',
  ready: 'Готов к использованию'
};

const STATUS_COLORS: Record<SetupStatus, string> = {
  draft: 'gray',
  materials_configured: 'yellow',
  operations_configured: 'blue',
  ready: 'green'
};

export const ProductSetupStatus: React.FC<ProductSetupStatusProps> = ({ productId, onStatusChange }) => {
  const [state, setState] = useState<ProductSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/products/${productId}/setup-status`);
      if (response.data.success) {
        setState(response.data.data);
      }
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Не удалось загрузить статус'));
      console.error('Ошибка загрузки статуса настройки:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    try {
      setUpdating(true);
      setError(null);
      const response = await apiClient.post(`/products/${productId}/update-setup-status`);
      if (response.data.success) {
        setState(response.data.data.state);
        onStatusChange?.();
      }
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Не удалось обновить статус'));
      console.error('Ошибка обновления статуса:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleActivate = async () => {
    if (!state?.canActivate) return;
    
    try {
      setActivating(true);
      setError(null);
      const response = await apiClient.post(`/products/${productId}/activate`);
      if (response.data.success) {
        await loadStatus();
        onStatusChange?.();
      }
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Не удалось активировать продукт'));
      console.error('Ошибка активации:', err);
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [productId]);

  if (loading) {
    return (
      <div className="setup-status-card">
        <div className="setup-status-loading">Загрузка...</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="setup-status-card">
        <div className="setup-status-error">Не удалось загрузить статус</div>
      </div>
    );
  }

  const completedCount = state.steps.filter(s => s.isCompleted).length;
  const totalCount = state.steps.length;
  const progress = (completedCount / totalCount) * 100;

  return (
    <div className="setup-status-card">
      <div className="setup-status-header">
        <h3>Статус настройки</h3>
        <span className={`setup-status-badge setup-status-${STATUS_COLORS[state.currentStatus]}`}>
          {STATUS_LABELS[state.currentStatus]}
        </span>
      </div>

      <div className="setup-progress-bar">
        <div 
          className="setup-progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="setup-progress-text">
        {completedCount} из {totalCount} этапов завершено
      </div>

      <div className="setup-steps">
        {state.steps.map((step) => (
          <div key={step.step} className={`setup-step ${step.isCompleted ? 'completed' : 'incomplete'}`}>
            <div className="setup-step-icon">
              {step.isCompleted ? 'Готово' : 'Не готово'}
            </div>
            <div className="setup-step-content">
              <div className="setup-step-label">
                {STEP_LABELS[step.step] || step.step}
              </div>
              {step.completedAt && (
                <div className="setup-step-date">
                  Выполнено: {new Date(step.completedAt).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {state.missingSteps.length > 0 && (
        <div className="setup-missing">
          <strong>Отсутствуют этапы:</strong>
          <ul>
            {state.missingSteps.map(step => (
              <li key={step}>{STEP_LABELS[step] || step}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="setup-error">
           {error}
        </div>
      )}

      <div className="setup-actions">
        <button
          className="btn btn-secondary"
          onClick={handleUpdateStatus}
          disabled={updating}
        >
          {updating ? 'Обновление...' : 'Обновить статус'}
        </button>

        <button
          className="btn btn-primary"
          onClick={handleActivate}
          disabled={!state.canActivate || activating}
          title={!state.canActivate ? 'Завершите все этапы настройки' : 'Активировать продукт'}
        >
          {activating ? 'Активация...' : 'Активировать продукт'}
        </button>
      </div>

      <div className="setup-help">
        <details>
          <summary> Как настроить продукт?</summary>
          <ol>
            <li><strong>Материалы:</strong> Настройте через вкладку "Материалы" в шаблоне продукта</li>
            <li><strong>Операции:</strong> Добавьте операции во вкладке "Операции и цена"</li>
            <li><strong>Активация:</strong> После выполнения всех этапов нажмите "Активировать"</li>
          </ol>
        </details>
      </div>
    </div>
  );
};

