import React, { useEffect, useMemo, useState } from 'react';
import { getPriceTypes } from '../../../services/pricing';
import type { PriceType } from '../../../types/pricing';
import { subtypePriceTypesMatchProduct } from '../../../components/calculator/utils/simplifiedConfig';
import './AllowedPriceTypesSection.css';

const formatMultiplier = (m: number) => {
  if (m >= 1) return `×${m} (+${((m - 1) * 100).toFixed(0)}%)`;
  return `×${m} (−${((1 - m) * 100).toFixed(1)}%)`;
};

function sameKeySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((k) => s.has(k));
}

interface SubtypeAllowedPriceTypesFieldProps {
  /** Разрешённые для продукта ключи; пустой массив — ориентир на активные типы из справочника */
  productAllowedKeys: string[];
  /** Явное ограничение подтипа; undefined — без отдельного ограничения (как пул у продукта или весь справочник) */
  subtypeExplicit: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}

export const SubtypeAllowedPriceTypesField: React.FC<SubtypeAllowedPriceTypesFieldProps> = ({
  productAllowedKeys,
  subtypeExplicit,
  onChange,
}) => {
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [loading, setLoading] = useState(true);

  const catalogActiveKeys = useMemo(
    () => priceTypes.filter((pt) => pt.isActive).map((pt) => pt.key),
    [priceTypes]
  );

  const productOrder = useMemo(() => {
    const fromProduct = productAllowedKeys.filter((k) => typeof k === 'string' && k.length > 0);
    if (fromProduct.length > 0) return fromProduct;
    return catalogActiveKeys;
  }, [productAllowedKeys, catalogActiveKeys]);

  useEffect(() => {
    getPriceTypes(true)
      .then(setPriceTypes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const options = useMemo(() => {
    const set = new Set(productOrder);
    return priceTypes.filter((pt) => pt.isActive && set.has(pt.key));
  }, [priceTypes, productOrder]);

  const effectiveSelected = useMemo(() => {
    if (subtypeExplicit?.length) {
      const subSet = new Set(subtypeExplicit);
      const intersected = productOrder.filter((k) => subSet.has(k));
      return intersected.length > 0 ? intersected : productOrder;
    }
    return productOrder;
  }, [subtypeExplicit, productOrder]);

  const toggle = (key: string) => {
    const has = effectiveSelected.includes(key);
    let next: string[];
    if (has) {
      next = effectiveSelected.filter((k) => k !== key);
      if (next.length === 0) return;
    } else {
      next = [...effectiveSelected, key];
    }
    const ordered = productOrder.filter((k) => next.includes(k));
    const productPool = productAllowedKeys.filter((k) => typeof k === 'string' && k.length > 0);
    const matchesFullPool =
      productPool.length > 0
        ? subtypePriceTypesMatchProduct(ordered, productPool)
        : sameKeySet(ordered, catalogActiveKeys);
    if (matchesFullPool) onChange(undefined);
    else onChange(ordered);
  };

  if (loading) {
    return <p className="form-section__subtitle">Загрузка типов цен…</p>;
  }

  if (options.length === 0) {
    return (
      <p className="form-section__subtitle">
        Нет активных типов цен в справочнике. Добавьте их в разделе ценообразования.
      </p>
    );
  }

  return (
    <div className="form-section allowed-price-types-section">
      <div className="form-section__header">
        <h3>Типы цен для этого подтипа</h3>
        <p className="form-section__subtitle">
          Без отдельного списка у подтипа действует пул у продукта; если у продукта список пуст — доступны все
          активные типы из справочника. Снимите лишние чекбоксы, чтобы сузить подтип.
        </p>
      </div>
      <div className="form-section__content">
        <div className="apt-list">
          {options.map((pt) => (
            <label key={pt.key} className="apt-item">
              <input
                type="checkbox"
                checked={effectiveSelected.includes(pt.key)}
                onChange={() => toggle(pt.key)}
                disabled={pt.isSystem && effectiveSelected.includes(pt.key) && effectiveSelected.length <= 1}
              />
              <span className="apt-label">
                {pt.name} ({formatMultiplier(pt.multiplier)})
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
