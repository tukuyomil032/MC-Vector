import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cpu, Gauge, MemoryStick, Server, type LucideIcon } from 'lucide-react';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { LineChart, type LineChartDatum } from '@/components/arc/line-chart/line-chart';
import { type Translate, type TranslationKey, useTranslation } from '../../i18n';
import { useArcMessages } from '../shared/arc-messages';
import { formatBytes } from '../shared/format-bytes';
import { Phrase } from '../shared/japanese-phrase';
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
import { EmptyLine } from './ui/EmptyLine';
import { IconTile, SectionTitle } from './ui/IconTile';
import styles from './DashboardView.module.css';

interface Props {
  server: MinecraftServer;
}

const EMPTY_RESOURCE_STATS: ResourcePoint[] = [];
const EMPTY_TPS_STATS: TpsPoint[] = [];
const CHART_HEIGHT = 200;
/** The LineChart axis row sits under the plot, so the plot box is the plot height plus this row. */
const AXIS_ROW_HEIGHT = 26;
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

interface StatCardProps {
  testId: string;
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: TpsTone;
}

/** One measure at a glance: an icon tile, its label, and the value. Nothing else sits in the card. */
function StatCard({ testId, icon, label, value, tone }: StatCardProps) {
  return (
    <article className={styles.stat} data-testid={testId}>
      <div className={styles.statHead}>
        <IconTile icon={icon} size="md" />
        <p className={styles.statLabel}>
          <Phrase text={label} />
        </p>
      </div>
      <p className={styles.statValue} data-tone={tone} data-testid={`${testId}-value`}>
        {value}
      </p>
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
  /** Fixed value axis: CPU is a percentage, TPS tops out near the server's 20-tick target. */
  yDomain?: readonly [number, number];
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
  yDomain,
}: MetricChartCardProps) {
  const arc = useArcMessages();
  const hasData = data.length > 0;
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotBoxHeight, setPlotBoxHeight] = useState(0);

  // The plot box is whatever height the card gives it, so the chart measures that box and fills it.
  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!hasData || !plot || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setPlotBoxHeight(entry.contentRect.height);
      }
    });
    observer.observe(plot);
    return () => observer.disconnect();
  }, [hasData]);

  const chartHeight =
    plotBoxHeight > 0
      ? Math.max(CHART_HEIGHT, Math.floor(plotBoxHeight - AXIS_ROW_HEIGHT))
      : CHART_HEIGHT;

  return (
    <article className={styles.chartCard} data-testid={testId}>
      <h3 className={styles.chartTitle}>{title}</h3>
      {hasData ? (
        <div className={styles.plot} ref={plotRef}>
          <LineChart
            label={title}
            data={data}
            series={[{ key: SERIES_KEY, label: seriesLabel }]}
            height={chartHeight}
            formatValue={formatValue}
            formatTick={formatTick}
            categoryLabel={elapsedAxisLabel}
            legend={false}
            yDomain={yDomain}
            messages={arc.lineChart}
          />
        </div>
      ) : (
        // Without data there is no plot, so no gridlines or axis: one centered line in the plot's place.
        <div className={styles.chartEmpty}>
          <EmptyLine title={emptyLabel} />
        </div>
      )}
    </article>
  );
}

export default function DashboardView({ server }: Props) {
  const { t, locale } = useTranslation();
  const arc = useArcMessages();
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

  const address = `localhost:${server.port}`;

  return (
    <div className={styles.page} data-testid="dashboard-view">
      <div className={styles.overview}>
        <article className={styles.card} data-testid="dashboard-status-card">
          <SectionTitle as="h3" icon={Activity} title={t('dashboard.stats.status')} />
          <div className={styles.statusBody}>
            <p className={styles.statusValue} data-testid="dashboard-status">
              <span className={styles.dot} data-status={server.status} aria-hidden="true" />
              {statusLabel}
            </p>
            <p className={styles.uptime} data-testid="dashboard-kpi-uptime">
              <span>{t('dashboard.stats.uptime')}</span>
              <span className={styles.uptimeValue} data-testid="dashboard-kpi-uptime-value">
                {uptime}
              </span>
            </p>
          </div>
        </article>

        <article className={styles.card} data-testid="dashboard-server-card">
          <SectionTitle as="h3" icon={Server} title={t('dashboard.stats.serverInfo')} />
          <dl className={styles.facts}>
            <div>
              <dt className={styles.factLabel}>{t('dashboard.stats.software')}</dt>
              <dd className={styles.factValue} data-testid="dashboard-software">
                {server.software} {server.version}
              </dd>
            </div>
            <div>
              <dt className={styles.factLabel}>{t('dashboard.stats.address')}</dt>
              <dd className={styles.addressRow}>
                <code className={styles.address} data-testid="dashboard-address">
                  {address}
                </code>
                <CopyButton
                  value={address}
                  label={t('dashboard.stats.copyAddress')}
                  messages={arc.copy}
                  iconOnly
                  variant="plain"
                />
              </dd>
            </div>
            <div>
              <dt className={styles.factLabel}>{t('dashboard.stats.allocatedMemory')}</dt>
              <dd className={styles.factValue}>
                {formatBytes(server.memory * 1024 * 1024, locale)}
              </dd>
            </div>
            <div>
              <dt className={styles.factLabel}>{t('dashboard.stats.javaRuntime')}</dt>
              <dd className={styles.factValue}>
                {server.javaPath || t('serverSettings.javaSystemDefault')}
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <section className={styles.kpiGrid} aria-label={t('dashboard.stats.kpiLabel')}>
        <StatCard
          testId="dashboard-kpi-cpu"
          icon={Cpu}
          label={t('dashboard.stats.currentCpu')}
          value={`${formatters.decimal.format(currentCpu)}%`}
        />
        <StatCard
          testId="dashboard-kpi-memory"
          icon={MemoryStick}
          label={t('dashboard.stats.currentMemory')}
          value={`${formatters.whole.format(currentMem)} ${megabytesLabel}`}
        />
        <StatCard
          testId="dashboard-kpi-tps"
          icon={Gauge}
          label={t('dashboard.stats.currentTps')}
          value={currentTps === null ? '--' : formatters.tps.format(currentTps)}
          tone={tpsTone}
        />
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
          yDomain={[0, 100]}
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
          yDomain={[0, 22]}
        />
      </section>
    </div>
  );
}
