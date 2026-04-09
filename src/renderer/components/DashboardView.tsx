import { useEffect, useState } from 'react';
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
import { type MinecraftServer } from '../components/../shared/server declaration';

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

const METRIC_WINDOW_MS = 60_000;
const TPS_POLL_INTERVAL_MS = 5_000;
const ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

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

export default function DashboardView({ server }: Props) {
  const { t } = useTranslation();
  const [resourceStats, setResourceStats] = useState<ResourcePoint[]>([]);
  const [tpsStats, setTpsStats] = useState<TpsPoint[]>([]);
  const [currentCpu, setCurrentCpu] = useState(0);
  const [currentMem, setCurrentMem] = useState(0);
  const [currentTps, setCurrentTps] = useState<number | null>(null);

  const supportsTpsPolling = server.software === 'Paper' || server.software === 'LeafMC';

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

      setCurrentCpu(cpuVal);
      setCurrentMem(memVal);

      setResourceStats((prev) => {
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
      setCurrentTps(tpsValue);
      setTpsStats((prev) => {
        const latest = prev[prev.length - 1];
        if (latest && now - latest.timestamp < 1000 && latest.tps === tpsValue) {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#10b981';
      case 'offline':
        return '#ef4444';
      case 'starting':
        return '#eab308';
      case 'stopping':
        return '#f97316';
      case 'restarting':
        return '#3b82f6';
      case 'crashed':
        return '#f43f5e';
      default:
        return '#aaa';
    }
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

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'online':
        return t('dashboard.stats.statusValues.online');
      case 'offline':
        return t('dashboard.stats.statusValues.offline');
      case 'starting':
        return t('dashboard.stats.statusValues.starting');
      case 'stopping':
        return t('dashboard.stats.statusValues.stopping');
      case 'restarting':
        return t('dashboard.stats.statusValues.restarting');
      case 'crashed':
        return t('dashboard.stats.statusValues.crashed');
      default:
        return t('dashboard.stats.statusValues.unknown');
    }
  };

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
          <span
            className="dashboard-view__header-status-value"
            style={{ color: getStatusColor(server.status) }}
          >
            {getStatusLabel(server.status)}
          </span>
        </div>
      </header>

      <section className="dashboard-view__kpi-grid">
        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--status kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.status')}</div>
          <div className="kpi-tile__value" style={{ color: getStatusColor(server.status) }}>
            {getStatusLabel(server.status)}
          </div>
          <div className="kpi-tile__meta">
            {t('dashboard.stats.software')}: {server.software}
          </div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--tps kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.currentTps')}</div>
          <div className="kpi-tile__value" style={{ color: getTpsColor(currentTps) }}>
            {currentTps === null ? '--' : currentTps.toFixed(2)}
          </div>
          <div className="kpi-tile__meta">
            {supportsTpsPolling
              ? t('dashboard.stats.tpsAutoSampled')
              : t('dashboard.stats.tpsLogBased')}
          </div>
        </article>

        <article className="dashboard-view__kpi-card kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.currentCpu')}</div>
          <div className="kpi-tile__value" style={{ color: '#38bdf8' }}>
            {currentCpu}%
          </div>
        </article>

        <article className="dashboard-view__kpi-card kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.currentMemory')}</div>
          <div className="kpi-tile__value" style={{ color: '#34d399' }}>
            {currentMem} MB
          </div>
        </article>

        <article className="dashboard-view__kpi-card dashboard-view__kpi-card--software kpi-tile">
          <div className="kpi-tile__label">{t('dashboard.stats.software')}</div>
          <div className="kpi-tile__value dashboard-view__software-value">{server.software}</div>
          <div className="kpi-tile__meta">{server.version}</div>
        </article>
      </section>

      <section className="dashboard-view__chart-grid">
        <article className="dashboard-view__chart-card surface-card">
          <h3 className="dashboard-view__chart-title section-title">
            {t('dashboard.charts.cpuLast60s')}
          </h3>
          <div className="dashboard-view__chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={resourceStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  minTickGap={24}
                />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid rgba(82, 82, 91, 0.7)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#38bdf8"
                  fill="rgba(56, 189, 248, 0.28)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dashboard-view__chart-card surface-card">
          <h3 className="dashboard-view__chart-title section-title">
            {t('dashboard.charts.memoryLast60s')}
          </h3>
          <div className="dashboard-view__chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={resourceStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  minTickGap={24}
                />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid rgba(82, 82, 91, 0.7)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="#34d399"
                  fill="rgba(52, 211, 153, 0.24)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dashboard-view__chart-card dashboard-view__chart-card--tps surface-card">
          <h3 className="dashboard-view__chart-title section-title">
            {t('dashboard.charts.tpsLast60s')}
          </h3>
          <div className="dashboard-view__chart-body">
            {tpsStats.length === 0 ? (
              <div className="dashboard-view__chart-empty">{t('dashboard.charts.tpsNoData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tpsStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="timeLabel"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    minTickGap={24}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} domain={[0, 22]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: '1px solid rgba(82, 82, 91, 0.7)',
                    }}
                  />
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
      </section>
    </div>
  );
}
