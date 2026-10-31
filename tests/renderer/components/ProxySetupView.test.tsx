import { useI18nStore } from '@/i18n';
import ProxySetupView from '@/renderer/components/ProxySetupView';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock('@/renderer/components/AppFeedbackProvider', () => ({
  useAppFeedback: () => ({ confirm: confirmMock }),
}));

const servers = [
  { id: 'server-1', name: 'Lobby', software: 'Paper', version: '1.21.4', port: 25565 },
  { id: 'server-2', name: 'Survival', software: 'Paper', version: '1.21.4', port: 25566 },
  { id: 'proxy-1', name: 'Edge Proxy', software: 'Velocity', version: '3.4.0', port: 25577 },
] as unknown as MinecraftServer[];

describe('ProxySetupView', () => {
  beforeEach(() => {
    useI18nStore.setState({ currentLocale: 'en' });
    confirmMock.mockReset().mockResolvedValue(true);
  });

  it('lists only servers that can be backends, with a count and select-all', () => {
    render(<ProxySetupView servers={servers} onBuildNetwork={vi.fn()} onOpenHelp={vi.fn()} />);

    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Edge Proxy' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Lobby' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Survival' })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();
  });

  it('shows an empty state when no server can be a backend', () => {
    render(<ProxySetupView servers={[servers[2]]} onBuildNetwork={vi.fn()} onOpenHelp={vi.fn()} />);

    expect(screen.getByText('No available backend servers')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select all' })).not.toBeInTheDocument();
  });

  it('asks once, then sends the chosen backends', async () => {
    const onBuildNetwork = vi.fn();
    render(
      <ProxySetupView servers={servers} onBuildNetwork={onBuildNetwork} onOpenHelp={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Lobby' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Survival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build Network' }));

    await waitFor(() => expect(onBuildNetwork).toHaveBeenCalledOnce());
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(onBuildNetwork).toHaveBeenCalledWith({
      proxySoftware: 'Velocity',
      proxyPort: 25577,
      backendServerIds: ['server-1', 'server-2'],
    });
  });

  it('sends only the backends that are still listed', async () => {
    const onBuildNetwork = vi.fn();
    const { rerender } = render(
      <ProxySetupView servers={servers} onBuildNetwork={onBuildNetwork} onOpenHelp={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lobby' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Survival' }));

    rerender(
      <ProxySetupView
        servers={servers.filter((server) => server.id !== 'server-1')}
        onBuildNetwork={onBuildNetwork}
        onOpenHelp={vi.fn()}
      />,
    );
    expect(screen.getByText('1 of 1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Build Network' }));

    await waitFor(() => expect(onBuildNetwork).toHaveBeenCalledOnce());
    expect(onBuildNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ backendServerIds: ['server-2'] }),
    );
  });

  it('does not build when the confirm is canceled', async () => {
    confirmMock.mockResolvedValue(false);
    const onBuildNetwork = vi.fn();
    render(
      <ProxySetupView servers={servers} onBuildNetwork={onBuildNetwork} onOpenHelp={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build Network' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(onBuildNetwork).not.toHaveBeenCalled();
  });

  it('shows the building state and locks the backend list until the build settles', async () => {
    let finish: () => void = () => {};
    const onBuildNetwork = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <ProxySetupView servers={servers} onBuildNetwork={onBuildNetwork} onOpenHelp={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build Network' }));

    expect(await screen.findByRole('button', { name: 'Building...' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Lobby' })).toBeDisabled();

    finish();
    expect(await screen.findByRole('button', { name: 'Build Network' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Lobby' })).toBeEnabled();
  });
});
