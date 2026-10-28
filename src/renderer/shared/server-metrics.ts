export const METRIC_WINDOW_MS = 60_000;

export interface ResourcePoint {
  elapsedMs: number;
  cpu: number;
  memory: number;
}

export interface TpsPoint {
  elapsedMs: number;
  tps: number;
}

export interface DisplayOnlyMetricPoint {
  displayOnly: true;
  measuredAtElapsedMs: number;
  windowAnchor?: true;
}

export type MetricDisplayPoint<T extends { elapsedMs: number }> = T | (T & DisplayOnlyMetricPoint);

export interface MetricHistorySnapshot {
  serverId: string;
  generation: number;
  sequence: number;
  elapsedMs: number;
  resource: ResourcePoint[];
  tps: TpsPoint[];
}

export function createMetricDisplaySeries<T extends { elapsedMs: number }>(
  points: readonly T[],
  nowElapsedMs: number,
): MetricDisplayPoint<T>[] {
  if (!Number.isFinite(nowElapsedMs)) {
    return [...points];
  }

  const [windowStart, windowEnd] = getMetricTimeDomain(nowElapsedMs);
  const windowPoints = points.filter(
    (point) => point.elapsedMs >= windowStart && point.elapsedMs <= windowEnd,
  );
  const windowAnchor = points.reduce<T | undefined>((latest, point) => {
    if (point.elapsedMs >= windowStart) {
      return latest;
    }
    return !latest || point.elapsedMs >= latest.elapsedMs ? point : latest;
  }, undefined);
  const series: MetricDisplayPoint<T>[] = [];

  if (windowAnchor) {
    series.push({
      ...windowAnchor,
      displayOnly: true,
      measuredAtElapsedMs: windowAnchor.elapsedMs,
      windowAnchor: true,
    });
  }
  series.push(...windowPoints);

  const latestWindowPoint = windowPoints.at(-1);
  if (latestWindowPoint && nowElapsedMs > latestWindowPoint.elapsedMs) {
    series.push({
      ...latestWindowPoint,
      elapsedMs: nowElapsedMs,
      displayOnly: true,
      measuredAtElapsedMs: latestWindowPoint.elapsedMs,
    });
  }

  return series;
}

export function getMetricWindowPoints<T extends { elapsedMs: number }>(
  points: readonly T[],
  nowElapsedMs: number,
): T[] {
  if (!Number.isFinite(nowElapsedMs)) {
    return [];
  }
  const [windowStart, windowEnd] = getMetricTimeDomain(nowElapsedMs);
  return points.filter((point) => point.elapsedMs >= windowStart && point.elapsedMs <= windowEnd);
}

export const clampMetric = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const normalizeMetric = (value: number, precision = 1): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isMetricHistorySnapshot(value: unknown): value is MetricHistorySnapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.serverId === 'string' &&
    value.serverId.length > 0 &&
    Number.isSafeInteger(value.generation) &&
    isNonNegativeNumber(value.generation) &&
    Number.isSafeInteger(value.sequence) &&
    isNonNegativeNumber(value.sequence) &&
    isNonNegativeNumber(value.elapsedMs) &&
    Array.isArray(value.resource) &&
    value.resource.every(
      (point: unknown) =>
        isRecord(point) &&
        isNonNegativeNumber(point.elapsedMs) &&
        isNonNegativeNumber(point.cpu) &&
        isNonNegativeNumber(point.memory),
    ) &&
    Array.isArray(value.tps) &&
    value.tps.every(
      (point: unknown) =>
        isRecord(point) && isNonNegativeNumber(point.elapsedMs) && isNonNegativeNumber(point.tps),
    )
  );
}

export function getMetricTimeDomain(elapsedMs: number): [number, number] {
  const end = Math.max(1_000, elapsedMs);
  return [Math.max(0, end - METRIC_WINDOW_MS), end];
}

export function getMetricTimeTicks([start, end]: [number, number]): number[] {
  const range = end - start;
  const step = range >= 30_000 ? 10_000 : range >= 15_000 ? 5_000 : range >= 6_000 ? 2_000 : 1_000;
  const ticks: number[] = [];
  for (let tick = Math.ceil(start / step) * step; tick <= end; tick += step) {
    ticks.push(tick);
  }
  return ticks;
}

export function formatMetricUptime(elapsedMs: number): string {
  const elapsed = Math.max(0, Math.floor(elapsedMs / 1_000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
