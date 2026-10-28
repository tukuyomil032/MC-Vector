import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
  type TooltipContentProps,
} from 'recharts';
import type { ReactNode } from 'react';
import { type Translate, type TranslationKey, useTranslation } from '../../i18n';
import { sendServerNotification } from '../../lib/notification-commands';
import { tauriListen } from '../../lib/tauri-api';
import type { MinecraftServer, ServerStatus } from '../components/../shared/server declaration';
import {
  type DisplayOnlyMetricPoint,
  type MetricDisplayPoint,
  type ResourcePoint,
  type TpsPoint,
  clampMetric,
  createMetricDisplaySeries,
  formatMetricUptime,
  getMetricWindowPoints,
  getMetricTimeDomain,
  getMetricTimeTicks,
  normalizeMetric,
} from '../shared/server-metrics';
import { useServerMetricHistoryStore } from '../../store/serverMetricHistoryStore';

interface Props {
  server: MinecraftServer;
}

interface ChartTimeAxisProps {
  timeDomain: [number, number];
  timeTicks: number[];
  formatElapsed: (elapsedMs: number) => string;
  elapsedAxisLabel: string;
  heldSinceLabel: (elapsedMs: number) => string;
}

interface ResourceChartCardProps extends ChartTimeAxisProps {
  title: string;
  data: MetricDisplayPoint<ResourcePoint>[];
  dataKey: 'cpu' | 'memory';
  stroke: string;
  fill: string;
  yDomain?: [number, number];
  emptyLabel: string;
}

interface TpsChartCardProps extends ChartTimeAxisProps {
  title: string;
  data: MetricDisplayPoint<TpsPoint>[];
  emptyLabel: string;
}

const EMPTY_RESOURCE_STATS: ResourcePoint[] = [];
const EMPTY_TPS_STATS: TpsPoint[] = [];

const AXIS_STROKE_COLOR = '#94a3b8';
const GRID_STROKE_COLOR = '#334155';
const TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid rgba(82, 82, 91, 0.7)',
};
const TICK_STYLE = { fontSize: 10 };
const CPU_Y_DOMAIN: [number, number] = [0, 100];
const TPS_Y_DOMAIN: [number, number] = [0, 22];

const STATUS_COLORS: Record<ServerStatus, string> = {
  online: '#10b981',
  offline: '#ef4444',
  starting: '#eab308',
  stopping: '#f97316',
  restarting: '#3b82f6',
  crashed: '#f43f5e',
};

const STATUS_LABEL_KEYS: Record<ServerStatus, TranslationKey> = {
  online: 'dashboard.stats.statusValues.online',
  offline: 'dashboard.stats.statusValues.offline',
  starting: 'dashboard.stats.statusValues.starting',
  stopping: 'dashboard.stats.statusValues.stopping',
  restarting: 'dashboard.stats.statusValues.restarting',
  crashed: 'dashboard.stats.statusValues.crashed',
};

const getStatusColor = (status: ServerStatus): string => {
  return STATUS_COLORS[status] ?? '#aaa';
};

const isDisplayOnlyMetricPoint = (point: unknown): point is DisplayOnlyMetricPoint => {
  return (
    typeof point === 'object' &&
    point !== null &&
    'displayOnly' in point &&
    point.displayOnly === true &&
    'measuredAtElapsedMs' in point &&
    typeof point.measuredAtElapsedMs === 'number'
  );
};

interface MetricChartTooltipProps extends Pick<
  TooltipContentProps,
  'active' | 'label' | 'payload'
> {
  formatElapsed: (elapsedMs: number) => string;
  heldSinceLabel: (elapsedMs: number) => string;
}

const MetricChartTooltip = memo(function MetricChartTooltip({
  active,
  label,
  payload,
  formatElapsed,
  heldSinceLabel,
}: MetricChartTooltipProps) {
  const item = payload[0];
  if (!active || !item) {
    return null;
  }

  const point = item.payload as
    | { displayOnly?: boolean; measuredAtElapsedMs?: number; windowAnchor?: boolean }
    | undefined;
  if (point?.windowAnchor) {
    return null;
  }
  const heldSinceElapsedMs = point?.displayOnly ? point.measuredAtElapsedMs : undefined;

  return (
    <div style={TOOLTIP_STYLE}>
      <p>{formatElapsed(Number(label))}</p>
      <p>
        {item.name}: {String(item.value ?? '')}
      </p>
      {typeof heldSinceElapsedMs === 'number' && <p>{heldSinceLabel(heldSinceElapsedMs)}</p>}
    </div>
  );
});

