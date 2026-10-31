import { render, screen, within } from '@testing-library/react';
import DashboardView from '@/renderer/components/DashboardView';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import type { MetricHistorySnapshot } from '@/renderer/shared/server-metrics';
import { useServerMetricHistoryStore } from '@/store/serverMetricHistoryStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    locale: 'en',
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'dashboard.charts.elapsedSeconds') return `${values?.seconds}s`;
      if (key === 'dashboard.charts.heldSince') return `held since ${values?.time}`;
      if (key === 'dashboard.units.megabytes') return 'MB';
      return key;
    },
  }),
}));
vi.mock('@/lib/tauri-api', () => ({ tauriListen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('@/lib/notification-commands', () => ({ sendServerNotification: vi.fn() }));
vi.mock('@/components/arc/line-chart/line-chart', () => ({
  LineChart: ({
    label,
    data,
    emptyLabel,
    series,
  }: {
    label: string;
    data: { key: string; label: string; values: Record<string, number | undefined> }[];
    emptyLabel?: string;
    series: { key: string }[];
  }) => (
    <figure
      aria-label={label}
      data-testid="line-chart"
      data-count={data.length}
      data-series={series.map((item) => item.key).join(',')}
    >
      {data.length === 0
        ? emptyLabel
        : data.map((datum) => (
            <p key={datum.key} data-testid="line-chart-datum">
              {`${datum.label} ${Object.values(datum.values).join(',')}`}
            </p>
          ))}
    </figure>
  ),
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

function chart(testId: string) {
  return within(screen.getByTestId(testId)).getByTestId('line-chart');
}

describe('DashboardView metric charts', () => {
  beforeEach(() => {
    useServerMetricHistoryStore.setState({
      snapshotsByServer: {},
      receivedAtByServer: {},
      completedGenerationByServer: {},
    });
  });

  it('shows a waiting message for empty resource and TPS histories', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(0));
    render(<DashboardView server={server} />);

    expect(
      within(screen.getByTestId('dashboard-chart-cpu')).getByText('dashboard.charts.metricsNoData'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('dashboard-chart-memory')).getByText(
        'dashboard.charts.metricsNoData',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('dashboard-chart-tps')).getByText('dashboard.charts.tpsNoData'),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId('line-chart-datum')).toHaveLength(0);
    // An empty chart draws no plot, so no gridlines or axis are rendered at all.
    expect(screen.queryAllByTestId('line-chart')).toHaveLength(0);
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
    render(<DashboardView server={server} />);

    expect(screen.queryAllByTestId('line-chart-datum')).toHaveLength(0);
    expect(screen.getByTestId('dashboard-kpi-cpu')).toHaveTextContent('0%');
    expect(screen.getByTestId('dashboard-kpi-memory')).toHaveTextContent('0 MB');
    expect(screen.getByTestId('dashboard-kpi-tps-value')).toHaveTextContent('--');
    expect(screen.getByTestId('dashboard-kpi-tps-value')).toHaveAttribute('data-tone', 'none');
  });

  it('drops the boundary anchor and holds the latest sample up to now', () => {
    useServerMetricHistoryStore.getState().applySnapshot({
      ...snapshot(0, 80_000),
      resource: [
        { elapsedMs: 10_000, cpu: 10, memory: 100 * 1024 * 1024 },
        { elapsedMs: 70_000, cpu: 40, memory: 512 * 1024 * 1024 },
      ],
      tps: [
        { elapsedMs: 10_000, tps: 5 },
        { elapsedMs: 70_000, tps: 19.5 },
      ],
    });
    render(<DashboardView server={server} />);

    const cpuData = within(screen.getByTestId('dashboard-chart-cpu')).getAllByTestId(
      'line-chart-datum',
    );
    expect(cpuData).toHaveLength(2);
    expect(cpuData[0]).toHaveTextContent('70s 40');
    expect(cpuData[1]).toHaveTextContent('80s · held since 70s 40');
    expect(screen.queryByText(/^10s/)).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-kpi-tps-value')).toHaveTextContent('19.50');
    expect(screen.getByTestId('dashboard-kpi-tps-value')).toHaveAttribute('data-tone', 'good');
  });

  it('shows the measurement time in the held tooltip title for every chart', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(1, 75_000));
    render(<DashboardView server={server} />);

    expect(screen.getAllByText(/held since 70s/)).toHaveLength(3);
  });

  it('shows the software and address only in the server info card', () => {
    render(<DashboardView server={server} />);

    const card = screen.getByTestId('dashboard-server-card');
    expect(within(card).getByTestId('dashboard-software')).toHaveTextContent('Paper 1.21');
    expect(within(card).getByTestId('dashboard-address')).toHaveTextContent('localhost:25565');
    expect(within(card).getByRole('button', { name: 'dashboard.stats.copyAddress' })).toBeEnabled();
    // The software name appears once on the whole screen, in the server info card.
    expect(screen.getAllByText(/Paper/)).toHaveLength(1);
  });

  it('renders each sample as a datum and keeps the series key stable', () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(2));
    render(<DashboardView server={server} />);

    for (const testId of ['dashboard-chart-cpu', 'dashboard-chart-memory', 'dashboard-chart-tps']) {
      // Two samples plus the held point that carries the latest value up to now.
      expect(chart(testId)).toHaveAttribute('data-count', '3');
      expect(chart(testId)).toHaveAttribute('data-series', 'value');
    }
    expect(screen.getByTestId('dashboard-kpi-uptime-value')).toHaveTextContent('00:01:12');
  });
});
