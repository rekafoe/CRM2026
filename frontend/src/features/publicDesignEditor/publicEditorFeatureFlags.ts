export const PUBLIC_EDITOR_FEATURE_FLAGS = {
  incrementalPreflight: import.meta.env.VITE_PUBLIC_EDITOR_INCREMENTAL_PREFLIGHT !== 'false',
  spreadMirrorReconciliation: import.meta.env.VITE_PUBLIC_EDITOR_SPREAD_MIRROR_RECONCILIATION !== 'false',
} as const;
