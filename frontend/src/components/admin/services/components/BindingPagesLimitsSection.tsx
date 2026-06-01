import React, { useCallback, useMemo, useState } from 'react';
import { VariantWithTiers } from './ServiceVariantsTable.types';
import { readBindingPagesLimits } from '../../../../utils/multipageBinding';
import './ServiceVariantsTable.css';

type OperationsApi = {
  updateVariantParams: (variantId: number, params: Record<string, unknown>) => void;
};

interface BindingPagesLimitsSectionProps {
  variants: VariantWithTiers[];
  operations: OperationsApi;
}

export const BindingPagesLimitsSection: React.FC<BindingPagesLimitsSectionProps> = ({
  variants,
  operations,
}) => {
  const leafVariants = useMemo(
    () =>
      variants.filter((v) => v.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [variants],
  );

  const [draft, setDraft] = useState<Record<number, { min: string; max: string }>>({});

  const getDraft = useCallback(
    (variant: VariantWithTiers) => {
      if (draft[variant.id]) return draft[variant.id];
      const limits = readBindingPagesLimits(variant.parameters);
      return {
        min: limits.minPages != null ? String(limits.minPages) : '',
        max: limits.maxPages != null ? String(limits.maxPages) : '',
      };
    },
    [draft],
  );

  const commit = useCallback(
    (variant: VariantWithTiers) => {
      const row = getDraft(variant);
      const min = row.min.trim() === '' ? undefined : Math.floor(Number(row.min));
      const max = row.max.trim() === '' ? undefined : Math.floor(Number(row.max));
      const nextParams = { ...(variant.parameters || {}) };
      if (min != null && Number.isFinite(min) && min > 0) nextParams.min_pages = min;
      else delete nextParams.min_pages;
      if (max != null && Number.isFinite(max) && max > 0) nextParams.max_pages = max;
      else delete nextParams.max_pages;
      operations.updateVariantParams(variant.id, nextParams);
      setDraft((prev) => {
        const copy = { ...prev };
        delete copy[variant.id];
        return copy;
      });
    },
    [getDraft, operations],
  );

  if (leafVariants.length === 0) return null;

  return (
    <div className="binding-pages-limits-section">
      <div className="binding-pages-limits-section__header">
        <strong>Лимиты страниц для переплёта</strong>
        <p className="binding-pages-limits-section__hint">
          Проверяется в калькуляторе для многостраничных продуктов с этим вариантом переплёта.
        </p>
      </div>
      <div className="binding-pages-limits-section__body">
        <table className="binding-pages-limits-table">
          <thead>
            <tr>
              <th>Вариант</th>
              <th>Мин. стр.</th>
              <th>Макс. стр.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leafVariants.map((variant) => {
              const row = getDraft(variant);
              return (
                <tr key={variant.id}>
                  <td>{variant.variantName}</td>
                  <td>
                    <input
                      type="number"
                      className="form-input form-input--compact"
                      min={1}
                      placeholder="—"
                      value={row.min}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [variant.id]: { ...getDraft(variant), min: e.target.value },
                        }))
                      }
                      onBlur={() => commit(variant)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-input form-input--compact"
                      min={1}
                      placeholder="—"
                      value={row.max}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [variant.id]: { ...getDraft(variant), max: e.target.value },
                        }))
                      }
                      onBlur={() => commit(variant)}
                    />
                  </td>
                  <td>
                    <button type="button" className="el-button el-button--mini" onClick={() => commit(variant)}>
                      OK
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
