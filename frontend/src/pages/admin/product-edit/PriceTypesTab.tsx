import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from '../../../components/common';
import { AllowedPriceTypesSection } from '../../../features/productTemplate/components/AllowedPriceTypesSection';
import { getProductTemplateConfig, updateProductConfig, createProductConfig } from '../../../services/products';

interface PriceTypesTabProps {
  productId: number | null;
  /** Регистрация сохранения для кнопки «Сохранить изменения» в шапке страницы */
  onRegisterSave?: (save: (() => Promise<void>) | null) => void;
}

export const PriceTypesTab: React.FC<PriceTypesTabProps> = ({ productId, onRegisterSave }) => {
  const [allowedPriceTypes, setAllowedPriceTypes] = useState<string[]>(['standard', 'online']);
  const [templateConfigId, setTemplateConfigId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!productId) return;
    try {
      setLoading(true);
      setError(null);
      const config = await getProductTemplateConfig(productId);
      if (config) {
        setTemplateConfigId(config.id);
        const overrides = (config.constraints as any)?.overrides;
        const arr = Array.isArray(overrides?.allowed_price_types)
          ? overrides.allowed_price_types.filter((k: any): k is string => typeof k === 'string')
          : null;
        setAllowedPriceTypes(arr && arr.length > 0 ? arr : ['standard', 'online']);
      } else {
        setTemplateConfigId(null);
        setAllowedPriceTypes(['standard', 'online']);
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /** Сохранение без alert (для кнопки в шапке); при ошибке — throw */
  const persistAllowedPriceTypes = useCallback(async () => {
    if (!productId) return;
    setSaving(true);
    setError(null);
    try {
      const config = await getProductTemplateConfig(productId);
      const existingConstraints = (config?.constraints as Record<string, any>) || {};
      const overrides = existingConstraints.overrides || {};
      const newConstraints = {
        ...existingConstraints,
        overrides: {
          ...overrides,
          allowed_price_types: allowedPriceTypes,
        },
      };

      if (config) {
        await updateProductConfig(productId, config.id, {
          constraints: newConstraints,
        });
      } else {
        const created = await createProductConfig(productId, {
          name: 'template',
          config_data: {},
          constraints: newConstraints,
        });
        setTemplateConfigId(created.id);
      }
    } catch (e: any) {
      const msg = e?.message || 'Не удалось сохранить';
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [productId, allowedPriceTypes]);

  const handleSave = useCallback(async () => {
    try {
      await persistAllowedPriceTypes();
      alert('Разрешённые типы цен сохранены');
    } catch {
      /* сообщение уже в setError */
    }
  }, [persistAllowedPriceTypes]);

  useEffect(() => {
    if (!onRegisterSave || !productId) return;
    onRegisterSave(() => persistAllowedPriceTypes());
    return () => onRegisterSave(null);
  }, [onRegisterSave, productId, persistAllowedPriceTypes]);

  if (!productId) return null;

  if (loading) {
    return (
      <div className="product-tab-panel">
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="product-tab-panel">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      <AllowedPriceTypesSection
        selectedKeys={allowedPriceTypes}
        saving={saving}
        onChange={setAllowedPriceTypes}
        onSave={handleSave}
      />
    </div>
  );
};
