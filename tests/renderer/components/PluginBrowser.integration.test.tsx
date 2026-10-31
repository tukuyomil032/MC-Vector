import { useI18nStore } from '@/i18n';
import { AppFeedbackProvider } from '@/renderer/components/AppFeedbackProvider';
import PluginBrowser from '@/renderer/components/PluginBrowser';
import { useUiStore } from '@/store/uiStore';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fileCommands, installerCommands, pluginCommands, queryState } = vi.hoisted(() => ({
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
    resolveHangarDownload: vi.fn(),
    searchHangar: vi.fn(),
    searchModrinth: vi.fn(),
    searchSpigot: vi.fn(),
  },
  installerCommands: {
    preparePluginInstall: vi.fn(),
    executePluginInstall: vi.fn(),
    onPluginInstallProgress: vi.fn(),
    toggleInstalledPlugin: vi.fn(),
    uninstallInstalledPlugin: vi.fn(),
  },
  queryState: {
    useQuery: vi.fn(),
    useQueries: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: queryState.useQuery,
  useQueries: queryState.useQueries,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/file-commands', () => fileCommands);
vi.mock('@/lib/plugin-commands', () => pluginCommands);
vi.mock('@/lib/plugin-installer-commands', () => installerCommands);
vi.mock('@/lib/error-utils', () => ({ logError: vi.fn() }));

const incompatibleItem = {
  id: 'spigot-legacy',
  title: 'Legacy Plugin',
  description: 'Text mentions Minecraft 1.21.4, but backend eligibility blocks installation',
  author: 'Example Author',
  platform: 'Spigot' as const,
  compatibility: 'incompatible' as const,
  supportedVersions: ['1.8.8'],
  source_obj: { tag: '1.21.4', external: false, premium: false },
};

const compatibleModrinthItem = {
  id: 'modrinth-plugin',
  title: 'Hashless Plugin',
  description: 'A plugin without published checksum metadata',
  author: 'Example Author',
  platform: 'Modrinth' as const,
  compatibility: 'compatible' as const,
  supportedVersions: ['1.21.4'],
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
    queryState.useQueries.mockReturnValue([]);
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
    pluginCommands.searchModrinth.mockResolvedValue({ hits: [], total_hits: 0 });
    pluginCommands.searchHangar.mockResolvedValue({ result: [], pagination: {} });
    pluginCommands.searchSpigot.mockResolvedValue([]);
    pluginCommands.getModrinthProjectIdentity.mockResolvedValue(null);
    installerCommands.preparePluginInstall.mockReset().mockResolvedValue({
      token: 'plan-token',
      expiresInSeconds: 300,
      serverId: 'server-1',
      serverVersion: '1.21.4',
      serverSoftware: 'Paper',
      targetDirectory: 'plugins',
      artifacts: [
        {
          id: 'spiget:123:456',
          project: { provider: 'spiget', resourceId: 123 },
          title: 'Plugin',
          version: '1.0.0',
          fileName: 'plugin.jar',
          installedFileName: null,
          dependency: false,
          verified: true,
          compatibility: 'compatible',
          supportedVersions: ['1.21.4'],
        },
      ],
      missingDependencyIds: [],
      externalUrl: null,
      requiresUnverifiedDownloads: false,
    });
    installerCommands.executePluginInstall.mockReset().mockResolvedValue({
      serverId: 'server-1',
      installedFileNames: ['plugin.jar'],
    });
    installerCommands.onPluginInstallProgress.mockReset().mockResolvedValue(vi.fn());
    installerCommands.toggleInstalledPlugin.mockReset().mockResolvedValue('plugin.jar.disabled');
    installerCommands.uninstallInstalledPlugin.mockReset().mockResolvedValue(undefined);
  });

  it.each(['compatible', 'unknown'] as const)(
    'uses backend %s eligibility even when display text mentions an older version',
    async (compatibility) => {
      queryState.useQuery.mockReturnValue({
        data: {
          items: [
            {
              ...incompatibleItem,
              id: '123',
              description: 'Minecraft 1.8.8 only',
              compatibility,
              supportedVersions: compatibility === 'compatible' ? ['1.21.4'] : [],
              source_obj: { tag: '1.8.8', external: false, premium: false },
            },
          ],
          hasNextPage: false,
          totalPages: 1,
        },
        isFetching: false,
        isError: false,
        error: null,
        refetch: queryState.refetch,
      });
      render(
        <AppFeedbackProvider>
          <PluginBrowser server={server} />
        </AppFeedbackProvider>,
      );
      fireEvent.click(await screen.findByTestId('plugin-install-123'));
      await waitFor(() =>
        expect(installerCommands.preparePluginInstall).toHaveBeenCalledWith(
          'server-1',
          { provider: 'spiget', resourceId: 123 },
          undefined,
        ),
      );
      fireEvent.click(await screen.findByTestId('feedback-dialog-primary-action'));
      await waitFor(() =>
        expect(installerCommands.executePluginInstall).toHaveBeenCalledWith('plan-token', []),
      );
    },
  );

  it('includes the selected Minecraft version in the primary Spiget search', async () => {
    pluginCommands.searchSpigot.mockResolvedValue([]);
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );
    fireEvent.click(await screen.findByTestId('plugin-provider-spigot'));
    const options = queryState.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
    };
    const signal = new AbortController().signal;
    await options.queryFn({ signal });
    expect(pluginCommands.searchSpigot).toHaveBeenCalledWith('', 1, 25, signal, '1.21.4');
  });

  it("does not keep another provider's results as placeholder data while a new provider loads", async () => {
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );
    const options = queryState.useQuery.mock.calls.at(-1)?.[0] as {
      placeholderData: (previous: unknown, previousQuery: unknown) => unknown;
    };
    const previousData = { items: [incompatibleItem], hasNextPage: false, totalPages: 1 };
    const previousKey = (platform: string) => [
      'plugin-search',
      platform,
      '',
      0,
      'server-1',
      '/managed/server-1',
      '1.21.4',
      false,
    ];

    expect(options.placeholderData(previousData, { queryKey: previousKey('Hangar') })).toBe(
      undefined,
    );
    expect(options.placeholderData(previousData, { queryKey: previousKey('Modrinth') })).toBe(
      previousData,
    );
  });

  it('uses backend unknown Modrinth status instead of assuming search hits are compatible', async () => {
    queryState.useQuery.mockReturnValue({
      data: {
        items: [{ ...compatibleModrinthItem, compatibility: 'unknown' }],
        hasNextPage: false,
        totalPages: 1,
      },
      isFetching: false,
      isError: false,
      error: null,
      refetch: queryState.refetch,
    });
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );
    const result = await screen.findByTestId('plugin-result-modrinth-plugin');
    expect(result.querySelector('[data-compat]')).toHaveAttribute('data-compat', 'unknown');
    expect(within(result).queryByText('Compatible', { exact: true })).not.toBeInTheDocument();
  });

  it('includes selected version in Modrinth search without building the version facet in React', async () => {
    pluginCommands.searchModrinth.mockResolvedValue({ hits: [], total_hits: 0 });
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );
    const options = queryState.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
    };
    const signal = new AbortController().signal;
    await options.queryFn({ signal });
    expect(pluginCommands.searchModrinth).toHaveBeenCalledWith(
      '',
      '[["project_type:plugin"]]',
      0,
      25,
      signal,
      '1.21.4',
    );
  });

  it.each([
    { compatibility: 'unknown', supportedVersions: ['1.21.4'], compatible: true },
    { compatibility: 'compatible', supportedVersions: [], compatible: false },
  ] as const)(
    'renders Hangar backend $compatibility directly without deriving a status',
    async (result) => {
      queryState.useQuery.mockReturnValue({
        data: {
          items: [
            {
              id: 'owner/plugin',
              title: 'Hangar Plugin',
              description: 'Minecraft 1.21.4',
              author: 'owner',
              slug: 'plugin',
              platform: 'Hangar',
              source_obj: {},
            },
          ],
          hasNextPage: false,
          totalPages: 1,
        },
        isFetching: false,
        isError: false,
        error: null,
        refetch: queryState.refetch,
      });
      queryState.useQueries.mockReturnValue([{ data: result, isPending: false, isError: false }]);
      render(
        <AppFeedbackProvider>
          <PluginBrowser server={server} />
        </AppFeedbackProvider>,
      );
      const row = await screen.findByTestId('plugin-result-owner/plugin');
      expect(row.querySelector('[data-compat]')).toHaveAttribute(
        'data-compat',
        result.compatibility,
      );
    },
  );

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
    expect(installerCommands.preparePluginInstall).not.toHaveBeenCalled();
    expect(installerCommands.executePluginInstall).not.toHaveBeenCalled();
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
    installerCommands.preparePluginInstall.mockResolvedValueOnce({
      token: 'hashless-plan',
      expiresInSeconds: 300,
      serverId: 'server-1',
      serverVersion: '1.21.4',
      serverSoftware: 'Paper',
      targetDirectory: 'plugins',
      artifacts: [
        {
          id: 'modrinth:modrinth-plugin:version-1',
          project: { provider: 'modrinth', projectId: 'modrinth-plugin' },
          title: 'Hashless Plugin',
          version: '1.0.0',
          fileName: 'Hashless-1.21.4.jar',
          installedFileName: null,
          dependency: false,
          verified: false,
          compatibility: 'compatible',
          supportedVersions: ['1.21.4'],
        },
      ],
      missingDependencyIds: [],
      externalUrl: null,
      requiresUnverifiedDownloads: true,
    });
    installerCommands.executePluginInstall.mockRejectedValueOnce(
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
    fireEvent.click(await screen.findByTestId('feedback-dialog-primary-action'));

    await waitFor(() =>
      expect(installerCommands.executePluginInstall).toHaveBeenCalledWith('hashless-plan', []),
    );
    expect(
      await screen.findByRole('heading', { name: 'Unverified plugin download blocked' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/provider did not supply a checksum/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open General Settings' })).toBeInTheDocument();
    expect(screen.queryByText('Install error')).not.toBeInTheDocument();
    expect(useUiStore.getState().currentView).toBe('dashboard');
  });

  it('does not show the card as installing while the confirm dialog is still open', async () => {
    queryState.useQuery.mockReturnValue({
      data: { items: [compatibleModrinthItem], hasNextPage: false, totalPages: 1 },
      isFetching: false,
      isError: false,
      error: null,
      refetch: queryState.refetch,
    });
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );

    fireEvent.click(await screen.findByTestId('plugin-install-modrinth-plugin'));
    expect(await screen.findByTestId('feedback-dialog-primary-action')).toBeInTheDocument();
    expect(installerCommands.executePluginInstall).not.toHaveBeenCalled();
    expect(screen.queryByText('Installing...')).not.toBeInTheDocument();
    expect(screen.getByTestId('plugin-install-modrinth-plugin')).not.toBeDisabled();
  });

  it('routes installed-file toggle and uninstall through Rust commands', async () => {
    fileCommands.listFiles.mockResolvedValue([{ name: 'plugin.jar', isDirectory: false }]);
    render(
      <AppFeedbackProvider>
        <PluginBrowser server={server} />
      </AppFeedbackProvider>,
    );

    // Arc tabs switch on mousedown, the same as a real pointer press.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /installed/i }), { button: 0 });
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(installerCommands.toggleInstalledPlugin).toHaveBeenCalledWith(
        'server-1',
        'plugin.jar',
      ),
    );
    expect(await screen.findByText('plugin disabled')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Uninstall' }));
    fireEvent.click(await screen.findByTestId('feedback-confirm-confirm'));
    await waitFor(() =>
      expect(installerCommands.uninstallInstalledPlugin).toHaveBeenCalledWith(
        'server-1',
        'plugin.jar',
      ),
    );
    expect(fileCommands.moveItem).not.toHaveBeenCalled();
    expect(fileCommands.deleteItem).not.toHaveBeenCalled();
  });
});
