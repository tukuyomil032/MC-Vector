import { iconMenu } from '../../assets/icons';
import SvgMaskIcon from './SvgMaskIcon';

interface AppSidebarHeaderProps {
  isSidebarOpen: boolean;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  openSettingsLabel: string;
}

export default function AppSidebarHeader({
  isSidebarOpen,
  onOpenSettings,
  onToggleSidebar,
  openSettingsLabel,
}: AppSidebarHeaderProps) {
  return (
    <div
      className={`app-sidebar__header ${isSidebarOpen ? 'app-sidebar__header--open' : 'app-sidebar__header--collapsed'}`}
    >
      {isSidebarOpen && (
        <button
          type="button"
          className="app-sidebar__brand"
          onClick={onOpenSettings}
          aria-label={openSettingsLabel}
          title={openSettingsLabel}
        >
          MC-Vector
        </button>
      )}

      <button
        type="button"
        onClick={onToggleSidebar}
        className="app-sidebar__menu-button"
        aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <SvgMaskIcon src={iconMenu} className="app-sidebar__menu-icon" />
      </button>
    </div>
  );
}