const renderActualSampleDot = (props: DotItemDotProps): ReactNode => {
  if (isDisplayOnlyMetricPoint(props.payload)) {
    return null;
  }

  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={3}
      fill={props.fill ?? props.stroke}
      stroke={props.stroke}
    />
  );
};

const getStatusLabel = (status: ServerStatus, t: Translate): string => {
  const translationKey: TranslationKey =
    STATUS_LABEL_KEYS[status] ?? 'dashboard.stats.statusValues.unknown';
  return t(translationKey);
};

const getTpsColor = (tps: number | null): string => {
  if (tps === null) {
    return '#a1a1aa';
  }
  if (tps >= 18) {
    return '#22c55e';
  }
  if (tps >= 15) {
    return '#eab308';
  }
  return '#ef4444';
};

const getMetricAxisDomain = (values: readonly number[]): [number, number] | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const padding = range === 0 ? Math.max(Math.abs(min) * 0.05, 1) : range * 0.05;

  return [Math.max(0, min - padding), max + padding];
};

const ResourceChartCard = memo(function ResourceChartCard({
  title,
  data,
  dataKey,
  stroke,
  fill,
  yDomain,
  emptyLabel,
  timeDomain,
  timeTicks,
  formatElapsed,
  elapsedAxisLabel,
  heldSinceLabel,
}: ResourceChartCardProps) {
  const actualValues = data
    .filter((point) => !isDisplayOnlyMetricPoint(point))
    .map((point) => point[dataKey]);
  const actualPointCount = actualValues.length;
  const actualDataYDomain = getMetricAxisDomain(actualValues);

  return (
    <article className="dashboard-view__chart-card surface-card rounded-2xl">
      <h3 className="dashboard-view__chart-title section-title">{title}</h3>
      <div className="dashboard-view__chart-body">
        {actualPointCount === 0 ? (
          <div className="dashboard-view__chart-empty">{emptyLabel}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
              <XAxis
                dataKey="elapsedMs"
                type="number"
                domain={timeDomain}
                ticks={timeTicks}
                tickFormatter={formatElapsed}
                allowDataOverflow
                label={{
                  value: elapsedAxisLabel,
                  position: 'insideBottom',
                  offset: -12,
                  fontSize: 10,
                  fill: AXIS_STROKE_COLOR,
                }}
                stroke={AXIS_STROKE_COLOR}
                tick={TICK_STYLE}
                minTickGap={24}
              />
              <YAxis
                stroke={AXIS_STROKE_COLOR}
                tick={TICK_STYLE}
                domain={yDomain ?? actualDataYDomain}
                allowDataOverflow
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                content={(props) => (
                  <MetricChartTooltip
                    {...props}
                    formatElapsed={formatElapsed}
                    heldSinceLabel={heldSinceLabel}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={stroke}
                fill={fill}
                isAnimationActive={false}
                dot={actualPointCount === 1 ? renderActualSampleDot : false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
});

const TpsChartCard = memo(function TpsChartCard({
  title,
  data,
  emptyLabel,
  timeDomain,
  timeTicks,
  formatElapsed,
  elapsedAxisLabel,
  heldSinceLabel,
}: TpsChartCardProps) {
  const actualPointCount = data.filter((point) => !isDisplayOnlyMetricPoint(point)).length;

  return (
    <article className="dashboard-view__chart-card dashboard-view__chart-card--tps surface-card rounded-2xl">
      <h3 className="dashboard-view__chart-title section-title">{title}</h3>
      <div className="dashboard-view__chart-body">
        {actualPointCount === 0 ? (
          <div className="dashboard-view__chart-empty">{emptyLabel}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
              <XAxis
                dataKey="elapsedMs"
                type="number"
                domain={timeDomain}
                ticks={timeTicks}
                tickFormatter={formatElapsed}
                allowDataOverflow
                label={{
                  value: elapsedAxisLabel,
                  position: 'insideBottom',
                  offset: -12,
                  fontSize: 10,
                  fill: AXIS_STROKE_COLOR,
                }}
                stroke={AXIS_STROKE_COLOR}
                tick={TICK_STYLE}
                minTickGap={24}
              />
              <YAxis
                stroke={AXIS_STROKE_COLOR}
                tick={TICK_STYLE}
                domain={TPS_Y_DOMAIN}
                allowDataOverflow
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                content={(props) => (
                  <MetricChartTooltip
                    {...props}
                    formatElapsed={formatElapsed}
                    heldSinceLabel={heldSinceLabel}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="tps"
                stroke="#22c55e"
                fill="rgba(34, 197, 94, 0.24)"
                isAnimationActive={false}
                dot={actualPointCount === 1 ? renderActualSampleDot : false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
});

export default function DashboardView({ server }: Props) {
  const { t } = useTranslation();
  const snapshot = useServerMetricHistoryStore((state) => state.snapshotsByServer[server.id]);
  const receivedAt = useServerMetricHistoryStore(
    (state) => state.receivedAtByServer[server.id] ?? 0,
  );
  const [clockNow, setClockNow] = useState(() => performance.now());
  const generation = snapshot?.generation;

  useEffect(() => {
    if (generation === undefined) {
      return;
    }
    setClockNow(performance.now());
    const id = window.setInterval(() => setClockNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [server.id, generation]);

  const elapsedMs = snapshot ? snapshot.elapsedMs + Math.max(0, clockNow - receivedAt) : 0;
  const uptime = snapshot ? formatMetricUptime(elapsedMs) : '--:--:--';
  const timeDomain = useMemo(() => getMetricTimeDomain(elapsedMs), [elapsedMs]);
  const timeTicks = useMemo(() => getMetricTimeTicks(timeDomain), [timeDomain]);
  const formatElapsed = useCallback(
    (value: number) => t('dashboard.charts.elapsedSeconds', { seconds: Math.floor(value / 1_000) }),
    [t],
  );
  const resourceStats = useMemo(
    () =>
      snapshot?.resource.map((point) => ({
        ...point,
        cpu: normalizeMetric(clampMetric(point.cpu, 0, 100), 1),
        memory: Math.max(0, Math.round(point.memory / 1024 / 1024)),
      })) ?? EMPTY_RESOURCE_STATS,
    [snapshot?.resource],
  );
  const tpsStats = snapshot?.tps ?? EMPTY_TPS_STATS;
  const resourceWindowStats = useMemo(
    () => getMetricWindowPoints(resourceStats, elapsedMs),
    [elapsedMs, resourceStats],
  );
  const tpsWindowStats = useMemo(
    () => getMetricWindowPoints(tpsStats, elapsedMs),
    [elapsedMs, tpsStats],
  );
  const resourceChartStats = useMemo(
    () => createMetricDisplaySeries(resourceStats, elapsedMs),
    [elapsedMs, resourceStats],
  );
  const tpsChartStats = useMemo(
    () => createMetricDisplaySeries(tpsStats, elapsedMs),
    [elapsedMs, tpsStats],
  );
  const heldSinceLabel = useCallback(
    (sampleElapsedMs: number) =>
      t('dashboard.charts.heldSince', { time: formatElapsed(sampleElapsedMs) }),
    [formatElapsed, t],
  );

  const supportsTpsPolling = useMemo(() => {
    return server.software === 'Paper' || server.software === 'LeafMC';
  }, [server.software]);

  const currentCpu = useMemo(() => {
    return resourceWindowStats[resourceWindowStats.length - 1]?.cpu ?? 0;
  }, [resourceWindowStats]);

  const currentMem = useMemo(() => {
    return resourceWindowStats[resourceWindowStats.length - 1]?.memory ?? 0;
  }, [resourceWindowStats]);

  const currentTps = useMemo(() => {
    return tpsWindowStats[tpsWindowStats.length - 1]?.tps ?? null;
  }, [tpsWindowStats]);

  const statusColor = useMemo(() => {
    return getStatusColor(server.status);
  }, [server.status]);

  const statusLabel = useMemo(() => {
    return getStatusLabel(server.status, t);
  }, [server.status, t]);

  const tpsColor = useMemo(() => {
    return getTpsColor(currentTps);
  }, [currentTps]);

  const tpsSamplingLabel = useMemo(() => {
    return supportsTpsPolling
      ? t('dashboard.stats.tpsAutoSampled')
      : t('dashboard.stats.tpsLogBased');
  }, [supportsTpsPolling, t]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void tauriListen<{ serverId: string; cpu: number; memory: number }>('server-stats', (data) => {
      if (
        data.serverId !== server.id ||
        typeof data.cpu !== 'number' ||
        !Number.isFinite(data.cpu)
      ) {
        return;
      }

      const now = Date.now();
      const cpuVal = normalizeMetric(clampMetric(data.cpu, 0, 100), 1);
      if (server.notifyOnHighCpu) {
        const threshold = server.notifyHighCpuThreshold ?? 90;
        if (cpuVal >= threshold) {
          const cooldownKey = `cpu-notify-${server.id}`;
          const lastNotified = Number(sessionStorage.getItem(cooldownKey) ?? '0');
          if (now - lastNotified >= 5 * 60 * 1000) {
            sessionStorage.setItem(cooldownKey, String(now));
            void sendServerNotification(server.name, t('server.notification.highCpu'));
          }
        }
      }
    }).then((u) => {
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [server.id, server.notifyOnHighCpu, server.notifyHighCpuThreshold, server.name, t]);

  return (
    <div
      className="dashboard-view flex h-full flex-col gap-4 overflow-y-auto p-5 max-[920px]:p-4"
      data-testid="dashboard-view"
    >
      <header className="dashboard-view__header surface-card rounded-2xl">
        <div className="dashboard-view__header-main">
          <h2 className="dashboard-view__title">{t('dashboard.title', { name: server.name })}</h2>
          <p className="dashboard-view__header-meta section-title">
            {t('dashboard.stats.software')}: {server.software} {server.version}
          </p>
        </div>
        <div className="dashboard-view__header-status">
          <span className="section-title">{t('dashboard.stats.status')}</span>
          <span className="dashboard-view__header-status-value" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>
      </header>

      <section className="dashboard-view__kpi-grid">
        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--status kpi-tile flex flex-col gap-1.5 rounded-xl p-4">
          <div className="kpi-tile__label">{t('dashboard.stats.status')}</div>
          <div className="kpi-tile__value" style={{ color: statusColor }}>
            {statusLabel}
          </div>
          <div className="kpi-tile__meta">
            {t('dashboard.stats.software')}: {server.software}
          </div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--tps kpi-tile flex flex-col gap-1.5 rounded-xl p-4">
          <div className="kpi-tile__label">{t('dashboard.stats.currentTps')}</div>
          <div className="kpi-tile__value" style={{ color: tpsColor }}>
            {currentTps === null ? '--' : currentTps.toFixed(2)}
          </div>
          <div className="kpi-tile__meta">{tpsSamplingLabel}</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--cpu kpi-tile flex flex-col gap-1.5 rounded-xl p-4">
          <div className="kpi-tile__label">{t('dashboard.stats.currentCpu')}</div>
          <div className="kpi-tile__value">{currentCpu}%</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--memory kpi-tile flex flex-col gap-1.5 rounded-xl p-4">
          <div className="kpi-tile__label">{t('dashboard.stats.currentMemory')}</div>
          <div className="kpi-tile__value">{currentMem} MB</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--software kpi-tile flex flex-col gap-1.5 rounded-xl p-4">
          <div className="kpi-tile__label">{t('dashboard.stats.software')}</div>
          <div className="kpi-tile__value dashboard-view__software-value">{server.software}</div>
          <div className="kpi-tile__meta">{server.version}</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--uptime kpi-tile flex flex-col gap-1.5 rounded-xl p-4">
          <div className="kpi-tile__label">{t('dashboard.stats.uptime')}</div>
          <div className="kpi-tile__value dashboard-view__uptime-value">{uptime}</div>
        </article>
      </section>

      <section className="dashboard-view__chart-grid">
        <ResourceChartCard
          title={t('dashboard.charts.cpuLast60s')}
          data={resourceChartStats}
          dataKey="cpu"
          stroke="#38bdf8"
          fill="rgba(56, 189, 248, 0.28)"
          yDomain={CPU_Y_DOMAIN}
          emptyLabel={t('dashboard.charts.metricsNoData')}
          timeDomain={timeDomain}
          timeTicks={timeTicks}
          formatElapsed={formatElapsed}
          elapsedAxisLabel={t('dashboard.charts.elapsedTime')}
          heldSinceLabel={heldSinceLabel}
        />

        <ResourceChartCard
          title={t('dashboard.charts.memoryLast60s')}
          data={resourceChartStats}
          dataKey="memory"
          stroke="#34d399"
          fill="rgba(52, 211, 153, 0.24)"
          emptyLabel={t('dashboard.charts.metricsNoData')}
          timeDomain={timeDomain}
          timeTicks={timeTicks}
          formatElapsed={formatElapsed}
          elapsedAxisLabel={t('dashboard.charts.elapsedTime')}
          heldSinceLabel={heldSinceLabel}
        />

        <TpsChartCard
          title={t('dashboard.charts.tpsLast60s')}
          data={tpsChartStats}
          emptyLabel={t('dashboard.charts.tpsNoData')}
          timeDomain={timeDomain}
          timeTicks={timeTicks}
          formatElapsed={formatElapsed}
          elapsedAxisLabel={t('dashboard.charts.elapsedTime')}
          heldSinceLabel={heldSinceLabel}
        />
      </section>
    </div>
  );
}
