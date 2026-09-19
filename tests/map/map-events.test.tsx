import { act, render } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listeners } = vi.hoisted(() => ({
  listeners: {
    bridge: vi.fn(),
    chat: vi.fn(),
    players: vi.fn(),
    world: vi.fn(),
    invalidated: vi.fn(),
    ready: vi.fn(),
    progress: vi.fn(),
  },
}));

vi.mock('@/map/api/map-commands', () => ({
  onMapBridgeStatus: listeners.bridge,
  onMapChatMessage: listeners.chat,
  onMapPlayersUpdated: listeners.players,
  onMapWorldStatus: listeners.world,
  onMapTileInvalidated: listeners.invalidated,
  onMapTileReady: listeners.ready,
  onMapRenderProgress: listeners.progress,
}));

import { useMapEvents } from '@/map/hooks/use-map-events';

function Harness({ children }: PropsWithChildren) {
  useMapEvents({
    serverId: 'server-1',
    onBridgeStatus: vi.fn(),
    onChatMessage: vi.fn(),
    onPlayersUpdated: vi.fn(),
    onWorldStatus: vi.fn(),
    onTileInvalidated: vi.fn(),
    onTileReady: vi.fn(),
    onRenderProgress: vi.fn(),
  });
  return children;
}

describe('useMapEvents', () => {
  beforeEach(() => {
    Object.values(listeners).forEach((listener) => {
      listener.mockReset();
      listener.mockResolvedValue(vi.fn());
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swallows duplicate and rejected cleanup during StrictMode remounts', async () => {
    const unlisteners = Array.from({ length: 14 }, () =>
      vi.fn(() => Promise.reject(new Error('listener already removed'))),
    );
    let unlistenIndex = 0;
    Object.values(listeners).forEach((listener) =>
      listener.mockImplementation(() => Promise.resolve(unlisteners[unlistenIndex++])),
    );

    const view = render(
      <StrictMode>
        <Harness>map</Harness>
      </StrictMode>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    view.unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unlisteners.every((unlisten) => unlisten.mock.calls.length === 1)).toBe(true);
  });
});
