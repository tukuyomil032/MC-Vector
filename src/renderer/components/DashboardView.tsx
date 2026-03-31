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
  const [resourceStats, setResourceStats] = useState<ResourcePoint[]>([]);
  const [tpsStats, setTpsStats] = useState<TpsPoint[]>([]);
  const [currentCpu, setCurrentCpu] = useState(0);
  const [currentMem, setCurrentMem] = useState(0);
  const [currentTps, setCurrentTps] = useState<number | null>(null);

  const supportsTpsPolling = server.software === 'Paper' || server.software === 'LeafMC';

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    tauriListen<{ serverId: string; cpu: number; memory: number }>('server-stats', (data) => {
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
      unlisten = u;
    });

    return () => unlisten?.();
  }, [server.id]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    tauriListen<{ serverId: string; line: string }>('server-log', (data) => {
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
      unlisten = u;
    });

    return () => unlisten?.();
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

  return (
    <div className="dashboard-view">
      <h2 className="dashboard-view__title">Dashboard: {server.name}</h2>

      <div className="dashboard-view__stats-grid">
        <div className="dashboard-view__stat-card">
          <div className="dashboard-view__stat-label">Status</div>
          <div
            className="dashboard-view__stat-value"
            style={{ color: getStatusColor(server.status) }}
          >
            {server.status.toUpperCase()}
          </div>
        </div>
        <div className="dashboard-view__stat-card">
          <div className="dashboard-view__stat-label">Software</div>
          <div className="dashboard-view__stat-value">{server.software}</div>
          <div className="dashboard-view__stat-sub">{server.version}</div>
        </div>
        <div className="dashboard-view__stat-card">
          <div className="dashboard-view__stat-label">Current CPU</div>
          <div className="dashboard-view__stat-value" style={{ color: '#38bdf8' }}>
            {currentCpu}%
          </div>
        </div>
        <div className="dashboard-view__stat-card">
          <div className="dashboard-view__stat-label">Current Memory</div>
          <div className="dashboard-view__stat-value" style={{ color: '#34d399' }}>
            {currentMem} MB
          </div>
        </div>
        <div className="dashboard-view__stat-card">
          <div className="dashboard-view__stat-label">Current TPS</div>
          <div className="dashboard-view__stat-value" style={{ color: getTpsColor(currentTps) }}>
            {currentTps === null ? '--' : currentTps.toFixed(2)}
          </div>
          <div className="dashboard-view__stat-sub">
            {supportsTpsPolling ? 'Paper / LeafMC: auto sampled' : 'Log-based detection'}
          </div>
        </div>
      </div>

      <div className="dashboard-view__chart-grid">
        <div className="dashboard-view__chart-card">
          <h3 className="dashboard-view__chart-title">CPU Usage (%) - Last 60s</h3>
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
        </div>

        <div className="dashboard-view__chart-card">
          <h3 className="dashboard-view__chart-title">Memory Usage (MB) - Last 60s</h3>
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
        </div>

        <div className="dashboard-view__chart-card">
          <h3 className="dashboard-view__chart-title">TPS - Last 60s</h3>
          <div className="dashboard-view__chart-body">
            {tpsStats.length === 0 ? (
              <div className="dashboard-view__chart-empty">
                TPS data is not available yet. Keep the server online and wait for log sampling.
              </div>
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
        </div>
      </div>
    </div>
  );
}
