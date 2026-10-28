import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DotItemDotProps, TooltipContentProps } from 'recharts';
import DashboardView from '@/renderer/components/DashboardView';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import type { MetricHistorySnapshot } from '@/renderer/shared/server-metrics';
import { useServerMetricHistoryStore } from '@/store/serverMetricHistoryStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'dashboard.charts.elapsedSeconds') return `${values?.seconds}s`;
      if (key === 'dashboard.charts.heldSince') return `held since ${values?.time}`;
      return key;
    },
  }),
}));
vi.mock('@/lib/tauri-api', () => ({ tauriListen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('@/lib/notification-commands', () => ({ sendServerNotification: vi.fn() }));
const rechartsMockState = vi.hoisted(() => ({
  chartData: [] as unknown[],
  tooltipTarget: 'latest' as 'latest' | 'window-anchor',
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, minHeight }: { children: ReactNode; minHeight: number }) => (
    <div data-testid="chart-container" data-min-height={minHeight}>
      {children}
    </div>
  ),
  AreaChart: ({ children, data }: { children: ReactNode; data: unknown[] }) => {
    rechartsMockState.chartData = data as any[];
    return (
      <div data-testid="area-chart" data-count={data.length} data-series={JSON.stringify(data)}>
        {children}
      </div>
    );
  },
  Area: ({
    dataKey,
    dot,
    type,
  }: {
    dataKey: string;
    dot: boolean | object | ((props: DotItemDotProps) => ReactNode);
    type: string;
  }) => {
    const actualPayload = { elapsedMs: 70_000, cpu: 40, memory: 512, tps: 20 };
    const endpointPayload = {
      ...actualPayload,
      elapsedMs: 72_000,
      displayOnly: true,
      measuredAtElapsedMs: 70_000,
    };
    const anchorPayload = {
      ...actualPayload,
      elapsedMs: 19_000,
      displayOnly: true,
      windowAnchor: true,
      measuredAtElapsedMs: 19_000,
    };
    const renderDot = (payload: typeof actualPayload | typeof endpointPayload) =>
      typeof dot === 'function'
        ? dot({
            cx: 0,
            cy: 0,
            payload,
            points: [],
            index: 0,
            dataKey,
            value: 0,
          })
        : null;
    const actualDot = renderDot(actualPayload);
    const endpointDot = renderDot(endpointPayload);
    const anchorDot = renderDot(anchorPayload);
    return (
      <div
        data-testid="chart-area"
        data-key={dataKey}
        data-type={type}
        data-dot={
          typeof dot === 'function' ? 'custom' : typeof dot === 'object' ? 'point' : String(dot)
        }
        data-actual-dot={
          typeof dot === 'function' ? (actualDot === null ? 'hidden' : 'visible') : 'n/a'
        }
        data-endpoint-dot={
          typeof dot === 'function' ? (endpointDot === null ? 'hidden' : 'visible') : 'n/a'
        }
        data-anchor-dot={
          typeof dot === 'function' ? (anchorDot === null ? 'hidden' : 'visible') : 'n/a'
        }
      />
    );
  },
  XAxis: ({
    dataKey,
    type,
    domain,
    tickFormatter,
  }: {
    dataKey: string;
    type: string;
    domain: number[];
    tickFormatter: (value: number) => string;
  }) => (
    <div
      data-testid="chart-x-axis"
      data-key={dataKey}
      data-type={type}
      data-domain={JSON.stringify(domain)}
    >
      {tickFormatter(60_000)}
    </div>
  ),
  YAxis: ({ domain, allowDataOverflow }: { domain?: unknown; allowDataOverflow?: boolean }) => (
    <div
      data-testid="chart-y-axis"
      data-domain={JSON.stringify(domain ?? null)}
      data-allow-data-overflow={String(allowDataOverflow ?? false)}
    />
  ),
  Tooltip: ({ content }: { content: (props: TooltipContentProps) => ReactNode }) => {
    const points = rechartsMockState.chartData as Array<{
      elapsedMs: number;
      windowAnchor?: boolean;
      cpu?: number;
      memory?: number;
      tps?: number;
    }>;
    const point =
      rechartsMockState.tooltipTarget === 'window-anchor'
        ? points.find((candidate) => candidate.windowAnchor)
        : points.at(-1);
    if (!point) return null;
    return (
      <div data-testid="chart-tooltip">
        {content({
          active: true,
          label: String(point.elapsedMs),
          coordinate: undefined,
          accessibilityLayer: false,
          activeIndex: '0',
          payload: [
            {
              graphicalItemId: 'metric',
              name: 'metric',
              value: point.cpu ?? point.memory ?? point.tps,
              payload: point,
            },
          ],
        })}
      </div>
    );
  },
  CartesianGrid: () => null,
}));

const server: MinecraftServer = {
  id: 'server-a',
  name: 'A',
  version: '1.21',
  software: 'Paper',
  port: 25565,
  memory: 1024,
  path: '/servers/a',
  status: 'online',
};

function snapshot(count: number, elapsedMs = 72_000): MetricHistorySnapshot {
  return {
    serverId: server.id,
    generation: 1,
    sequence: count,
    elapsedMs,
    resource: Array.from({ length: count }, (_, index) => ({
      elapsedMs: 70_000 + index * 2_000,
      cpu: 40,
      memory: 512 * 1024 * 1024,
    })),
    tps: Array.from({ length: count }, (_, index) => ({
      elapsedMs: 70_000 + index * 2_000,
      tps: 20,
    })),
  };
}

describe('DashboardView metric charts', () => {
  beforeEach(() => {
    rechartsMockState.chartData = [];
    rechartsMockState.tooltipTarget = 'latest';
    useServerMetricHistoryStore.setState({
      snapshotsByServer: {},
      receivedAtByServer: {},
      completedGenerationByServer: {},
    });
  });

  it('shows a waiting message for empty resource and TPS histories', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(0));
    render(<DashboardView server={server} />);
    expect(screen.getAllByText('dashboard.charts.metricsNoData')).toHaveLength(2);
    expect(screen.getByText('dashboard.charts.tpsNoData')).toBeInTheDocument();
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
  });

  it('keeps the waiting state and excludes an anchor-only snapshot from readouts', () => {
    useServerMetricHistoryStore.getState().applySnapshot({
      ...snapshot(0, 80_000),
      resource: [
        { elapsedMs: 0, cpu: 95, memory: 1024 * 1024 * 1024 },
        { elapsedMs: 19_000, cpu: 90, memory: 900 * 1024 * 1024 },
      ],
      tps: [
        { elapsedMs: 0, tps: 5 },
        { elapsedMs: 19_000, tps: 6 },
      ],
    });
    const { container } = render(<DashboardView server={server} />);

    expect(screen.getAllByText('dashboard.charts.metricsNoData')).toHaveLength(2);
    expect(screen.getByText('dashboard.charts.tpsNoData')).toBeInTheDocument();
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    expect(
      container.querySelector('.dashboard-view__kpi-card--cpu .kpi-tile__value'),
    ).toHaveTextContent('0%');
    expect(
      container.querySelector('.dashboard-view__kpi-card--memory .kpi-tile__value'),
    ).toHaveTextContent('0 MB');
    expect(
      container.querySelector('.dashboard-view__kpi-card--tps .kpi-tile__value'),
    ).toHaveTextContent('--');
  });

  it('clips a tagged boundary anchor with one actual sample and excludes it from tooltip, dot, and readouts', () => {
    rechartsMockState.tooltipTarget = 'window-anchor';
    useServerMetricHistoryStore.getState().applySnapshot({
      ...snapshot(0, 80_000),
      resource: [
        { elapsedMs: 0, cpu: 98, memory: 1024 * 1024 * 1024 },
        { elapsedMs: 19_000, cpu: 97, memory: 900_000 * 1024 * 1024 },
        { elapsedMs: 25_000, cpu: 35, memory: 512 * 1024 * 1024 },
      ],
      tps: [
        { elapsedMs: 0, tps: 5 },
        { elapsedMs: 19_000, tps: 6 },
        { elapsedMs: 25_000, tps: 19.5 },
      ],
    });
    const { container } = render(<DashboardView server={server} />);

    for (const chart of screen.getAllByTestId('area-chart')) {
      const data = JSON.parse(chart.getAttribute('data-series') ?? '[]');
      expect(data[0]).toMatchObject({
        elapsedMs: 19_000,
        displayOnly: true,
        windowAnchor: true,
        measuredAtElapsedMs: 19_000,
      });
      expect(data[1].elapsedMs).toBe(25_000);
      expect(data.at(-1)).toMatchObject({
        displayOnly: true,
        measuredAtElapsedMs: 25_000,
      });
    }
    const memorySeries = JSON.parse(
      screen.getAllByTestId('area-chart')[1].getAttribute('data-series') ?? '[]',
    );
    expect(memorySeries[0]).toMatchObject({ memory: 900_000, windowAnchor: true });
    for (const area of screen.getAllByTestId('chart-area')) {
      expect(area).toHaveAttribute('data-dot', 'custom');
      expect(area).toHaveAttribute('data-actual-dot', 'visible');
      expect(area).toHaveAttribute('data-anchor-dot', 'hidden');
      expect(area).toHaveAttribute('data-endpoint-dot', 'hidden');
    }
    const yAxisDomains = screen
      .getAllByTestId('chart-y-axis')
      .map((axis) => JSON.parse(axis.getAttribute('data-domain') ?? 'null'));
    expect(yAxisDomains).toEqual([
      [0, 100],
      [486.4, 537.6],
      [0, 22],
    ]);
    for (const axis of screen.getAllByTestId('chart-y-axis')) {
      expect(axis).toHaveAttribute('data-allow-data-overflow', 'true');
    }
    for (const tooltip of screen.getAllByTestId('chart-tooltip')) {
      expect(tooltip).toBeEmptyDOMElement();
    }
    expect(
      container.querySelector('.dashboard-view__kpi-card--cpu .kpi-tile__value'),
    ).toHaveTextContent('35%');
    expect(
      container.querySelector('.dashboard-view__kpi-card--memory .kpi-tile__value'),
    ).toHaveTextContent('512 MB');
    expect(
      container.querySelector('.dashboard-view__kpi-card--tps .kpi-tile__value'),
    ).toHaveTextContent('19.50');
  });

  it('keeps the first actual sample dot and marks the held endpoint as display-only', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(1));
    render(<DashboardView server={server} />);
    expect(screen.getAllByTestId('chart-area')).toHaveLength(3);
    for (const area of screen.getAllByTestId('chart-area')) {
      expect(area).toHaveAttribute('data-dot', 'custom');
      expect(area).toHaveAttribute('data-actual-dot', 'visible');
      expect(area).toHaveAttribute('data-endpoint-dot', 'hidden');
      expect(area).toHaveAttribute('data-type', 'monotone');
    }
    for (const chart of screen.getAllByTestId('area-chart')) {
      const data = JSON.parse(chart.getAttribute('data-series') ?? '[]');
      expect(data).toHaveLength(2);
      expect(data[0]).not.toHaveProperty('displayOnly');
      expect(data[1].elapsedMs).toBeGreaterThanOrEqual(72_000);
      expect(data[1]).toMatchObject({
        displayOnly: true,
        measuredAtElapsedMs: 70_000,
      });
    }
    for (const axis of screen.getAllByTestId('chart-x-axis')) {
      expect(axis).toHaveAttribute('data-key', 'elapsedMs');
      expect(axis).toHaveAttribute('data-type', 'number');
      expect(axis).toHaveTextContent('60s');
    }
    for (const container of screen.getAllByTestId('chart-container'))
      expect(container).toHaveAttribute('data-min-height', '200');
  });

  it('shows the actual measurement time in the held tooltip', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(1, 75_000));
    render(<DashboardView server={server} />);

    expect(screen.getAllByText('held since 70s')).toHaveLength(3);
  });

  it('renders multiple samples immediately after remount and preserves server uptime', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(2));
    const first = render(<DashboardView server={server} />);
    expect(screen.getByText('00:01:12')).toBeInTheDocument();
    first.unmount();
    render(<DashboardView server={server} />);
    expect(screen.getByText('00:01:12')).toBeInTheDocument();
    for (const chart of screen.getAllByTestId('area-chart')) {
      expect(chart).toHaveAttribute('data-count', '3');
      const data = JSON.parse(chart.getAttribute('data-series') ?? '[]');
      expect(data[2]).toMatchObject({
        displayOnly: true,
        measuredAtElapsedMs: 72_000,
      });
    }
    for (const area of screen.getAllByTestId('chart-area'))
      expect(area).toHaveAttribute('data-dot', 'false');
    for (const area of screen.getAllByTestId('chart-area'))
      expect(area).toHaveAttribute('data-type', 'monotone');
    expect(
      screen.getAllByTestId('chart-area').map((area) => area.getAttribute('data-key')),
    ).toEqual(['cpu', 'memory', 'tps']);
  });
});
