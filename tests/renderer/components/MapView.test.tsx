import MapView from '@/renderer/components/MapView';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listenMapRenderProgressMock, requestMapRenderMock } = vi.hoisted(() => ({
  listenMapRenderProgressMock: vi.fn(),
  requestMapRenderMock: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/map-render-commands', () => ({
  listenMapRenderProgress: listenMapRenderProgressMock,
  requestMapRender: requestMapRenderMock,
}));

const server = {
  id: 'server-1',
  name: 'Paper Server',
  path: '/managed/server-1',
  software: 'Paper',
  version: '1.21.4',
  status: 'offline' as const,
  port: 25565,
  memory: 2048,
};

const blockedResponse = {
  requestId: 'test-request',
  tile: { x: 0, z: 0 },
  zoom: 8,
  diagnostics: {
    bridgeState: 'disconnected' as const,
    terrainState: 'unknown' as const,
    renderState: 'blocked' as const,
    source: 'none' as const,
    liveRequestedCount: 0,
    liveReceivedCount: 0,
    renderedChunkCount: 0,
    decodeFailedChunkCount: 0,
    coverageRatio: 0,
    unavailableReason: 'renderer_not_connected' as const,
    rendererVersion: 'unknown',
    minecraftVersion: '1.21.4',
    assetVersion: null,
    cacheState: 'miss' as const,
    retryable: false,
  },
};

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenMapRenderProgressMock.mockResolvedValue(vi.fn());
    requestMapRenderMock.mockResolvedValue(blockedResponse);
  });

  it('shows renderer diagnostics without claiming terrain readiness', async () => {
    render(<MapView server={server} />);

    await waitFor(() => expect(requestMapRenderMock).toHaveBeenCalledOnce());

    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByTestId('map-render-state')).toHaveTextContent('map.states.blocked');
    expect(screen.getByText('map.blockedTitle')).toBeInTheDocument();
    expect(screen.getByText('map.reasons.rendererNotConnected')).toBeInTheDocument();
    expect(screen.queryByText('map.states.ready')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-render-status')).toHaveAttribute('aria-live', 'polite');
  });

  it('refreshes the structured diagnostic request explicitly', async () => {
    render(<MapView server={server} />);

    await waitFor(() => expect(requestMapRenderMock).toHaveBeenCalledOnce());
    screen.getByRole('button', { name: 'map.refresh' }).click();

    await waitFor(() => expect(requestMapRenderMock).toHaveBeenCalledTimes(2));
    expect(requestMapRenderMock.mock.calls[0][0]).toMatchObject({
      serverId: server.id,
      minecraftVersion: server.version,
      projection: 'iso_projected',
      zoom: 8,
    });
  });
});
