import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface BindingVariantOption {
  id: number;
  variantName?: string;
  variant_name?: string;
  parentVariantId?: number | string | null;
  isActive?: boolean;
  parameters?: unknown;
}

interface BindingVariantSelectorProps {
  variants: BindingVariantOption[];
  value?: number;
  disabled?: boolean;
  onChange: (variantId: number | undefined) => void;
  pagesHint?: string | null;
  error?: string;
}

interface BindingLeaf {
  id: number;
  label: string;
}

interface BindingBranch {
  key: string;
  label: string;
  variantId: number;
  leaves: BindingLeaf[];
}

interface BindingRoot {
  key: string;
  label: string;
  variantId: number;
  leafVariantId?: number;
  branches: BindingBranch[];
}

function paramsOf(variant: BindingVariantOption): Record<string, unknown> {
  if (!variant.parameters || typeof variant.parameters !== 'object' || Array.isArray(variant.parameters)) {
    return {};
  }
  return variant.parameters as Record<string, unknown>;
}

function parentIdOf(variant: BindingVariantOption): number | null {
  const params = paramsOf(variant);
  const raw = variant.parentVariantId ?? params.parentVariantId;
  const value = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function rootLabel(variant: BindingVariantOption): string {
  return text(variant.variantName ?? variant.variant_name) || `Вариант #${variant.id}`;
}

function branchLabel(variant: BindingVariantOption): string {
  const params = paramsOf(variant);
  return text(params.type)
    || text(params.density)
    || rootLabel(variant);
}

function leafLabel(variant: BindingVariantOption): string {
  const params = paramsOf(variant);
  return text(params.subType)
    || text(params.density)
    || text(params.type)
    || rootLabel(variant);
}

function hasLevelParameters(variant: BindingVariantOption): boolean {
  const params = paramsOf(variant);
  return Boolean(text(params.type) || text(params.density) || text(params.subType));
}

function buildBindingTree(variants: BindingVariantOption[]): BindingRoot[] {
  const groups = new Map<string, BindingVariantOption[]>();
  for (const variant of variants) {
    const label = rootLabel(variant);
    const list = groups.get(label) || [];
    list.push(variant);
    groups.set(label, list);
  }

  return [...groups.entries()].map(([label, group], groupIndex) => {
    const noParent = group.filter((variant) => parentIdOf(variant) == null);
    const explicitRoot = noParent.find((variant) => !hasLevelParameters(variant));
    const rootVariant = explicitRoot || noParent[0] || group[0];
    const levelOne = noParent.filter((variant) => variant.id !== rootVariant?.id);

    if (levelOne.length === 0) {
      const directChildren = group.filter((variant) => parentIdOf(variant) === Number(rootVariant?.id));
      if (directChildren.length === 0) {
        return {
          key: `root:${groupIndex}:${label}`,
          label,
          variantId: rootVariant.id,
          leafVariantId: rootVariant?.id,
          branches: [],
        };
      }
      return {
        key: `root:${groupIndex}:${label}`,
        label,
        variantId: rootVariant.id,
        branches: [{
          key: `branch:${rootVariant.id}`,
          label: branchLabel(rootVariant),
          variantId: rootVariant.id,
          leaves: directChildren.map((variant) => ({
            id: variant.id,
            label: leafLabel(variant),
          })),
        }],
      };
    }

    return {
      key: `root:${groupIndex}:${label}`,
      label,
      variantId: rootVariant.id,
      branches: levelOne.map((variant) => ({
        key: `branch:${variant.id}`,
        label: branchLabel(variant),
        variantId: variant.id,
        leaves: group
          .filter((candidate) => parentIdOf(candidate) === Number(variant.id))
          .map((candidate) => ({
            id: candidate.id,
            label: leafLabel(candidate),
          })),
      })),
    };
  });
}

function findSelection(
  tree: BindingRoot[],
  variantId: number | undefined,
): { rootKey: string; branchKey?: string } | null {
  if (variantId == null || !Number.isFinite(variantId)) return null;
  for (const root of tree) {
    if (root.variantId === variantId) return { rootKey: root.key };
    for (const branch of root.branches) {
      if (branch.variantId === variantId || branch.leaves.some((leaf) => leaf.id === variantId)) {
        return { rootKey: root.key, branchKey: branch.key };
      }
    }
  }
  return null;
}

export function isBindingVariantPricingLeaf(
  variants: BindingVariantOption[],
  variantId: number | undefined,
): boolean {
  if (variantId == null || !Number.isFinite(variantId)) return true;
  const tree = buildBindingTree(variants);
  for (const root of tree) {
    if (root.variantId === variantId) return root.branches.length === 0;
    for (const branch of root.branches) {
      if (branch.variantId === variantId) return branch.leaves.length === 0;
      if (branch.leaves.some((leaf) => leaf.id === variantId)) return true;
    }
  }
  return false;
}

export const BindingVariantSelector: React.FC<BindingVariantSelectorProps> = ({
  variants,
  value,
  disabled = false,
  onChange,
  pagesHint,
  error,
}) => {
  const tree = useMemo(() => buildBindingTree(variants), [variants]);
  const selection = useMemo(() => findSelection(tree, value), [tree, value]);
  const [rootKey, setRootKey] = useState('');
  const [branchKey, setBranchKey] = useState('');
  const preserveCascadeOnUndefinedRef = useRef(false);

  useEffect(() => {
    if (selection) {
      preserveCascadeOnUndefinedRef.current = false;
      setRootKey(selection.rootKey);
      setBranchKey(selection.branchKey || '');
      return;
    }
    if (value == null && preserveCascadeOnUndefinedRef.current) {
      preserveCascadeOnUndefinedRef.current = false;
      return;
    }
    setRootKey('');
    setBranchKey('');
  }, [selection, value]);

  useEffect(() => {
    if (rootKey && !tree.some((root) => root.key === rootKey)) {
      setRootKey('');
      setBranchKey('');
    }
  }, [rootKey, tree]);

  const selectedRoot = tree.find((root) => root.key === rootKey)
    ?? tree.find((root) => root.key === selection?.rootKey);
  const selectedBranch = selectedRoot?.branches.find((branch) => branch.key === branchKey)
    ?? selectedRoot?.branches.find((branch) => branch.key === selection?.branchKey);
  const selectedLeafValue = selectedBranch?.leaves.some((leaf) => leaf.id === value)
    ? String(value)
    : '';
  const structuralSelection = Boolean(
    value != null
    && (
      (selectedRoot?.variantId === value && selectedRoot.branches.length > 0)
      || (selectedBranch?.variantId === value && selectedBranch.leaves.length > 0)
    ),
  );
  const effectiveError = structuralSelection
    ? 'Выберите последний уровень варианта переплёта'
    : error;

  return (
    <div className="binding-variant-selector">
      <div className="param-group param-group--binding">
        <label>Переплёт</label>
        <select
          className="form-control"
          disabled={disabled}
          value={selectedRoot?.key || ''}
          onChange={(event) => {
            const nextRoot = tree.find((root) => root.key === event.target.value);
            setRootKey(event.target.value);
            setBranchKey('');
            preserveCascadeOnUndefinedRef.current = Boolean(nextRoot && nextRoot.leafVariantId == null);
            onChange(nextRoot?.leafVariantId);
          }}
        >
          <option value="">— Выберите вид переплёта —</option>
          {tree.map((root) => (
            <option key={root.key} value={root.key}>{root.label}</option>
          ))}
        </select>
      </div>

      {selectedRoot && selectedRoot.branches.length > 0 && (
        <div className="param-group param-group--binding">
          <label>Тип переплёта</label>
          <select
            className="form-control"
            disabled={disabled}
            value={selectedBranch?.key || ''}
            onChange={(event) => {
              const nextBranch = selectedRoot.branches.find((branch) => branch.key === event.target.value);
              setBranchKey(event.target.value);
              preserveCascadeOnUndefinedRef.current = Boolean(nextBranch && nextBranch.leaves.length > 0);
              onChange(nextBranch && nextBranch.leaves.length === 0 ? nextBranch.variantId : undefined);
            }}
          >
            <option value="">— Выберите тип —</option>
            {selectedRoot.branches.map((branch) => (
              <option key={branch.key} value={branch.key}>{branch.label}</option>
            ))}
          </select>
        </div>
      )}

      {selectedBranch && selectedBranch.leaves.length > 0 && (
        <div className="param-group param-group--binding">
          <label>Вариант переплёта</label>
          <select
            className="form-control"
            disabled={disabled}
            value={selectedLeafValue}
            onChange={(event) => onChange(event.target.value ? Number(event.target.value) : undefined)}
          >
            <option value="">— Выберите вариант —</option>
            {selectedBranch.leaves.map((leaf) => (
              <option key={leaf.id} value={leaf.id}>{leaf.label}</option>
            ))}
          </select>
        </div>
      )}

      {(pagesHint || effectiveError) && (
        <div className="binding-variant-selector__messages">
          {pagesHint && <p className="param-hint param-hint--binding">{pagesHint}</p>}
          {effectiveError && <p className="param-error">{effectiveError}</p>}
        </div>
      )}
    </div>
  );
};
