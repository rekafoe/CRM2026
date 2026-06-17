type LooseEnv = Record<string, string | undefined>;

function readImportMetaEnv(key: string): string | undefined {
  try {
    const meta = import.meta as ImportMeta & { env?: LooseEnv };
    return meta.env?.[key];
  } catch {
    return undefined;
  }
}

function readProcessEnv(key: string): string | undefined {
  const scope = globalThis as { process?: { env?: LooseEnv } };
  return scope.process?.env?.[key];
}

function readFeatureEnvValue(key: string): string | undefined {
  const direct = readImportMetaEnv(key) ?? readProcessEnv(key);
  if (direct != null) return direct;
  if (!key.startsWith('VITE_')) return undefined;
  return readProcessEnv(`NEXT_PUBLIC_${key.slice('VITE_'.length)}`);
}

function isEnabledByDefault(key: string): boolean {
  return readFeatureEnvValue(key) !== 'false';
}

export const PUBLIC_EDITOR_FEATURE_FLAGS = {
  incrementalPreflight: isEnabledByDefault('VITE_PUBLIC_EDITOR_INCREMENTAL_PREFLIGHT'),
  spreadMirrorReconciliation: isEnabledByDefault('VITE_PUBLIC_EDITOR_SPREAD_MIRROR_RECONCILIATION'),
} as const;
