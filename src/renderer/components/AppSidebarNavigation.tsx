import {
  iconBackups,
  iconConsole,
  iconDashboard,
  iconFiles,
  iconMap,
  iconPlugins,
  iconProperties,
  iconProxy,
  iconSettings,
  iconUsers,
} from '../../assets/icons';
import type { Translate, TranslationKey } from '../../i18n';
import type { AppView } from '../shared/server declaration';
import AppNavItem from './AppNavItem';

interface AppSidebarNavigationProps {
  isSidebarOpen: boolean;
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  t: Translate;
  showMap: boolean;
}

interface NavItemConfig {
  view: AppView;
  labelKey: TranslationKey;
  iconSrc: string;
  showDividerBefore?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { view: 'dashboard', labelKey: 'nav.dashboard', iconSrc: iconDashboard },
  { view: 'console', labelKey: 'nav.console', iconSrc: iconConsole },
  { view: 'users', labelKey: 'nav.users', iconSrc: iconUsers },
  { view: 'files', labelKey: 'nav.files', iconSrc: iconFiles },
  { view: 'plugins', labelKey: 'nav.pluginsMods', iconSrc: iconPlugins },
  { view: 'backups', labelKey: 'nav.backups', iconSrc: iconBackups },
  { view: 'properties', labelKey: 'nav.properties', iconSrc: iconProperties },
  { view: 'general-settings', labelKey: 'nav.generalSettings', iconSrc: iconSettings },
  {
    view: 'proxy',
    labelKey: 'nav.proxyNetwork',
    iconSrc: iconProxy,
    showDividerBefore: true,
  },
];

export default function AppSidebarNavigation({
  isSidebarOpen,
  currentView,
  setCurrentView,
  t,
  showMap,
}: AppSidebarNavigationProps) {
  const navItems = showMap
    ? [
        ...NAV_ITEMS.slice(0, 7),
        { view: 'map' as AppView, labelKey: 'nav.map' as TranslationKey, iconSrc: iconMap },
        ...NAV_ITEMS.slice(7),
      ]
    : NAV_ITEMS;

  return (
    <div
      className="app-sidebar__nav mt-2.5 flex flex-1 flex-col overflow-y-auto rounded-xl border p-2.5 app-shell__surface app-shell__surface--sidebar-panel surface-card rounded-2xl"
      data-testid="app-sidebar-nav"
    >
      {navItems.map((item) => (
        <div key={item.view}>
          {item.showDividerBefore && <hr className="app-sidebar__divider" />}
          <AppNavItem
            label={isSidebarOpen ? t(item.labelKey) : ''}
            tooltip={t(item.labelKey)}
            view={item.view}
            current={currentView}
            set={setCurrentView}
            iconSrc={item.iconSrc}
          />
        </div>
      ))}
    </div>
  );
}
