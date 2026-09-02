import { useI18nStore } from '@/i18n';
import { AppFeedbackProvider } from '@/renderer/components/AppFeedbackProvider';
import PluginBrowser from '@/renderer/components/PluginBrowser';
import { useUiStore } from '@/store/uiStore';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fileCommands, pluginCommands, queryState } = vi.hoisted(() => ({
  fileCommands: {
    listFiles: vi.fn(),
    deleteItem: vi.fn(),
    moveItem: vi.fn(),
  },
  pluginCommands: {
    checkHangarCompatibility: vi.fn(),
    getCompatibleModrinthVersion: vi.fn(),
    getHangarProjectBody: vi.fn(),
    getModrinthProjectBody: vi.fn(),
    getModrinthProjectIdentity: vi.fn(),
    getModrinthVersionById: vi.fn(),
    getSpigotResourceBody: vi.fn(),
    installHangarProject: vi.fn(),
    installModrinthProject: vi.fn(),
    installSpigotProject: vi.fn(),
    resolveHangarDownload: vi.fn(),
    searchHangar: vi.fn(),
    searchModrinth: vi.fn(),
    searchSpigot: vi.fn(),
  },
  queryState: {
    useQuery: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: queryState.useQuery,
  useQueries: vi.fn(() => []),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn().mockResolvedValue(false),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/file-commands', () => fileCommands);
vi.mock('@/lib/plugin-commands', () => pluginCommands);
vi.mock('@/lib/error-utils', () => ({ logError: vi.fn() }));

const incompatibleItem = {
  id: 'spigot-legacy',
  title: 'Legacy Plugin',
  description: 'Built for Minecraft 1.8.8',
  author: 'Example Author',
  platform: 'Spigot' as const,
  source_obj: { tag: '1.8.8', external: false, premium: false },
};

const compatibleModrinthItem = {
  id: 'modrinth-plugin',
  title: 'Hashless Plugin',
  description: 'A plugin without published checksum metadata',
  author: 'Example Author',
  platform: 'Modrinth' as const,
  source_obj: {},
};

const server = {
  id: 'server-1',
  name: 'Paper Server',
  path: '/managed/server-1',
  software: 'Paper',
  version: '1.21.4',
  status: 'offline',
  memory: 2048,
  javaPath: 'java',
  jvmArgs: [],
} as never;

describe('PluginBrowser feedback integration', () => {
  beforeEach(() => {
    useI18nStore.setState({ currentLocale: 'en' });
    useUiStore.setState({ currentView: 'dashboard' });
    fileCommands.listFiles.mockResolvedValue([]);
    queryState.refetch.mockResolvedValue(undefined);
    queryState.useQuery.mockReturnValue({
      data: { items: [incompatibleItem], hasNextPage: false, totalPages: 1 },
      isFetching: false,
      isError: false,
      error: null,
      refetch: queryState.refetch,
    });
    for (const mock of Object.values(pluginCommands)) {
      mock.mockReset();
    }
  });

  it('shows a blocking modal and never starts install work for incompatible items', async () => {
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );

    const installButton = await screen.findByTestId('plugin-install-spigot-legacy');
    fireEvent.click(installButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Plugin installation blocked' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Legacy Plugin is not compatible with Paper 1\.21\.4/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Supported versions reported by the provider: 1\.8\.8/),
    ).toBeInTheDocument();
    expect(pluginCommands.installSpigotProject).not.toHaveBeenCalled();
    expect(pluginCommands.installHangarProject).not.toHaveBeenCalled();
    expect(pluginCommands.installModrinthProject).not.toHaveBeenCalled();
    expect(fileCommands.deleteItem).not.toHaveBeenCalled();
    expect(fileCommands.moveItem).not.toHaveBeenCalled();
  });

  it('shows a hash policy dialog instead of a generic install error toast', async () => {
    queryState.useQuery.mockReturnValue({
      data: { items: [compatibleModrinthItem], hasNextPage: false, totalPages: 1 },
      isFetching: false,
      isError: false,
      error: null,
      refetch: queryState.refetch,
    });
    pluginCommands.getCompatibleModrinthVersion.mockResolvedValue({
      id: 'version-1',
      fileName: 'Hashless-1.21.4.jar',
      dependencies: [],
    });
    pluginCommands.installModrinthProject.mockRejectedValue(
      JSON.stringify({
        code: 'unverified-artifact-blocked',
        message: 'checksum details are intentionally not shown to users',
      }),
    );

    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );

    fireEvent.click(await screen.findByTestId('plugin-install-modrinth-plugin'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Unverified plugin download blocked' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/provider did not supply a checksum/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open General Settings' })).toBeInTheDocument();
    expect(screen.queryByText('Install error')).not.toBeInTheDocument();
    expect(useUiStore.getState().currentView).toBe('dashboard');
  });
});
