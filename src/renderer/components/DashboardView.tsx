import { memo, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from '../../i18n';
import { sendCommand } from '../../lib/server-commands';
import { tauriListen } from '../../lib/tauri-api';
import {
  type MinecraftServer,
  type ServerStatus,
} from '../components/../shared/server declaration';

interface Props {
  server: MinecraftServer;
}

type ResourcePoint = {
  timestamp: number;
  timeLabel: string;
  cpu: number;
  memory: number;
};

type TpsPoint = {
  timestamp: number;
  timeLabel: string;
  tps: number;
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

interface ResourceChartCardProps {
  title: string;
  data: ResourcePoint[];
  dataKey: 'cpu' | 'memory';
  stroke: string;
  fill: string;
  yDomain?: [number, number];
}

interface TpsChartCardProps {
  title: string;
  data: TpsPoint[];
  emptyLabel: string;
}

const METRIC_WINDOW_MS = 60_000;
const TPS_POLL_INTERVAL_MS = 5_000;
const STATS_DEDUPE_WINDOW_MS = 1_000;
const ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

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

const STATUS_LABEL_KEYS: Record<ServerStatus, string> = {
  online: 'dashboard.stats.statusValues.online',
  offline: 'dashboard.stats.statusValues.offline',
  starting: 'dashboard.stats.statusValues.starting',
  stopping: 'dashboard.stats.statusValues.stopping',
  restarting: 'dashboard.stats.statusValues.restarting',
  crashed: 'dashboard.stats.statusValues.crashed',
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const normalizeMetric = (value: number, precision = 1): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const formatMetricTimeLabel = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], {
    minute: '2-digit',
    second: '2-digit',
  });
};

const pruneMetricWindow = <T extends { timestamp: number }>(points: T[], now: number): T[] => {
  return points.filter((point) => now - point.timestamp <= METRIC_WINDOW_MS);
};

const stripFormattingCodes = (line: string): string => {
  return line
    .replace(/§x(§[0-9A-Fa-f]){6}/g, '')
    .replace(/[§&][0-9A-FK-ORX]/gi, '')
    .replace(ANSI_ESCAPE_REGEX, '');
};

const extractTpsFromLogLine = (line: string): number | null => {
  const normalizedLine = stripFormattingCodes(line);
  const matches = [
    normalizedLine.match(/TPS(?:\s+from\s+last[\w\s,]+)?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i),
    normalizedLine.match(/Current\s+TPS\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i),
    normalizedLine.match(/\bTPS\b[^0-9]+([0-9]+(?:\.[0-9]+)?)/i),
  ];

  for (const match of matches) {
    const raw = match?.[1];
    if (!raw) {
      continue;
    }

    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return clamp(normalizeMetric(parsed, 2), 0, 25);
    }
  }

  return null;
};

const getStatusColor = (status: ServerStatus): string => {
  return STATUS_COLORS[status] ?? '#aaa';
};

