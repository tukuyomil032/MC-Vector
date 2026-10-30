import {
  Archive,
  Folder,
  LayoutDashboard,
  Network,
  Puzzle,
  Settings,
  SlidersHorizontal,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Translate, TranslationKey } from '../../i18n';
import type { AppView } from '../shared/server declaration';
import AppNavItem from './AppNavItem';
import styles from './AppSidebar.module.css';

interface AppSidebarNavigationProps {
  isSidebarOpen: boolean;
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  t: Translate;
}

interface NavItemConfig {
  view: AppView;
  labelKey: TranslationKey;
  Icon: LucideIcon;
  showDividerBefore?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { view: 'dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard },
  { view: 'console', labelKey: 'nav.console', Icon: Terminal },
  { view: 'users', labelKey: 'nav.users', Icon: Users },
  { view: 'files', labelKey: 'nav.files', Icon: Folder },
  { view: 'plugins', labelKey: 'nav.pluginsMods', Icon: Puzzle },
  { view: 'backups', labelKey: 'nav.backups', Icon: Archive },
  { view: 'properties', labelKey: 'nav.properties', Icon: SlidersHorizontal },
  { view: 'general-settings', labelKey: 'nav.generalSettings', Icon: Settings },
  {
    view: 'proxy',
    labelKey: 'nav.proxyNetwork',
    Icon: Network,
    showDividerBefore: true,
  },
];

export default function AppSidebarNavigation({
  isSidebarOpen,
  currentView,
  setCurrentView,
  t,
}: AppSidebarNavigationProps) {
  return (
    <div
      className={['app-sidebar__nav', styles.panel, styles.nav, isSidebarOpen ? '' : styles.navRail]
        .filter(Boolean)
        .join(' ')}
      data-testid="app-sidebar-nav"
    >
      {NAV_ITEMS.map((item) => (
        <div key={item.view}>
          {item.showDividerBefore && <hr className={styles.divider} />}
          <AppNavItem
            label={isSidebarOpen ? t(item.labelKey) : ''}
            tooltip={t(item.labelKey)}
            view={item.view}
            current={currentView}
            set={setCurrentView}
            icon={<item.Icon size={16} strokeWidth={1.75} aria-hidden={true} />}
          />
        </div>
      ))}
    </div>
  );
}
