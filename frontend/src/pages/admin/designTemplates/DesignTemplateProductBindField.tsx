import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getProductTemplateConfig } from '../../../services/products';
import { useProductDirectoryStore } from '../../../stores/productDirectoryStore';
import {
  getEffectiveConfig,
  type ProductTypeVariant,
} from '../../../features/productTemplate/hooks/useProductTemplate';
import { EMPTY_PRODUCT_BIND, parseSimplifiedFromConfig, type ProductBindValue } from './designTemplateProductConfig';

type Props = {
  value: ProductBindValue;
  onChange: (value: ProductBindValue) => void;
  requiredSize?: boolean;
  /** Компактный вид в строках семьи (без длинной подсказки) */
  compact?: boolean;
};

export const DesignTemplateProductBindField: React.FC<Props> = ({
  value,
  onChange,
  requiredSize = false,
  compact = false,
}) => {
  const products = useProductDirectoryStore((s) => s.products);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [simplified, setSimplified] = useState<ReturnType<typeof parseSimplifiedFromConfig>>(null);

  useEffect(() => {
    void initializeDirectory();
  }, [initializeDirectory]);

  const loadConfig = useCallback(async (pid: number) => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const cfg = await getProductTemplateConfig(pid);
      const parsed = parseSimplifiedFromConfig(cfg?.config_data as Record<string, unknown> | undefined);
      if (!parsed) {
        setSimplified(null);
        setConfigError('У продукта нет simplified-конфига (размеры в карточке продукта).');
      } else {
        setSimplified(parsed);
      }
    } catch {
      setSimplified(null);
      setConfigError('Не удалось загрузить продукт.');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    const pid = value.productId.trim() ? Number(value.productId) : NaN;
    if (!Number.isFinite(pid)) {
      setSimplified(null);
      setConfigError(null);
      return;
    }
    void loadConfig(pid);
  }, [value.productId, loadConfig]);

  const types: ProductTypeVariant[] = useMemo(() => simplified?.types ?? [], [simplified]);

  useEffect(() => {
    if (!value.productId || types.length === 0) return;
    if (value.typeId && types.some((t) => String(t.id) === value.typeId)) return;
    const def = types.find((t) => t.default) ?? types[0];
    onChange({ productId: value.productId, typeId: String(def.id), sizeId: '' });
  }, [types, value.productId, value.typeId, onChange]);

  const effectiveConfig = useMemo(() => {
    if (!simplified) return null;
    const tid = value.typeId.trim() ? Number(value.typeId) : null;
    return getEffectiveConfig(simplified, simplified.types?.length ? tid : null);
  }, [simplified, value.typeId]);

  const sizes = effectiveConfig?.sizes ?? simplified?.sizes ?? [];

  const setProduct = (productId: string) => {
    onChange({ productId, typeId: '', sizeId: '' });
  };

  const setType = (typeId: string) => {
    onChange({ ...value, typeId, sizeId: '' });
  };

  const setSize = (sizeId: string) => {
    onChange({ ...value, sizeId });
  };

  return (
    <div className={`design-product-bind-field${compact ? ' design-product-bind-field--compact' : ''}`}>
      <div className="design-product-bind-field__row">
        <label>
          Продукт
          <select value={value.productId} onChange={(e) => setProduct(e.target.value)}>
            <option value="">— не привязан —</option>
            {products.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>
        {value.productId && types.length > 0 && (
          <label>
            Подтип
            <select value={value.typeId} onChange={(e) => setType(e.target.value)}>
              <option value="">—</option>
              {types.map((t) => (
                <option key={String(t.id)} value={String(t.id)}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        {value.productId && sizes.length > 0 && (
          <label>
            Размер{requiredSize ? ' *' : ''}
            <select value={value.sizeId} onChange={(e) => setSize(e.target.value)}>
              <option value="">—</option>
              {sizes.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {s.label}
                  {s.width_mm && s.height_mm ? ` (${s.width_mm}×${s.height_mm} мм)` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {configLoading && <p className="design-product-bind-field__hint">Загрузка конфига продукта…</p>}
      {configError && <p className="design-product-bind-field__error">{configError}</p>}
      {value.productId && !configLoading && !configError && sizes.length === 0 && simplified && (
        <p className="design-product-bind-field__hint">Нет размеров у выбранного подтипа.</p>
      )}
      {!compact && (
        <p className="design-product-bind-field__hint">
          Для появления на сайте нужна привязка в матрице размеров (вкладка «Привязки» или «Дизайн» в продукте).
          {requiredSize ? ' При импорте укажите размер — иначе запись только в каталоге.' : ''}
        </p>
      )}
    </div>
  );
};
