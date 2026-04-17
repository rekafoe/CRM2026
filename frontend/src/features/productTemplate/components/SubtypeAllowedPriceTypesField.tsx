import React, { useEffect, useMemo, useState } from 'react';
import { getPriceTypes } from '../../../services/pricing';
import type { PriceType } from '../../../types/pricing';
import { subtypePriceTypesMatchProduct } from '../../../components/calculator/utils/simplifiedConfig';

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
  productAllowedKeys: string[];
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
    return <p className="subtype-price-types-field__hint">Загрузка типов цен…</p>;
  }

  if (options.length === 0) {
    return (
      <p className="subtype-price-types-field__hint">
        Нет активных типов цен в справочнике. Добавьте их в разделе ценообразования.
      </p>
    );
  }

  return (
    <div className="subtype-price-types-field" role="group" aria-label="Типы цен для подтипа">
      {options.map((pt) => {
        const checked = effectiveSelected.includes(pt.key);
        return (
          <label
            key={pt.key}
            className={`subtype-price-types-field__chip${checked ? ' subtype-price-types-field__chip--checked' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(pt.key)}
              disabled={pt.isSystem && checked && effectiveSelected.length <= 1}
            />
            <span className="subtype-price-types-field__chip-text">
              <span className="subtype-price-types-field__name">{pt.name}</span>
              <span className="subtype-price-types-field__mult">{formatMultiplier(pt.multiplier)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
};