const getStatusLabel = (status: ServerStatus, t: Translate): string => {
  const translationKey = STATUS_LABEL_KEYS[status] ?? 'dashboard.stats.statusValues.unknown';
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

const ResourceChartCard = memo(function ResourceChartCard({
  title,
  data,
  dataKey,
  stroke,
  fill,
  yDomain,
}: ResourceChartCardProps) {
  return (
    <article className="dashboard-view__chart-card surface-card">
      <h3 className="dashboard-view__chart-title section-title">{title}</h3>
      <div className="dashboard-view__chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
            <XAxis
              dataKey="timeLabel"
              stroke={AXIS_STROKE_COLOR}
              tick={TICK_STYLE}
              minTickGap={24}
            />
            <YAxis stroke={AXIS_STROKE_COLOR} tick={TICK_STYLE} domain={yDomain} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              fill={fill}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
});

const TpsChartCard = memo(function TpsChartCard({ title, data, emptyLabel }: TpsChartCardProps) {
  return (
    <article className="dashboard-view__chart-card dashboard-view__chart-card--tps surface-card">
      <h3 className="dashboard-view__chart-title section-title">{title}</h3>
      <div className="dashboard-view__chart-body">
        {data.length === 0 ? (
          <div className="dashboard-view__chart-empty">{emptyLabel}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
              <XAxis
                dataKey="timeLabel"
                stroke={AXIS_STROKE_COLOR}
                tick={TICK_STYLE}
                minTickGap={24}
              />
              <YAxis stroke={AXIS_STROKE_COLOR} tick={TICK_STYLE} domain={TPS_Y_DOMAIN} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="tps"
                stroke="#22c55e"
                fill="rgba(34, 197, 94, 0.24)"
                isAnimationActive={false}
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
  const [resourceStats, setResourceStats] = useState<ResourcePoint[]>([]);
  const [tpsStats, setTpsStats] = useState<TpsPoint[]>([]);

  useEffect(() => {
    setResourceStats([]);
    setTpsStats([]);
  }, [server.id, server.software]);

  const supportsTpsPolling = useMemo(() => {
    return server.software === 'Paper' || server.software === 'LeafMC';
  }, [server.software]);

  const currentCpu = useMemo(() => {
    return resourceStats[resourceStats.length - 1]?.cpu ?? 0;
  }, [resourceStats]);

  const currentMem = useMemo(() => {
    return resourceStats[resourceStats.length - 1]?.memory ?? 0;
  }, [resourceStats]);

  const currentTps = useMemo(() => {
    return tpsStats[tpsStats.length - 1]?.tps ?? null;
  }, [tpsStats]);

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
      if (data.serverId !== server.id) {
        return;
      }

      const now = Date.now();
      const rawCpu = typeof data.cpu === 'number' && Number.isFinite(data.cpu) ? data.cpu : 0;
      const rawMemory =
        typeof data.memory === 'number' && Number.isFinite(data.memory) ? data.memory : 0;
      const cpuVal = normalizeMetric(clamp(rawCpu, 0, 100), 1);
      const memVal = Math.max(0, Math.round(rawMemory / 1024 / 1024));

      setResourceStats((prev) => {
        const latest = prev[prev.length - 1];
        if (
          latest &&
          now - latest.timestamp < STATS_DEDUPE_WINDOW_MS &&
          latest.cpu === cpuVal &&
          latest.memory === memVal
        ) {
          return prev;
        }

        const next = [
          ...prev,
          {
            timestamp: now,
            timeLabel: formatMetricTimeLabel(now),
            cpu: cpuVal,
            memory: memVal,
          },
        ];
        return pruneMetricWindow(next, now);
      });
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
  }, [server.id]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void tauriListen<{ serverId: string; line: string }>('server-log', (data) => {
      if (data.serverId !== server.id) {
        return;
      }

      const tpsValue = extractTpsFromLogLine(data.line);
      if (tpsValue === null) {
        return;
      }

      const now = Date.now();
      setTpsStats((prev) => {
        const latest = prev[prev.length - 1];
        if (latest && now - latest.timestamp < STATS_DEDUPE_WINDOW_MS && latest.tps === tpsValue) {
          return prev;
        }

        const next = [
          ...prev,
          {
            timestamp: now,
            timeLabel: formatMetricTimeLabel(now),
            tps: tpsValue,
          },
        ];
        return pruneMetricWindow(next, now);
      });
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
  }, [server.id]);

  useEffect(() => {
    if (!supportsTpsPolling || server.status !== 'online') {
      return;
    }

    const requestTps = async () => {
      try {
        await sendCommand(server.id, 'tps');
      } catch {
        // nop
      }
    };

    void requestTps();
    const intervalId = window.setInterval(() => {
      void requestTps();
    }, TPS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [server.id, server.status, supportsTpsPolling]);

  return (
    <div className="dashboard-view">
      <header className="dashboard-view__header surface-card">
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
        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--status kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.status')}</div>
          <div className="kpi-tile__value" style={{ color: statusColor }}>
            {statusLabel}
          </div>
          <div className="kpi-tile__meta">
            {t('dashboard.stats.software')}: {server.software}
          </div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--tps kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.currentTps')}</div>
          <div className="kpi-tile__value" style={{ color: tpsColor }}>
            {currentTps === null ? '--' : currentTps.toFixed(2)}
          </div>
          <div className="kpi-tile__meta">{tpsSamplingLabel}</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--cpu kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.currentCpu')}</div>
          <div className="kpi-tile__value">{currentCpu}%</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--memory kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.currentMemory')}</div>
          <div className="kpi-tile__value">{currentMem} MB</div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--software kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.software')}</div>
          <div className="kpi-tile__value dashboard-view__software-value">{server.software}</div>
          <div className="kpi-tile__meta">{server.version}</div>
        </article>
      </section>

      <section className="dashboard-view__chart-grid">
        <ResourceChartCard
          title={t('dashboard.charts.cpuLast60s')}
          data={resourceStats}
          dataKey="cpu"
          stroke="#38bdf8"
          fill="rgba(56, 189, 248, 0.28)"
          yDomain={CPU_Y_DOMAIN}
        />

        <ResourceChartCard
          title={t('dashboard.charts.memoryLast60s')}
          data={resourceStats}
          dataKey="memory"
          stroke="#34d399"
          fill="rgba(52, 211, 153, 0.24)"
        />

        <TpsChartCard
          title={t('dashboard.charts.tpsLast60s')}
          data={tpsStats}
          emptyLabel={t('dashboard.charts.tpsNoData')}
        />
      </section>
    </div>
  );
}
