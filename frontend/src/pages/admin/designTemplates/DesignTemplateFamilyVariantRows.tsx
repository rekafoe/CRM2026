import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { addSubtypeDesign, updateDesignTemplate, type DesignTemplate } from '../../../api';
import { DesignTemplateProductBindField } from './DesignTemplateProductBindField';
import { type ProductBindValue } from './designTemplateProductConfig';
import {
  formatTemplateSize,
  getTemplateCatalogStatus,
  parseTemplateSpec,
  type DesignTemplateFamily,
} from './designTemplateCatalogUtils';
import { openSiteSandboxForDesignTemplate } from '../../../features/designTemplates/openSiteSandboxForDesignTemplate';
import { useNavigate } from 'react-router-dom';
import './DesignTemplateFamilyVariantRows.css';

function mergeProductBindIntoSpec(
  template: DesignTemplate,
  bind: { productId: number; typeId: number; sizeId: string },
): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  try {
    if (template.spec) {
      base = typeof template.spec === 'string'
        ? (JSON.parse(template.spec) as Record<string, unknown>)
        : { ...(template.spec as object) };
    }
  } catch {
    base = {};
  }
  return {
    ...base,
    productId: bind.productId,
    typeId: bind.typeId,
    sizeId: bind.sizeId,
  };
}

const STATUS_LABELS = {
  active: 'Активен',
  inactive: 'Неактивен',
  draft: 'Draft',
} as const;

type Props = {
  family: DesignTemplateFamily;
  formatBinding: (parsed: ReturnType<typeof parseTemplateSpec>) => string | null;
  onBound: () => Promise<void>;
  onDelete: (id: number, label?: string) => void | Promise<void>;
};

function bindValueFromTemplate(t: DesignTemplate): ProductBindValue {
  const p = parseTemplateSpec(t);
  return {
    productId: p.productId != null ? String(p.productId) : '',
    typeId: p.typeId != null ? String(p.typeId) : '',
    sizeId: p.sizeId != null ? String(p.sizeId) : '',
  };
}

