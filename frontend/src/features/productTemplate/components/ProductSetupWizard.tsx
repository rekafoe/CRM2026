import React, { useState, useEffect } from 'react';
import { apiClient } from '../../../api/client';
import { Button, Alert, Modal } from '../../../components/common';
import { getAxiosErrorMessage } from '../../../utils/errorUtils';
import './ProductSetupWizard.css';

export type SetupStatus = 'draft' | 'materials_configured' | 'operations_configured' | 'ready';

interface SetupStep {
  step: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface ProductSetupState {
  productId: number;
  productName: string;
  currentStatus: SetupStatus;
  canActivate: boolean;
  steps: SetupStep[];
  missingSteps: string[];
}

interface ProductSetupWizardProps {
  productId: number;
  onComplete?: () => void;
  onNavigateToStep?: (step: string) => void;
}

const STEP_LABELS: Record<string, { label: string; tab: string; description: string }> = {
  product_type: { label: 'Тип продукта', tab: 'structure', description: 'Установите основные параметры продукта' },
  materials: { label: 'Материалы', tab: 'materials', description: 'Добавьте материалы для продукта' },
  operations: { label: 'Операции', tab: 'operations', description: 'Настройте технологические операции' },
  pricing_rules: { label: 'Правила ценообразования', tab: 'pricing', description: 'Настройте правила ценообразования' }
};

const STEP_ORDER = ['product_type', 'materials', 'operations', 'pricing_rules'];

export const ProductSetupWizard: React.FC<ProductSetupWizardProps> = ({ 
  productId, 
  onComplete,
  onNavigateToStep 
}) => {
  const [setupState, setSetupState] = useState<ProductSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/products/${productId}/setup-status`);
      if (response.data.success) {
        const state = response.data.data;
        setSetupState(state);
        // Показываем мастер, если есть незавершенные шаги
        const hasIncompleteSteps = state.missingSteps.length > 0;
        setShowWizard(hasIncompleteSteps);
      }
    } catch (err: unknown) {
      console.error('Ошибка загрузки статуса настройки:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      loadStatus();
    }
  }, [productId]);

  if (loading || !setupState || !showWizard) {
    return null;
  }

  const completedCount = setupState.steps.filter(s => s.isCompleted).length;
  const totalCount = setupState.steps.length;
  const progress = (completedCount / totalCount) * 100;

  // Находим первый незавершенный шаг
  const nextStep = STEP_ORDER.find(stepKey => 
    setupState.steps.find(s => s.step === stepKey && !s.isCompleted)
  );

  const handleNavigateToStep = (stepKey: string) => {
    const stepInfo = STEP_LABELS[stepKey];
    if (stepInfo && onNavigateToStep) {
      onNavigateToStep(stepInfo.tab);
      setShowWizard(false);
    }
  };

  const handleClose = () => {
    setShowWizard(false);
  };

  const handleComplete = () => {
    setShowWizard(false);
    onComplete?.();
  };

  return (
    <Modal
      isOpen={showWizard}
      onClose={handleClose}
      title="🎯 Мастер настройки продукта"
      size="lg"
    >
      <div className="setup-wizard">
        <div className="setup-wizard-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">
            {completedCount} из {totalCount} шагов завершено ({Math.round(progress)}%)
          </div>
        </div>

        <div className="setup-wizard-steps">
          {STEP_ORDER.map((stepKey, index) => {
            const step = setupState.steps.find(s => s.step === stepKey);
            const stepInfo = STEP_LABELS[stepKey];
            const isCompleted = step?.isCompleted ?? false;
            const isNext = stepKey === nextStep;

            return (
              <div 
                key={stepKey} 
                className={`setup-wizard-step ${isCompleted ? 'completed' : ''} ${isNext ? 'next' : ''}`}
              >
                <div className="step-number">{index + 1}</div>
                <div className="step-content">
                  <div className="step-header">
                    <h4>{stepInfo.label}</h4>
                    {isCompleted ? (
                      <span className="step-status completed">✅ Завершено</span>
                    ) : (
                      <span className="step-status incomplete">⭕ Не завершено</span>
                    )}
                  </div>
                  <p className="step-description">{stepInfo.description}</p>
                  {isNext && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleNavigateToStep(stepKey)}
                    >
                      Перейти к настройке →
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {setupState.canActivate && (
          <Alert type="success" style={{ marginTop: '16px' }}>
            🎉 Все шаги завершены! Продукт готов к использованию.
          </Alert>
        )}

        <div className="setup-wizard-actions">
          <Button variant="secondary" onClick={handleClose}>
            Закрыть
          </Button>
          {setupState.canActivate && (
            <Button variant="primary" onClick={handleComplete}>
              Завершить настройку
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

