import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { PostprintServiceOption, PostprintVariantOption } from '../postprintTypes';

const UNGROUPED_PARENT_ID = 0;

export function usePostprintServiceCard(
  service: PostprintServiceOption,
  postprintSelections: Record<string, number>,
  setPostprintSelections: Dispatch<SetStateAction<Record<string, number>>>,
  getOperationUnitPrice: (op: unknown, qty: number) => number
) {
  const serviceKey = String(service.serviceId);
  const serviceKeyPrefix = `${service.serviceId}:`;

  const hasTreeParents = Boolean(service.parentVariants && service.parentVariants.length > 0);

  const ungroupedLeaves = useMemo(
    () => service.variants.filter((v) => v.parentVariantId == null),
    [service.variants]
  );

  const mergedParents = useMemo(() => {
    if (!hasTreeParents || !service.parentVariants) return [];
    const list = [...service.parentVariants];
    if (ungroupedLeaves.length > 0) {
      list.push({ id: UNGROUPED_PARENT_ID, label: 'Без группы' });
    }
    return list;
  }, [hasTreeParents, service.parentVariants, ungroupedLeaves]);

  const getSubtypesForParent = useCallback(
    (parentId: number) => {
      if (parentId === UNGROUPED_PARENT_ID) return ungroupedLeaves;
      return service.variants.filter((v) => Number(v.parentVariantId) === parentId);
    },
    [ungroupedLeaves, service.variants]
  );

  const variantTypes = useMemo(() => {
    if (hasTreeParents) return {} as Record<string, PostprintVariantOption[]>;
    return service.variants.reduce<Record<string, PostprintVariantOption[]>>((acc, variant) => {
      const typeLabel = String(variant.parameters?.type || variant.label || 'Вариант').trim();
      if (!acc[typeLabel]) acc[typeLabel] = [];
      acc[typeLabel].push(variant);
      return acc;
    }, {});
  }, [hasTreeParents, service.variants]);

  const selectedVariantKey = Object.keys(postprintSelections).find((key) =>
    key.startsWith(serviceKeyPrefix)
  );

  const selectedVariant =
    service.variants.find((variant) => variant.key === selectedVariantKey) || service.variants[0];

  const typeOptions = Object.keys(variantTypes);
  const selectedType = selectedVariant?.parameters?.type || typeOptions[0] || '';

  const legacySubtypeOptions =
    typeOptions.length > 0
      ? variantTypes[selectedType] || variantTypes[typeOptions[0]] || []
      : service.variants;

  let selectedParentId = mergedParents[0]?.id ?? UNGROUPED_PARENT_ID;
  if (hasTreeParents && mergedParents.length > 0) {
    if (selectedVariantKey) {
      const sv = service.variants.find((v) => v.key === selectedVariantKey);
      if (sv) {
        const pv = sv.parentVariantId;
        if (pv != null && Number(pv) > 0 && mergedParents.some((p) => p.id === Number(pv))) {
          selectedParentId = Number(pv);
        } else if (ungroupedLeaves.some((u) => u.key === sv.key)) {
          selectedParentId = UNGROUPED_PARENT_ID;
        }
      }
    }
  }

  let parentIdForUi = selectedParentId;
  let subtypeOptions: PostprintVariantOption[] = hasTreeParents
    ? getSubtypesForParent(parentIdForUi)
    : legacySubtypeOptions;

  if (hasTreeParents && subtypeOptions.length === 0 && mergedParents.length > 0) {
    const alt = mergedParents.find((p) => getSubtypesForParent(p.id).length > 0);
    if (alt) {
      parentIdForUi = alt.id;
      subtypeOptions = getSubtypesForParent(parentIdForUi);
    }
  }

  const selectedSubtype =
    subtypeOptions.find((variant) => variant.key === selectedVariantKey) || subtypeOptions[0];

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

  const clearServiceKeys = (next: Record<string, number>) => {
    Object.keys(next).forEach((key) => {
      if (key === serviceKey || key.startsWith(serviceKeyPrefix)) {
        delete next[key];
      }
    });
  };

  const handleToggle = (checked: boolean) => {
    setPostprintSelections((prev) => {
      const next = { ...prev };
      clearServiceKeys(next);
      if (checked) {
        let preferredKey: string | undefined;
        if (service.variants.length > 0) {
          if (hasTreeParents && mergedParents.length > 0) {
            const firstParent = mergedParents[0];
            preferredKey = getSubtypesForParent(firstParent.id)[0]?.key;
          }
          preferredKey = preferredKey || selectedVariant?.key || service.variants[0]?.key;
        } else {
          preferredKey = serviceKey;
        }
        if (preferredKey) {
          const baseQty = prev[preferredKey] || minQuantity;
          next[preferredKey] = clampQuantity(baseQty);
        }
      }
      return next;
    });
  };

  const handleLegacyTypeChange = (nextType: string) => {
    const nextVariant = (variantTypes[nextType] || [])[0];
    setPostprintSelections((prev) => {
      const next = { ...prev };
      const prevQty = selectedVariantKey ? prev[selectedVariantKey] : 1;
      clearServiceKeys(next);
      if (nextVariant?.key) {
        next[nextVariant.key] = clampQuantity(prevQty || minQuantity);
      }
      return next;
    });
  };

  const handleTreeParentChange = (nextParentId: number) => {
    const list = getSubtypesForParent(nextParentId);
    const nextVariant = list[0];
    setPostprintSelections((prev) => {
      const next = { ...prev };
      const prevQty = selectedVariantKey ? prev[selectedVariantKey] : 1;
      clearServiceKeys(next);
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
      clearServiceKeys(next);
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

  const showFirstSelect = hasTreeParents
    ? mergedParents.length > 1
    : typeOptions.length > 1;
  const showSecondSelect = hasTreeParents
    ? subtypeOptions.length > 1
    : legacySubtypeOptions.length > 1;

  return {
    hasTreeParents,
    mergedParents,
    variantTypes,
    typeOptions,
    selectedType,
    legacySubtypeOptions,
    parentIdForUi,
    subtypeOptions,
    selectedSubtype,
    rawQty,
    qty,
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
  };
}
