import type { ReactNode } from 'react';
import type { AppView } from '../shared/server declaration';
import styles from './AppSidebar.module.css';
import { Tooltip } from './ui/Tooltip';

interface AppNavItemProps {
  /** Visible label. Empty in the collapsed rail, where the tooltip and aria-label name the item instead. */
  label: string;
  tooltip: string;
  view: AppView;
  current: AppView;
  set: (view: AppView) => void;
  icon: ReactNode;
}

export default function AppNavItem({ label, tooltip, view, current, set, icon }: AppNavItemProps) {
  const isOpen = !!label;
  const isActive = current === view;

  return (
    <Tooltip content={tooltip} disabled={isOpen} side="right">
      <button
        type="button"
        className={[
          'app-nav-item',
          isActive ? 'is-active' : 'is-idle',
          styles.navItem,
          isOpen ? '' : styles.navItemCollapsed,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`nav-item-${view}`}
        onClick={() => set(view)}
        aria-label={isOpen ? undefined : tooltip}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className={styles.navItemIcon} aria-hidden="true">
          {icon}
        </span>
        {isOpen && <span className={styles.navItemLabel}>{label}</span>}
      </button>
    </Tooltip>
  );
}
