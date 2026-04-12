import { iconMenu } from '../../assets/icons';

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

      <button onClick={onToggleSidebar} className="app-sidebar__menu-button">
        <img src={iconMenu} alt="" className="app-sidebar__menu-icon" />
      </button>
    </div>
  );
}
