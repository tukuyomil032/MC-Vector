import type { AppView } from '../shared/server declaration';
import SvgMaskIcon from './SvgMaskIcon';
import { Tooltip } from './ui/Tooltip';

interface AppNavItemProps {
  label: string;
  tooltip: string;
  view: AppView;
  current: AppView;
  set: (view: AppView) => void;
  iconSrc: string;
}

export default function AppNavItem({
  label,
  tooltip,
  view,
  current,
  set,
  iconSrc,
}: AppNavItemProps) {
  const isOpen = !!label;
  const isActive = current === view;

  return (
    <Tooltip content={tooltip} disabled={isOpen} side="right">
      <div
        className={`app-nav-item mx-1 my-0.5 flex w-full items-center box-border rounded-md text-sm transition-all focus:outline-none ${isOpen ? 'justify-start px-4 py-2.5' : 'justify-center px-0 py-2.5'} ${isActive ? 'is-active' : 'is-idle hover:translate-x-1 hover:bg-white/5 hover:text-text-primary'}`}
        data-testid={`nav-item-${view}`}
        onClick={() => set(view)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            set(view);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={tooltip}
        aria-current={isActive ? 'page' : undefined}
      >
        <SvgMaskIcon
          src={iconSrc}
          className={`app-nav-item__icon block h-5 w-5 shrink-0 ${isOpen ? 'mr-3' : 'mr-0'} ${isActive ? 'is-active opacity-100' : 'is-idle opacity-80'}`}
        />
        {isOpen && <span className="app-nav-item__label truncate">{label}</span>}
      </div>
    </Tooltip>
  );
}
