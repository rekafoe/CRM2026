type MetricSample = {
  value: number;
  at: number;
  meta?: Record<string, unknown>;
};

type MetricBucket = {
  count: number;
  total: number;
  max: number;
  samples: MetricSample[];
};

type TransitionPairStats = {
  baselineAfterCount: number | null;
  samples: number;
  driftSamples: number;
  reportedAt30: boolean;
};

export type PublicEditorPerfSnapshot = {
  startedAtIso: string;
  buckets: Array<{
    name: string;
    count: number;
    avg: number;
    p95: number;
    max: number;
    total: number;
  }>;
  transitionPairDrift: Array<{
    pair: string;
    samples: number;
    driftSamples: number;
    baselineAfterCount: number | null;
  }>;
};

const METRIC_SAMPLE_LIMIT = 240;
const TRANSITION_WARN_P95_MS = 260;
const TRANSITION_DRIFT_ACCEPTANCE_SAMPLES = 30;

const startedAt = Date.now();
const metricBuckets = new Map<string, MetricBucket>();
const transitionPairStats = new Map<string, TransitionPairStats>();
const PERF_DEV = (() => {
  try {
    const meta = import.meta as ImportMeta & { env?: { DEV?: unknown } };
    if (meta.env && typeof meta.env.DEV !== 'undefined') return Boolean(meta.env.DEV);
  } catch {
    // Ignore: non-Vite runtimes may not expose import.meta.env
  }
  const scope = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return scope.process?.env?.NODE_ENV !== 'production';
})();

function trimSamples(samples: MetricSample[]): void {
  if (samples.length <= METRIC_SAMPLE_LIMIT) return;
  samples.splice(0, samples.length - METRIC_SAMPLE_LIMIT);
}

function getBucket(name: string): MetricBucket {
  const existing = metricBuckets.get(name);
  if (existing) return existing;
  const created: MetricBucket = { count: 0, total: 0, max: 0, samples: [] };
  metricBuckets.set(name, created);
  return created;
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function maybeWarnTransitionP95(metricName: string): void {
  if (!PERF_DEV) return;
  if (metricName !== 'transition.total.ms') return;
  const bucket = metricBuckets.get(metricName);
  if (!bucket || bucket.count < 10) return;
  const p95 = percentile(bucket.samples.map((sample) => sample.value), 95);
  if (p95 <= TRANSITION_WARN_P95_MS) return;
  console.warn('[PublicEditorPerf] transition P95 above threshold', {
    metric: metricName,
    p95,
    threshold: TRANSITION_WARN_P95_MS,
    samples: bucket.count,
  });
}

function maybeWarnTransitionDrift(pair: string, stats: TransitionPairStats): void {
  if (!PERF_DEV) return;
  if (stats.reportedAt30 || stats.samples < TRANSITION_DRIFT_ACCEPTANCE_SAMPLES) return;
  stats.reportedAt30 = true;
  if (stats.driftSamples === 0) {
    console.info('[PublicEditorPerf] transition drift check passed', {
      pair,
      samples: stats.samples,
      driftSamples: stats.driftSamples,
    });
    return;
  }
  console.warn('[PublicEditorPerf] transition drift detected', {
    pair,
    samples: stats.samples,
    driftSamples: stats.driftSamples,
    baselineAfterCount: stats.baselineAfterCount,
  });
}

export function recordPublicEditorPerfMetric(
  name: string,
  value: number,
  meta?: Record<string, unknown>,
): void {
  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
  const bucket = getBucket(name);
  bucket.count += 1;
  bucket.total += safeValue;
  bucket.max = Math.max(bucket.max, safeValue);
  bucket.samples.push({
    value: safeValue,
    at: Date.now(),
    meta,
  });
  trimSamples(bucket.samples);
  maybeWarnTransitionP95(name);
}

export function startPublicEditorPerfSpan(
  name: string,
  meta?: Record<string, unknown>,
): (extraMeta?: Record<string, unknown>) => void {
  const startAt = performance.now();
  return (extraMeta) => {
    const elapsed = performance.now() - startAt;
    recordPublicEditorPerfMetric(name, elapsed, {
      ...(meta ?? {}),
      ...(extraMeta ?? {}),
    });
  };
}

export async function measurePublicEditorPerf<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const stop = startPublicEditorPerfSpan(name, meta);
  try {
    return await fn();
  } finally {
    stop();
  }
}

export function recordPublicEditorTransitionDrift(input: {
  prevKey: string | null;
  targetKey: string;
  objectCountAfterLoad: number;
}): void {
  const pair = [input.prevKey ?? 'none', input.targetKey].sort().join(' <-> ');
  const stats = transitionPairStats.get(pair) ?? {
    baselineAfterCount: null,
    samples: 0,
    driftSamples: 0,
    reportedAt30: false,
  };
  stats.samples += 1;
  if (stats.baselineAfterCount == null) {
    stats.baselineAfterCount = input.objectCountAfterLoad;
  } else if (stats.baselineAfterCount !== input.objectCountAfterLoad) {
    stats.driftSamples += 1;
  }
  transitionPairStats.set(pair, stats);
  maybeWarnTransitionDrift(pair, stats);
}

export function getPublicEditorPerfSnapshot(): PublicEditorPerfSnapshot {
  const buckets = Array.from(metricBuckets.entries()).map(([name, bucket]) => {
    const values = bucket.samples.map((sample) => sample.value);
    const avg = bucket.count > 0 ? bucket.total / bucket.count : 0;
    return {
      name,
      count: bucket.count,
      avg,
      p95: percentile(values, 95),
      max: bucket.max,
      total: bucket.total,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const transitionPairDrift = Array.from(transitionPairStats.entries()).map(([pair, stats]) => ({
    pair,
    samples: stats.samples,
    driftSamples: stats.driftSamples,
    baselineAfterCount: stats.baselineAfterCount,
  })).sort((a, b) => a.pair.localeCompare(b.pair));

  return {
    startedAtIso: new Date(startedAt).toISOString(),
    buckets,
    transitionPairDrift,
  };
}

export function resetPublicEditorPerfMetrics(): void {
  metricBuckets.clear();
  transitionPairStats.clear();
}

declare global {
  interface Window {
    __PUBLIC_EDITOR_PERF__?: {
      snapshot: () => PublicEditorPerfSnapshot;
      reset: () => void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__PUBLIC_EDITOR_PERF__ = {
    snapshot: getPublicEditorPerfSnapshot,
    reset: resetPublicEditorPerfMetrics,
  };
}
