import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LineChart, type LineChartDatum } from '@/components/arc/line-chart/line-chart';
import { MetricCard } from '@/components/arc/metric-card/metric-card';
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
  normalizeMetric,
} from '../shared/server-metrics';
import { useServerMetricHistoryStore } from '../../store/serverMetricHistoryStore';
import styles from './DashboardView.module.css';

interface Props {
  server: MinecraftServer;
}

const EMPTY_RESOURCE_STATS: ResourcePoint[] = [];
const EMPTY_TPS_STATS: TpsPoint[] = [];
const CHART_HEIGHT = 200;
const SERIES_KEY = 'value';

const STATUS_LABEL_KEYS: Record<ServerStatus, TranslationKey> = {
  online: 'dashboard.stats.statusValues.online',
  offline: 'dashboard.stats.statusValues.offline',
  starting: 'dashboard.stats.statusValues.starting',
  stopping: 'dashboard.stats.statusValues.stopping',
  restarting: 'dashboard.stats.statusValues.restarting',
  crashed: 'dashboard.stats.statusValues.crashed',
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

/** The anchor is the last sample before the window. It only carries the line in, so it never becomes a datum of its own. */
const isWindowAnchor = (point: unknown): boolean => {
  return isDisplayOnlyMetricPoint(point) && point.windowAnchor === true;
};

const getStatusLabel = (status: ServerStatus, t: Translate): string => {
  const translationKey: TranslationKey =
    STATUS_LABEL_KEYS[status] ?? 'dashboard.stats.statusValues.unknown';
  return t(translationKey);
};

type TpsTone = 'good' | 'fair' | 'poor' | 'none';

const getTpsTone = (tps: number | null): TpsTone => {
  if (tps === null) {
    return 'none';
  }
  if (tps >= 18) {
    return 'good';
  }
  if (tps >= 15) {
    return 'fair';
  }
  return 'poor';
};

interface KpiTileProps {
  testId: string;
  label: string;
  value: ReactNode;
  context?: string;
  tone?: TpsTone;
}

/** Same anatomy as the Arc MetricCard, for values MetricCard cannot show: text, a missing sample, or a threshold color. */
function KpiTile({ testId, label, value, context, tone }: KpiTileProps) {
  return (
    <article className={styles.kpi} data-testid={testId}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue} data-tone={tone} data-testid={`${testId}-value`}>
        {value}
      </p>
      {context && <p className={styles.kpiContext}>{context}</p>}
    </article>
  );
}

/**
 * Arc LineChart spaces its data evenly rather than by time, so each measured point is one datum. A display-only point
 * holds the latest value up to now, and its tooltip title says when that value was measured.
 */
function toMetricChartData<T extends { elapsedMs: number }>(
  series: readonly MetricDisplayPoint<T>[],
  valueOf: (point: T) => number,
  formatElapsed: (elapsedMs: number) => string,
  heldSinceLabel: (elapsedMs: number) => string,
): LineChartDatum[] {
  const data: LineChartDatum[] = [];
  for (const point of series) {
    if (isWindowAnchor(point)) {
      continue;
    }
    const elapsed = formatElapsed(point.elapsedMs);
    if (isDisplayOnlyMetricPoint(point)) {
      data.push({
        key: `${point.elapsedMs}-held`,
        label: `${elapsed} · ${heldSinceLabel(point.measuredAtElapsedMs)}`,
        axisLabel: elapsed,
        values: { [SERIES_KEY]: valueOf(point) },
      });
      continue;
    }
    data.push({
      key: `${point.elapsedMs}`,
      label: elapsed,
      axisLabel: elapsed,
      values: { [SERIES_KEY]: valueOf(point) },
    });
  }
  return data;
}

interface MetricChartCardProps {
  testId: string;
  title: string;
  seriesLabel: string;
  data: LineChartDatum[];
  emptyLabel: string;
  elapsedAxisLabel: string;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
}

function MetricChartCard({
  testId,
  title,
  seriesLabel,
  data,
  emptyLabel,
  elapsedAxisLabel,
  formatValue,
  formatTick,
}: MetricChartCardProps) {
  return (
    <article className={styles.chartCard} data-testid={testId}>
      <h3 className={styles.chartTitle}>{title}</h3>
      <LineChart
        label={title}
        data={data}
        series={[{ key: SERIES_KEY, label: seriesLabel }]}
        height={CHART_HEIGHT}
        formatValue={formatValue}
        formatTick={formatTick}
        emptyLabel={emptyLabel}
        categoryLabel={elapsedAxisLabel}
        legend={false}
      />
      <p className={styles.chartAxis}>{elapsedAxisLabel}</p>
    </article>
  );
}

