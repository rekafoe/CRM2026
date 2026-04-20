import React, { type Dispatch, type SetStateAction } from 'react';
import { usePostprintServiceCard } from './hooks/usePostprintServiceCard';
import type { PostprintServiceOption } from './postprintTypes';

interface PostprintServiceCardProps {
  service: PostprintServiceOption;
  postprintSelections: Record<string, number>;
  setPostprintSelections: Dispatch<SetStateAction<Record<string, number>>>;
  getOperationUnitPrice: (op: unknown, qty: number) => number;
}

export const PostprintServiceCard: React.FC<PostprintServiceCardProps> = ({
  service,
  postprintSelections,
  setPostprintSelections,
  getOperationUnitPrice,
}) => {
  const {
    hasTreeParents,
    mergedParents,
    typeOptions,
    selectedType,
    legacySubtypeOptions,
    parentIdForUi,
    subtypeOptions,
    selectedSubtype,
    rawQty,
    isChecked,
    minQuantity,
    maxQuantity,
    unitPrice,
    handleToggle,
    handleLegacyTypeChange,
    handleTreeParentChange,
    handleSubtypeChange,
    handleQtyChange,
    handleQtyStep,
    showFirstSelect,
    showSecondSelect,
  } = usePostprintServiceCard(
    service,
    postprintSelections,
    setPostprintSelections,
    getOperationUnitPrice
  );

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
            {showFirstSelect && hasTreeParents && (
              <label className="postprint-variant-field">
                <span className="postprint-variant-label">Группа</span>
                <select
                  className="postprint-variant-select"
                  value={String(parentIdForUi)}
                  onChange={(event) => handleTreeParentChange(Number(event.target.value))}
                >
                  {mergedParents.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showFirstSelect && !hasTreeParents && (
              <label className="postprint-variant-field">
                <span className="postprint-variant-label">Тип ламинации</span>
                <select
                  className="postprint-variant-select"
                  value={selectedType}
                  onChange={(event) => handleLegacyTypeChange(event.target.value)}
                >
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showSecondSelect && (
              <label className="postprint-variant-field">
                <span className="postprint-variant-label">
                  {hasTreeParents ? 'Вариант' : 'Плотность'}
                </span>
                <select
                  className="postprint-variant-select"
                  value={selectedSubtype?.key || ''}
                  onChange={(event) => handleSubtypeChange(event.target.value)}
                >
                  {(hasTreeParents ? subtypeOptions : legacySubtypeOptions).map((variant) => {
                    const subtypeLabel = String(
                      variant.parameters?.subType ||
                        variant.parameters?.density ||
                        variant.label ||
                        'Вариант'
                    ).trim();
                    return (
                      <option key={variant.key} value={variant.key}>
                        {subtypeLabel}
                      </option>
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
              >
                -
              </button>
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
              >
                +
              </button>
            </div>
          </div>
          <div className="postprint-quantity-spacer" aria-hidden="true" />
        </div>
      )}
    </div>
  );
};
