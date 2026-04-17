import React, { useState, useEffect } from 'react';
import { getPriceTypes } from '../../../services/pricing';
import type { PriceType } from '../../../types/pricing';
import './AllowedPriceTypesSection.css';

const formatMultiplier = (m: number) => {
  if (m >= 1) return `×${m} (+${((m - 1) * 100).toFixed(0)}%)`;
  return `×${m} (−${((1 - m) * 100).toFixed(1)}%)`;
};

interface AllowedPriceTypesSectionProps {
  selectedKeys: string[];
  saving: boolean;
  onChange: (keys: string[]) => void;
  onSave: () => Promise<void> | void;
}

export const AllowedPriceTypesSection: React.FC<AllowedPriceTypesSectionProps> = ({
  selectedKeys,
  saving,
  onChange,
  onSave,
}) => {
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPriceTypes(true)
      .then(setPriceTypes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    if (selectedKeys.includes(key)) {
      const next = selectedKeys.filter((x) => x !== key);
      if (next.length === 0) return;
      onChange(next);
    } else {
      onChange([...selectedKeys, key]);
    }
  };

  if (loading) {
    return (
      <div className="form-section">
        <p className="form-section__subtitle">Загрузка типов цен…</p>
      </div>
    );
  }

  return (
    <div className="form-section allowed-price-types-section">
      <div className="form-section__header">
        <h3>Разрешённые типы цен</h3>
        <p className="form-section__subtitle">
          Выберите типы цен для этого продукта. Пустой список — в калькуляторе используются все активные типы из справочника (с учётом ограничений подтипа).
        </p>
      </div>
      <div className="form-section__content">
        <div className="apt-list">
          {priceTypes.map((pt) => (
            <label key={pt.key} className="apt-item">
              <input
                type="checkbox"
                checked={selectedKeys.includes(pt.key)}
                onChange={() => toggle(pt.key)}
                disabled={pt.isSystem && selectedKeys.includes(pt.key) && selectedKeys.length <= 1}
              />
              <span className="apt-label">
                {pt.name} ({formatMultiplier(pt.multiplier)})
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};
