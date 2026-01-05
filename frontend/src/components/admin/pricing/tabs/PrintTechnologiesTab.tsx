import React, { useState, useCallback } from 'react';
import { Button, FormField, StatusBadge, Modal } from '../../../common';
import { api } from '../../../../api';
import { numberInputFromString, type NumberInputValue } from '../../../../utils/numberInput';
import type { PrintTechnology, PricingMode } from '../types';

interface PrintTechnologiesTabProps {
  printTechnologies: PrintTechnology[];
  loading: boolean;
  onLoadData: () => Promise<void>;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

type TechFormState = Omit<Partial<PrintTechnology>, 'price_single' | 'price_duplex' | 'price_per_meter'> & {
  price_single?: NumberInputValue | null;
  price_duplex?: NumberInputValue | null;
  price_per_meter?: NumberInputValue | null;
};

const PrintTechnologiesTabComponent: React.FC<PrintTechnologiesTabProps> = ({
  printTechnologies,
  loading,
  onLoadData,
  onError,
  onSuccess,
}) => {
  const [techForm, setTechForm] = useState<TechFormState>({ 
    pricing_mode: 'per_sheet', 
    supports_duplex: 1, 
    is_active: 1 
  });
  const [newTechForm, setNewTechForm] = useState<TechFormState>({ 
    pricing_mode: 'per_sheet', 
    supports_duplex: 1, 
    is_active: 1 
  });
  const [editingTechCode, setEditingTechCode] = useState<string | null>(null);
  const [deleteTechCode, setDeleteTechCode] = useState<string | null>(null);

  const startEditTech = (tech: PrintTechnology) => {
    setEditingTechCode(tech.code);
    setTechForm({
      ...tech,
      pricing_mode: tech.pricing_mode,
      supports_duplex: tech.supports_duplex,
      is_active: tech.is_active,
    });
  };

  const cancelEditTech = () => {
    setEditingTechCode(null);
    setTechForm({ pricing_mode: 'per_sheet', supports_duplex: 1, is_active: 1 });
  };

  const saveTech = async () => {
    if (!editingTechCode) return;
    try {
      await api.put(`/printing-technologies/${editingTechCode}`, {
        name: techForm.name,
        pricing_mode: techForm.pricing_mode,
        supports_duplex: techForm.supports_duplex,
        is_active: techForm.is_active,
      });
      await onLoadData();
      cancelEditTech();
      onSuccess('Сохранено');
    } catch (error) {
      onError('Ошибка сохранения типа печати');
      console.error('Error saving print technology:', error);
    }
  };

  const createTech = async () => {
    if (!newTechForm.code || !newTechForm.name || !newTechForm.pricing_mode) {
      onError('Укажите код, название и режим ценообразования');
      return;
    }
    try {
      await api.post('/printing-technologies', {
        code: newTechForm.code,
        name: newTechForm.name,
        pricing_mode: newTechForm.pricing_mode,
        supports_duplex: newTechForm.supports_duplex,
        is_active: newTechForm.is_active,
      });
      setNewTechForm({ pricing_mode: 'per_sheet', supports_duplex: 1, is_active: 1 });
      await onLoadData();
      onSuccess('Тип печати добавлен');
    } catch (error) {
      onError('Ошибка добавления типа печати');
      console.error('Error creating print technology:', error);
    }
  };

  const confirmDeleteTech = async () => {
    if (!deleteTechCode) return;
    try {
      await api.delete(`/printing-technologies/${deleteTechCode}`);
      setDeleteTechCode(null);
      await onLoadData();
      onSuccess('Тип печати удалён');
    } catch (error) {
      onError('Ошибка удаления типа печати');
      console.error('Error deleting print technology:', error);
    }
  };

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Типы печати</h3>
        <p>Настройте режим расчёта для технологии. Цены печати задаются только во вкладке "Цены печати".</p>
      </div>

      <div className="data-card">
        <div className="card-header">
          <div className="card-title">
            <h4>Добавить новый тип печати</h4>
          </div>
          <div className="card-actions">
            <Button variant="primary" size="sm" onClick={createTech} loading={loading}>
              Создать
            </Button>
          </div>
        </div>
        <div className="card-content">
          <div className="field-group">
            <FormField label="Код">
              <input
                className="form-control"
                value={newTechForm.code || ''}
                onChange={(e) => setNewTechForm({ ...newTechForm, code: e.target.value })}
                placeholder="laser_sheet"
              />
            </FormField>
            <FormField label="Название">
              <input
                className="form-control"
                value={newTechForm.name || ''}
                onChange={(e) => setNewTechForm({ ...newTechForm, name: e.target.value })}
                placeholder="Лазерный листовой"
              />
            </FormField>
            <FormField label="Режим ценообразования">
              <select
                className="form-control"
                value={newTechForm.pricing_mode || 'per_sheet'}
                onChange={(e) => setNewTechForm({ ...newTechForm, pricing_mode: e.target.value as PricingMode })}
              >
                <option value="per_sheet">Цена за лист</option>
                <option value="per_meter">Цена за погонный метр</option>
              </select>
            </FormField>
            <FormField label="Двусторонняя поддержка">
              <select
                className="form-control"
                value={(newTechForm.supports_duplex ?? 1) ? 1 : 0}
                onChange={(e) => setNewTechForm({ ...newTechForm, supports_duplex: Number(e.target.value) })}
              >
                <option value={1}>Да</option>
                <option value={0}>Нет</option>
              </select>
            </FormField>
            <FormField label="Активность">
              <select
                className="form-control"
                value={(newTechForm.is_active ?? 1) ? 1 : 0}
                onChange={(e) => setNewTechForm({ ...newTechForm, is_active: Number(e.target.value) })}
              >
                <option value={1}>Активен</option>
                <option value={0}>Выключен</option>
              </select>
            </FormField>
            <FormField label="Цена печати">
              <span className="field-value">Цены задаются во вкладке "Цены печати"</span>
            </FormField>
          </div>
        </div>
      </div>

      <div className="data-grid">
        {printTechnologies.map((tech) => (
          <div key={tech.code} className="data-card">
            <div className="card-header">
              <div className="card-title">
                <h4>{tech.name}</h4>
                <StatusBadge status={tech.is_active ? 'active' : 'inactive'} />
              </div>
              {editingTechCode === tech.code ? (
                <div className="card-actions">
                  <Button variant="success" size="sm" onClick={saveTech} loading={loading}>
                    Сохранить
                  </Button>
                  <Button variant="secondary" size="sm" onClick={cancelEditTech}>
                    Отмена
                  </Button>
                </div>
              ) : (
                <div className="card-actions">
                  <Button variant="primary" size="sm" onClick={() => startEditTech(tech)}>
                    Изменить
                  </Button>
                  <Button variant="error" size="sm" onClick={() => setDeleteTechCode(tech.code)}>
                    Удалить
                  </Button>
                </div>
              )}
            </div>

            <div className="card-content">
              {editingTechCode === tech.code ? (
                <div className="field-group">
                  <FormField label="Название">
                    <input
                      className="form-control"
                      value={techForm.name || ''}
                      onChange={(e) => setTechForm({ ...techForm, name: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Режим ценообразования">
                    <select
                      className="form-control"
                      value={techForm.pricing_mode || 'per_sheet'}
                      onChange={(e) => setTechForm({ ...techForm, pricing_mode: e.target.value as PricingMode })}
                    >
                      <option value="per_sheet">Цена за лист</option>
                      <option value="per_meter">Цена за пог. метр</option>
                    </select>
                  </FormField>
                  <FormField label="Двусторонняя поддержка">
                    <select
                      className="form-control"
                      value={(techForm.supports_duplex ?? tech.supports_duplex) ? 1 : 0}
                      onChange={(e) => setTechForm({ ...techForm, supports_duplex: Number(e.target.value) })}
                    >
                      <option value={1}>Да</option>
                      <option value={0}>Нет</option>
                    </select>
                  </FormField>
                  <FormField label="Стоимость печати">
                    <span className="field-value">Цены задаются во вкладке "Цены печати"</span>
                  </FormField>
                  <FormField label="Активность">
                    <select
                      className="form-control"
                      value={(techForm.is_active ?? tech.is_active) ? 1 : 0}
                      onChange={(e) => setTechForm({ ...techForm, is_active: Number(e.target.value) })}
                    >
                      <option value={1}>Активен</option>
                      <option value={0}>Выключен</option>
                    </select>
                  </FormField>
                </div>
              ) : (
                <div className="field-group">
                  <FormField label="Режим">
                    <span className="field-value">
                      {tech.pricing_mode === 'per_sheet' ? 'Цена за лист' : 'Цена за пог. метр'}
                    </span>
                  </FormField>
                  <FormField label="Двусторонняя поддержка">
                    <span className="field-value">{tech.supports_duplex ? 'Да' : 'Нет'}</span>
                  </FormField>
                  <FormField label="Стоимость печати">
                    <span className="field-value">Задаётся в принтере</span>
                  </FormField>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!deleteTechCode}
        onClose={() => setDeleteTechCode(null)}
        title="Удалить тип печати?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="text-secondary">
            Это действие удалит тип печати и отвяжет его от принтеров (если был выбран).
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTechCode(null)}>
              Отмена
            </Button>
            <Button variant="error" onClick={confirmDeleteTech} loading={loading}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export const PrintTechnologiesTab = React.memo(PrintTechnologiesTabComponent);
PrintTechnologiesTab.displayName = 'PrintTechnologiesTab';

