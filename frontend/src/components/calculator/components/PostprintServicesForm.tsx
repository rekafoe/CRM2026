import React from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { SelectedProductCard } from './SelectedProductCard';

interface PostprintVariantOption {
  key: string;
  variantId: number;
  label: string;
  parameters: Record<string, any>;
  tiers: any[];
  minQuantity?: number;
  maxQuantity?: number;
}

interface PostprintServiceOption {
  serviceId: number;
  name: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  tiers: any[];
  variants: PostprintVariantOption[];
  minQuantity?: number;
  maxQuantity?: number;
  categoryId?: number | null;
  categoryName?: string;
}

interface PostprintCategory {
  categoryName: string;
  services: PostprintServiceOption[];
}

interface PostprintServicesFormProps {
  selectedProductName: string;
  onOpenProductSelector: () => void;
  postprintLoading: boolean;
  postprintError: string | null;
  postprintServices: PostprintServiceOption[];
  postprintByCategory: PostprintCategory[];
  postprintSelections: Record<string, number>;
  setPostprintSelections: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getOperationUnitPrice: (op: any, qty: number) => number;
}

export const PostprintServicesForm: React.FC<PostprintServicesFormProps> = ({
  selectedProductName,
  onOpenProductSelector,
  postprintLoading,
  postprintError,
  postprintServices,
  postprintByCategory,
  postprintSelections,
  setPostprintSelections,
  getOperationUnitPrice,
}) => (
  <div className="calculator-section-group calculator-section-unified">
    <div className="section-group-header">
      <h3><AppIcon name="wrench" size="xs" /> Послепечатные услуги</h3>
    </div>
    <div className="section-group-content">
      <SelectedProductCard
        productType="postprint"
        displayName={selectedProductName || 'Послепечатные услуги'}
        onOpenSelector={onOpenProductSelector}
      />
      <div className="form-section postprint-services-form">
        {postprintLoading && (
          <div className="postprint-services-loading">Загрузка операций...</div>
        )}
        {postprintError && !postprintLoading && (
          <div className="postprint-services-error">{postprintError}</div>
        )}
        {!postprintLoading && !postprintError && (
          <div className="postprint-services-list">
            {postprintServices.length === 0 ? (
              <div className="postprint-services-empty">Нет доступных операций</div>
            ) : (
              postprintByCategory.map((group) => (
                <div key={group.categoryName} className="postprint-category-group">
                  <h3 className="postprint-category-group__title">{group.categoryName}</h3>
                  {group.services.map((service) => (
                    <PostprintServiceCard
                      key={String(service.serviceId)}
                      service={service}
                      postprintSelections={postprintSelections}
                      setPostprintSelections={setPostprintSelections}
                      getOperationUnitPrice={getOperationUnitPrice}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

interface PostprintServiceCardProps {
  service: PostprintServiceOption;
  postprintSelections: Record<string, number>;
  setPostprintSelections: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getOperationUnitPrice: (op: any, qty: number) => number;
}

const PostprintServiceCard: React.FC<PostprintServiceCardProps> = ({
  service,
  postprintSelections,
  setPostprintSelections,
  getOperationUnitPrice,
}) => {
  const serviceKey = String(service.serviceId);
  const serviceKeyPrefix = `${service.serviceId}:`;
  const selectedVariantKey = Object.keys(postprintSelections).find((key) =>
    key.startsWith(serviceKeyPrefix)
  );
  const selectedVariant =
    service.variants.find((variant) => variant.key === selectedVariantKey) ||
    service.variants[0];
  const variantTypes = service.variants.reduce<Record<string, PostprintVariantOption[]>>(
    (acc, variant) => {
      const typeLabel = String(
        variant.parameters?.type || variant.label || 'Вариант'
      ).trim();
      if (!acc[typeLabel]) acc[typeLabel] = [];
      acc[typeLabel].push(variant);
      return acc;
    },
    {}
  );
  const typeOptions = Object.keys(variantTypes);
  const selectedType =
    selectedVariant?.parameters?.type || typeOptions[0] || '';
  const subtypeOptions =
    typeOptions.length > 0
      ? (variantTypes[selectedType] || variantTypes[typeOptions[0]] || [])
      : service.variants;
  const selectedSubtype =
    subtypeOptions.find((variant) => variant.key === selectedVariantKey) ||
    subtypeOptions[0];
  const currentKey = service.variants.length > 0 ? selectedSubtype?.key : serviceKey;
  const rawQty = currentKey ? postprintSelections[currentKey] : undefined;
  const qty = Number(rawQty || 0);
  const isChecked = service.variants.length > 0 ? Boolean(selectedVariantKey) : qty > 0;
  const priceTiers =
    service.variants.length > 0 ? selectedSubtype?.tiers || [] : service.tiers;
  const minQuantity = service.minQuantity ?? 1;
  const maxQuantity = service.maxQuantity;

  const clampQuantity = (value: number) => {
    let next = Math.max(minQuantity, Number.isFinite(value) ? value : minQuantity);
    if (typeof maxQuantity === 'number' && !Number.isNaN(maxQuantity)) {
      next = Math.min(next, maxQuantity);
    }
    return next;
  };

  const unitPrice = getOperationUnitPrice(
    {
      key: currentKey || serviceKey,
      serviceId: service.serviceId,
      variantId: selectedSubtype?.variantId,
      name: service.name,
      unit: service.unit,
      priceUnit: service.priceUnit,
      rate: service.rate,
      tiers: priceTiers,
    },
    clampQuantity(qty || minQuantity)
  );

  const handleToggle = (checked: boolean) => {
    setPostprintSelections((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key === serviceKey || key.startsWith(serviceKeyPrefix)) {
          delete next[key];
        }
      });
      if (checked) {
        const preferredKey =
          service.variants.length > 0
            ? (selectedVariant?.key || service.variants[0]?.key)
            : serviceKey;
        if (preferredKey) {
          const baseQty = prev[preferredKey] || minQuantity;
          next[preferredKey] = clampQuantity(baseQty);
        }
      }
      return next;
    });
  };

  const handleTypeChange = (nextType: string) => {
    const nextVariant = (variantTypes[nextType] || [])[0];
    setPostprintSelections((prev) => {
      const next = { ...prev };
      const prevQty = selectedVariantKey ? prev[selectedVariantKey] : 1;
      Object.keys(next).forEach((key) => {
        if (key === serviceKey || key.startsWith(serviceKeyPrefix)) {
          delete next[key];
        }
      });
      if (nextVariant?.key) {
        next[nextVariant.key] = clampQuantity(prevQty || minQuantity);
      }
      return next;
    });
  };

  const handleSubtypeChange = (nextKey: string) => {
    setPostprintSelections((prev) => {
      const next = { ...prev };
      const prevQty = selectedVariantKey ? prev[selectedVariantKey] : 1;
      Object.keys(next).forEach((key) => {
        if (key === serviceKey || key.startsWith(serviceKeyPrefix)) {
          delete next[key];
        }
      });
      if (nextKey) {
        next[nextKey] = clampQuantity(prevQty || minQuantity);
      }
      return next;
    });
  };

  const handleQtyChange = (raw: string) => {
    setPostprintSelections((prev) => {
      const next = { ...prev };
      const targetKey = currentKey || serviceKey;
      if (!targetKey) return next;
      if (raw === '') {
        delete next[targetKey];
        return next;
      }
      next[targetKey] = clampQuantity(Number(raw));
      return next;
    });
  };

  const handleQtyStep = (delta: number) => {
    const nextQty = clampQuantity(qty + delta);
    setPostprintSelections((prev) => ({
      ...prev,
      [currentKey || serviceKey]: nextQty,
    }));
  };

  return (
    <div className="postprint-service-card">
      <div className="postprint-service-row">
        <div className="postprint-service-left">
          <label className="postprint-service-checkbox">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => handleToggle(event.target.checked)}
            />
            <span className="postprint-service-name">{service.name}</span>
          </label>
        </div>
        <div className="postprint-service-meta">
          <span className="postprint-service-price">
            {unitPrice.toFixed(2)} BYN / {service.priceUnit || service.unit || 'шт'}
          </span>
        </div>
      </div>
      {isChecked && service.variants.length > 0 && (
        <div className="postprint-variant-row">
          <div className="postprint-service-left">
            {typeOptions.length > 1 && (
              <label className="postprint-variant-field">
                <span className="postprint-variant-label">Тип ламинации</span>
                <select
                  className="postprint-variant-select"
                  value={selectedType}
                  onChange={(event) => handleTypeChange(event.target.value)}
                >
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
            )}
            {subtypeOptions.length > 1 && (
              <label className="postprint-variant-field">
                <span className="postprint-variant-label">Плотность</span>
                <select
                  className="postprint-variant-select"
                  value={selectedSubtype?.key || ''}
                  onChange={(event) => handleSubtypeChange(event.target.value)}
                >
                  {subtypeOptions.map((variant) => {
                    const subtypeLabel = String(
                      variant.parameters?.subType ||
                        variant.parameters?.density ||
                        variant.label ||
                        'Вариант'
                    ).trim();
                    return (
                      <option key={variant.key} value={variant.key}>{subtypeLabel}</option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>
          <div className="postprint-quantity-spacer" aria-hidden="true" />
        </div>
      )}
      {isChecked && (
        <div className="postprint-quantity-row">
          <div className="postprint-service-left">
            <div className="quantity-controls">
              <button
                type="button"
                className="quantity-btn quantity-btn-minus"
                onClick={() => handleQtyStep(-1)}
              >-</button>
              <input
                type="number"
                min={minQuantity}
                max={typeof maxQuantity === 'number' ? maxQuantity : undefined}
                value={rawQty ?? ''}
                placeholder="Кол-во"
                className="quantity-input"
                onChange={(event) => handleQtyChange(event.target.value)}
              />
              <button
                type="button"
                className="quantity-btn quantity-btn-plus"
                onClick={() => handleQtyStep(1)}
              >+</button>
            </div>
          </div>
          <div className="postprint-quantity-spacer" aria-hidden="true" />
        </div>
      )}
    </div>
  );
};
