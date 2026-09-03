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
      className={`app-sidebar__header flex items-center border-b bg-transparent p-5 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}
    >
      {isSidebarOpen && (
        <button
          type="button"
          className="app-sidebar__brand cursor-pointer rounded-sm border-none bg-transparent p-0 text-left text-xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] focus:outline-none"
          data-testid="sidebar-brand-button"
          onClick={onOpenSettings}
          aria-label={openSettingsLabel}
          title={openSettingsLabel}
        >
          MC-Vector
        </button>
      )}

      <button
        type="button"
        data-testid="sidebar-toggle-button"
        onClick={onToggleSidebar}
        className="app-sidebar__menu-button rounded-md border-none bg-transparent p-1 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none"
        aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <SvgMaskIcon src={iconMenu} className="app-sidebar__menu-icon block h-5 w-5 opacity-85" />
      </button>
    </div>
  );
}
