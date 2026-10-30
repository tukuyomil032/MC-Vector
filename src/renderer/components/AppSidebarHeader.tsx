import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import styles from './AppSidebar.module.css';

interface AppSidebarHeaderProps {
  isSidebarOpen: boolean;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  openSettingsLabel: string;
  collapseLabel: string;
  expandLabel: string;
}

export default function AppSidebarHeader({
  isSidebarOpen,
  onOpenSettings,
  onToggleSidebar,
  openSettingsLabel,
  collapseLabel,
  expandLabel,
}: AppSidebarHeaderProps) {
  const toggleLabel = isSidebarOpen ? collapseLabel : expandLabel;

  return (
    <div
      className={['app-sidebar__header', styles.header, isSidebarOpen ? '' : styles.headerCollapsed]
        .filter(Boolean)
        .join(' ')}
    >
      {isSidebarOpen && (
        <button
          type="button"
          className={styles.brand}
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
        className={styles.iconButton}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {isSidebarOpen ? (
          <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden={true} />
        ) : (
          <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden={true} />
        )}
      </button>
    </div>
  );
}
