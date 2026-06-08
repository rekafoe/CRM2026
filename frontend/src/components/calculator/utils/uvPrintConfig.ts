export type UvPrintLayerKey = 'color' | 'white' | 'varnish';

export interface UvLayerState {
  enabled: boolean;
  passes: number;
}

export type UvPrintState = Partial<Record<UvPrintLayerKey, UvLayerState>>;

export interface UvPrintTemplateConfig {
  mode?: 'flatbed_m2';
  layers?: UvPrintLayerKey[];
  default_passes?: Partial<Record<UvPrintLayerKey, number>>;
  dimensions_mode?: 'custom_only' | 'presets_and_custom';
}

const LAYER_LABELS: Record<UvPrintLayerKey, string> = {
  color: 'Печать цветом',
  white: 'Печать белым',
  varnish: 'Лак',
};

export function getLayerLabel(layer: UvPrintLayerKey): string {
  return LAYER_LABELS[layer];
}

export function getEffectiveUvPrintConfig(
  schema: { template?: { simplified?: Record<string, unknown> } } | null | undefined,
  typeId?: number | string | null,
): UvPrintTemplateConfig | undefined {
  const simp = schema?.template?.simplified as
    | { uv_print?: UvPrintTemplateConfig; typeConfigs?: Record<string, { uv_print?: UvPrintTemplateConfig }> }
    | undefined;
  if (!simp) return undefined;
  if (typeId != null && simp.typeConfigs?.[String(typeId)]?.uv_print) {
    return simp.typeConfigs[String(typeId)].uv_print;
  }
  return simp.uv_print;
}

export function isUvFlatbedProduct(
  schema: { template?: { simplified?: Record<string, unknown> } } | null | undefined,
  typeId?: number | string | null,
): boolean {
  return getEffectiveUvPrintConfig(schema, typeId)?.mode === 'flatbed_m2';
}

export function defaultUvPrintState(template?: UvPrintTemplateConfig): UvPrintState {
  const layers = template?.layers ?? ['color', 'white', 'varnish'];
  const defaults = template?.default_passes ?? { color: 1, white: 1, varnish: 1 };
  const state: UvPrintState = {};
  for (const layer of layers) {
    state[layer] = {
      enabled: layer === 'color',
      passes: Math.max(1, defaults[layer] ?? 1),
    };
  }
  return state;
}

export function hasEnabledUvLayer(uvPrint?: UvPrintState | null): boolean {
  if (!uvPrint) return false;
  return (['color', 'white', 'varnish'] as UvPrintLayerKey[]).some(
    (k) => uvPrint[k]?.enabled && (uvPrint[k]?.passes ?? 0) >= 1,
  );
}

export function serializeUvPrintForApi(uvPrint?: UvPrintState | null): UvPrintState {
  const out: UvPrintState = {};
  if (!uvPrint) return out;
  for (const key of ['color', 'white', 'varnish'] as UvPrintLayerKey[]) {
    const row = uvPrint[key];
    if (!row?.enabled) continue;
    const passes = Math.max(0, Math.min(5, Math.floor(Number(row.passes) || 0)));
    if (passes < 1) continue;
    out[key] = { enabled: true, passes };
  }
  return out;
}