function VariantRow({
  variant,
  formatBinding,
  onBound,
  onDelete,
}: {
  variant: DesignTemplate;
  formatBinding: Props['formatBinding'];
  onBound: Props['onBound'];
  onDelete: Props['onDelete'];
}) {
  const navigate = useNavigate();
  const parsed = useMemo(() => parseTemplateSpec(variant), [variant]);
  const sizeStr = formatTemplateSize(parsed) ?? 'без размера в SVG';
  const status = getTemplateCatalogStatus(variant);
  const bindingLabel = formatBinding(parsed);
  const linked = (variant.subtype_link_count ?? 0) > 0 || Boolean(parsed.productId && parsed.sizeId);

  const [bind, setBind] = useState<ProductBindValue>(() => bindValueFromTemplate(variant));
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowOk, setRowOk] = useState<string | null>(null);
  const [sandboxBusy, setSandboxBusy] = useState(false);

  const openMasterEditor = useCallback(() => {
    navigate(`/adminpanel/design-editor/${variant.id}`);
  }, [navigate, variant.id]);

  const openClientSandbox = useCallback(async () => {
    try {
      setSandboxBusy(true);
      setRowError(null);
      await openSiteSandboxForDesignTemplate(variant);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Не удалось открыть сайтовый редактор');
    } finally {
      setSandboxBusy(false);
    }
  }, [variant]);

  // Sync when template data reloads from parent
  const specKey = `${parsed.productId ?? ''}:${parsed.typeId ?? ''}:${parsed.sizeId ?? ''}:${variant.subtype_link_count ?? 0}`;
  useEffect(() => {
    setBind(bindValueFromTemplate(variant));
    setRowError(null);
    setRowOk(null);
  }, [variant.id, specKey, variant]);

  const canBind =
    Boolean(bind.productId.trim())
    && Boolean(bind.typeId.trim())
    && Boolean(bind.sizeId.trim());

  const handleBind = useCallback(async () => {
    const productId = Number(bind.productId);
    const typeId = Number(bind.typeId);
    const sizeId = bind.sizeId.trim();
    if (!Number.isFinite(productId) || !Number.isFinite(typeId) || !sizeId) {
      setRowError('Укажите продукт, подтип и размер калькулятора');
      return;
    }
    setSaving(true);
    setRowError(null);
    setRowOk(null);
    try {
      await addSubtypeDesign(productId, typeId, variant.id, sizeId);
      await updateDesignTemplate(variant.id, {
        spec: mergeProductBindIntoSpec(variant, { productId, typeId, sizeId }),
      });
      setRowOk('Привязано');
      await onBound();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось привязать';
      if (msg.includes('UNIQUE') || msg.includes('уже') || msg.includes('409')) {
        try {
          await updateDesignTemplate(variant.id, {
            spec: mergeProductBindIntoSpec(variant, { productId, typeId, sizeId }),
          });
        } catch {
          /* ignore — линк уже есть */
        }
        setRowOk('Уже привязан к этому размеру');
        await onBound();
      } else {
        setRowError(msg.replace(/^\d{3}:\s*/, ''));
      }
    } finally {
      setSaving(false);
    }
  }, [bind, variant, onBound]);

  return (
    <li className={`design-family-variant-row ${linked ? 'design-family-variant-row--linked' : 'design-family-variant-row--unlinked'}`}>
      <div className="design-family-variant-row__maket">
        <div className="design-family-variant-row__maket-main">
          <span className="design-family-variant-row__size-label">Размер макета</span>
          <strong className="design-family-variant-row__size">{sizeStr}</strong>
          <span className="design-family-variant-row__id">#{variant.id}</span>
          <span className={`design-family-variant-row__status design-family-variant-row__status--${status}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="design-family-variant-row__maket-actions">
          <button
            type="button"
            className="lg-btn lg-btn--sm lg-btn--primary"
            onClick={openMasterEditor}
            title="Master-редактор CRM: абсолютная правка шаблона (текст, фотополя, надписи)"
          >
            <AppIcon name="edit" size="xs" /> Макет
          </button>
          <button
            type="button"
            className="lg-btn lg-btn--sm"
            onClick={() => void openClientSandbox()}
            disabled={sandboxBusy}
            title={
              parsed.editorKind === 'souvenir_3d'
                ? 'Клиентский редактор на сайте (3D / souvenir)'
                : 'Клиентский редактор на сайте (printcore.by)'
            }
          >
            <AppIcon name="image" size="xs" /> {sandboxBusy ? '…' : 'На сайте'}
          </button>
          <button
            type="button"
            className="lg-btn lg-btn--sm lg-btn--icon lg-btn--danger"
            onClick={() => void onDelete(variant.id, sizeStr)}
            title="Удалить этот размер"
            aria-label="Удалить"
          >
            <AppIcon name="trash" size="xs" />
          </button>
        </div>
      </div>

      <div className="design-family-variant-row__bind">
        <div className="design-family-variant-row__bind-head">
          <span className="design-family-variant-row__bind-label">Привязка к калькулятору</span>
          {linked && bindingLabel ? (
            <span className="design-family-variant-row__bind-current" title="Текущая привязка">
              <AppIcon name="link" size="xs" /> {bindingLabel}
            </span>
          ) : (
            <span className="design-family-variant-row__bind-warn">не привязан</span>
          )}
        </div>
        <div className="design-family-variant-row__bind-controls">
          <DesignTemplateProductBindField
            value={bind}
            onChange={setBind}
            requiredSize
            compact
          />
          <button
            type="button"
            className="lg-btn lg-btn--primary lg-btn--sm design-family-variant-row__bind-btn"
            disabled={!canBind || saving}
            onClick={() => void handleBind()}
          >
            {saving ? '…' : linked ? 'Обновить привязку' : 'Привязать'}
          </button>
        </div>
        {rowError && <p className="design-family-variant-row__error">{rowError}</p>}
        {rowOk && !rowError && <p className="design-family-variant-row__ok">{rowOk}</p>}
      </div>
    </li>
  );
}

export const DesignTemplateFamilyVariantRows: React.FC<Props> = ({
  family,
  formatBinding,
  onBound,
  onDelete,
}) => (
  <ul className="design-family-variant-rows">
    {family.variants.map((variant) => (
      <VariantRow
        key={variant.id}
        variant={variant}
        formatBinding={formatBinding}
        onBound={onBound}
        onDelete={onDelete}
      />
    ))}
  </ul>
);
