import React, { useState, useEffect, useCallback } from 'react';
import { Button, FormField } from '../../common';
import { api } from '../../../api';
import './AutoCuttingPriceSection.css';

interface MarkupSetting {
  id: number;
  setting_name: string;
  setting_value: number;
  description?: string | null;
  is_active?: number;
}

export const AutoCuttingPriceSection: React.FC = () => {
  const [setting, setSetting] = useState<MarkupSetting | null>(null);
  const [value, setValue] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<MarkupSetting[]>('/pricing/markup-settings');
      const list = Array.isArray(res?.data) ? res.data : [];
      const found = list.find((s) => s.setting_name === 'auto_cutting_price') ?? null;
      setSetting(found ?? null);
      setValue(found ? String(found.setting_value) : '0');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setSetting(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!setting) return;
    const num = parseFloat(value.replace(',', '.'));
    if (Number.isNaN(num) || num < 0) {
      setError('Введите корректное число (≥ 0)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.put(`/pricing/markup-settings/${setting.id}`, { setting_value: num });
      setSetting((prev) => (prev ? { ...prev, setting_value: num } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="auto-cutting-price-section">
        <div className="auto-cutting-price-section__skeleton">Загрузка...</div>
      </div>
    );
  }

  if (!setting) {
    return null;
  }

  return (
    <div className="auto-cutting-price-section">
      <div className="auto-cutting-price-section__card">
        <div className="auto-cutting-price-section__header">
          <h3>✂️ Цена автоматической резки</h3>
          <p className="auto-cutting-price-section__desc">
            Цена за рез стопой (руб) — для автоматической резки по раскладке в упрощённом калькуляторе. 0 = брать цену из услуги резки.
          </p>
        </div>
        <div className="auto-cutting-price-section__body">
          <FormField label="Цена за рез (руб)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="form-control auto-cutting-price-section__input"
            />
          </FormField>
          {error && <p className="auto-cutting-price-section__error">{error}</p>}
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};