export default function DashboardView({ server }: Props) {
  const { t, locale } = useTranslation();
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

  const statusLabel = useMemo(() => {
    return getStatusLabel(server.status, t);
  }, [server.status, t]);

  const tpsTone = useMemo(() => {
    return getTpsTone(currentTps);
  }, [currentTps]);

  const formatters = useMemo(
    () => ({
      tps: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      decimal: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      whole: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    }),
    [locale],
  );
  const megabytesLabel = t('dashboard.units.megabytes');

  const cpuChartData = useMemo(
    () =>
      toMetricChartData(
        resourceChartStats,
        (point: ResourcePoint) => point.cpu,
        formatElapsed,
        heldSinceLabel,
      ),
    [formatElapsed, heldSinceLabel, resourceChartStats],
  );
  const memoryChartData = useMemo(
    () =>
      toMetricChartData(
        resourceChartStats,
        (point: ResourcePoint) => point.memory,
        formatElapsed,
        heldSinceLabel,
      ),
    [formatElapsed, heldSinceLabel, resourceChartStats],
  );
  const tpsChartData = useMemo(
    () =>
      toMetricChartData(
        tpsChartStats,
        (point: TpsPoint) => point.tps,
        formatElapsed,
        heldSinceLabel,
      ),
    [formatElapsed, heldSinceLabel, tpsChartStats],
  );

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

  const statusDot = <span className={styles.dot} data-status={server.status} aria-hidden="true" />;

  return (
    <div className={styles.page} data-testid="dashboard-view">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('dashboard.title', { name: server.name })}</h2>
          <p className={styles.meta}>
            {t('dashboard.stats.software')}: {server.software} {server.version}
          </p>
        </div>
        <div className={styles.headerStatus}>
          <span>{t('dashboard.stats.status')}</span>
          <span className={styles.statusValue} data-testid="dashboard-status">
            {statusDot}
            {statusLabel}
          </span>
        </div>
      </header>

      <section className={styles.kpiGrid} aria-label={t('dashboard.stats.kpiLabel')}>
        <KpiTile
          testId="dashboard-kpi-status"
          label={t('dashboard.stats.status')}
          value={
            <span className={styles.statusValue}>
              {statusDot}
              {statusLabel}
            </span>
          }
          context={`${t('dashboard.stats.software')}: ${server.software}`}
        />

        <KpiTile
          testId="dashboard-kpi-tps"
          label={t('dashboard.stats.currentTps')}
          value={currentTps === null ? '--' : formatters.tps.format(currentTps)}
          tone={tpsTone}
          context={tpsSamplingLabel}
        />

        <div data-testid="dashboard-kpi-cpu">
          <MetricCard
            label={t('dashboard.stats.currentCpu')}
            value={currentCpu}
            suffix="%"
            context={t('dashboard.stats.latestSample')}
          />
        </div>

        <div data-testid="dashboard-kpi-memory">
          <MetricCard
            label={t('dashboard.stats.currentMemory')}
            value={currentMem}
            suffix={` ${megabytesLabel}`}
            context={t('dashboard.stats.latestSample')}
          />
        </div>

        <KpiTile
          testId="dashboard-kpi-software"
          label={t('dashboard.stats.software')}
          value={server.software}
          context={server.version}
        />

        <KpiTile testId="dashboard-kpi-uptime" label={t('dashboard.stats.uptime')} value={uptime} />
      </section>

      <section className={styles.chartGrid}>
        <MetricChartCard
          testId="dashboard-chart-cpu"
          title={t('dashboard.charts.cpuLast60s')}
          seriesLabel={t('dashboard.charts.seriesCpu')}
          data={cpuChartData}
          emptyLabel={t('dashboard.charts.metricsNoData')}
          elapsedAxisLabel={t('dashboard.charts.elapsedTime')}
          formatValue={(value) => `${formatters.decimal.format(value)}%`}
          formatTick={(value) => `${formatters.whole.format(value)}%`}
        />

        <MetricChartCard
          testId="dashboard-chart-memory"
          title={t('dashboard.charts.memoryLast60s')}
          seriesLabel={t('dashboard.charts.seriesMemory')}
          data={memoryChartData}
          emptyLabel={t('dashboard.charts.metricsNoData')}
          elapsedAxisLabel={t('dashboard.charts.elapsedTime')}
          formatValue={(value) => `${formatters.whole.format(value)} ${megabytesLabel}`}
          formatTick={(value) => formatters.whole.format(value)}
        />

        <MetricChartCard
          testId="dashboard-chart-tps"
          title={t('dashboard.charts.tpsLast60s')}
          seriesLabel={t('dashboard.charts.seriesTps')}
          data={tpsChartData}
          emptyLabel={t('dashboard.charts.tpsNoData')}
          elapsedAxisLabel={t('dashboard.charts.elapsedTime')}
          formatValue={(value) => formatters.tps.format(value)}
          formatTick={(value) => formatters.decimal.format(value)}
        />
      </section>
    </div>
  );
}
