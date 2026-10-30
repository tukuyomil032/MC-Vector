import {
  Archive,
  FlaskConical,
  Folder,
  LayoutDashboard,
  Network,
  Play,
  Plus,
  Puzzle,
  RotateCw,
  Server,
  Settings,
  Settings2,
  SlidersHorizontal,
  Square,
  Terminal,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  type CommandItem,
  type CommandPaletteMessages,
  CommandPalette as ArcCommandPalette,
} from '@/components/arc/command-palette/command-palette';
import { useTranslation } from '@/i18n';
import type { AppView, MinecraftServer } from '@/renderer/shared/server declaration';
import { canStartServer } from '@/renderer/shared/server-status';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  activeServer: MinecraftServer | undefined;
  servers: MinecraftServer[];
  setCurrentView: (view: AppView) => void;
  onSelectServer: (serverId: string) => void;
  onAddServer: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

const ICON_PROPS = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Cmd+K (Ctrl+K off macOS) toggles the palette. Escape closes it from inside the palette. */
export function CommandPalette({
  activeServer,
  servers,
  setCurrentView,
  onSelectServer,
  onAddServer,
  onStart,
  onStop,
  onRestart,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navigateGroup = t('commandPalette.navigate');
  const serverGroup = t('commandPalette.serverActions');
  const serversGroup = t('commandPalette.servers');

  const actions = new Map<string, () => void>();
  const items: CommandItem[] = [];
  const addItem = (
    id: string,
    label: string,
    group: string,
    icon: ReactNode,
    run: () => void,
    description?: string,
  ) => {
    items.push({ id, label, group, icon, description });
    actions.set(id, run);
  };
  const navigateTo = (view: AppView) => () => setCurrentView(view);

  addItem(
    'nav-dashboard',
    t('nav.dashboard'),
    navigateGroup,
    <LayoutDashboard {...ICON_PROPS} />,
    navigateTo('dashboard'),
  );
  addItem(
    'nav-console',
    t('nav.console'),
    navigateGroup,
    <Terminal {...ICON_PROPS} />,
    navigateTo('console'),
  );
  addItem(
    'nav-users',
    t('nav.users'),
    navigateGroup,
    <Users {...ICON_PROPS} />,
    navigateTo('users'),
  );
  addItem(
    'nav-files',
    t('nav.files'),
    navigateGroup,
    <Folder {...ICON_PROPS} />,
    navigateTo('files'),
  );
  addItem(
    'nav-plugins',
    t('nav.pluginsMods'),
    navigateGroup,
    <Puzzle {...ICON_PROPS} />,
    navigateTo('plugins'),
  );
  addItem(
    'nav-backups',
    t('nav.backups'),
    navigateGroup,
    <Archive {...ICON_PROPS} />,
    navigateTo('backups'),
  );
  addItem(
    'nav-properties',
    t('nav.properties'),
    navigateGroup,
    <SlidersHorizontal {...ICON_PROPS} />,
    navigateTo('properties'),
  );
  addItem(
    'nav-general-settings',
    t('nav.generalSettings'),
    navigateGroup,
    <Settings {...ICON_PROPS} />,
    navigateTo('general-settings'),
  );
  addItem(
    'nav-proxy',
    t('nav.proxyNetwork'),
    navigateGroup,
    <Network {...ICON_PROPS} />,
    navigateTo('proxy'),
  );
  addItem(
    'app-settings',
    t('settings.title'),
    navigateGroup,
    <Settings2 {...ICON_PROPS} />,
    navigateTo('app-settings'),
  );
  if (import.meta.env.DEV) {
    addItem(
      'nav-ui-lab',
      t('nav.uiLab'),
      navigateGroup,
      <FlaskConical {...ICON_PROPS} />,
      navigateTo('ui-lab'),
    );
  }

  if (activeServer) {
    if (canStartServer(activeServer.status)) {
      addItem(
        'server-start',
        t('server.actions.start'),
        serverGroup,
        <Play {...ICON_PROPS} fill="currentColor" />,
        onStart,
        activeServer.name,
      );
    }
    if (activeServer.status === 'online') {
      addItem(
        'server-stop',
        t('server.actions.stop'),
        serverGroup,
        <Square {...ICON_PROPS} fill="currentColor" />,
        onStop,
        activeServer.name,
      );
      addItem(
        'server-restart',
        t('server.actions.restart'),
        serverGroup,
        <RotateCw {...ICON_PROPS} />,
        onRestart,
        activeServer.name,
      );
    }
  }

  addItem('server-add', t('nav.addServer'), serversGroup, <Plus {...ICON_PROPS} />, onAddServer);
  for (const server of servers) {
    addItem(
      `server-switch-${server.id}`,
      t('commandPalette.switchServer', { name: server.name }),
      serversGroup,
      <Server {...ICON_PROPS} />,
      () => onSelectServer(server.id),
    );
  }

  const messages: Partial<CommandPaletteMessages> = {
    clearSearch: t('commandPalette.clearSearch'),
    closeLabel: t('commandPalette.close'),
    resultsLabel: t('commandPalette.results'),
    noResults: (query) => t('commandPalette.noResultsFor', { query }),
    noResultsHint: t('commandPalette.noResultsHint'),
    noResultsStatus: t('commandPalette.noResults'),
    resultCount: (count) => t('commandPalette.resultCount', { count }),
  };

  if (!open) {
    return null;
  }

  const close = () => setOpen(false);

  return (
    <div
      className={styles.overlay}
      data-testid="command-palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.panel}>
        <ArcCommandPalette
          items={items}
          label={t('commandPalette.label')}
          placeholder={t('commandPalette.placeholder')}
          focusOnOpen
          messages={messages}
          shortcutHint={isMacPlatform() ? '⌘ K' : 'Ctrl K'}
          onClose={close}
          onSelect={(item) => {
            actions.get(item.id)?.();
            close();
          }}
        />
      </div>
    </div>
  );
}
