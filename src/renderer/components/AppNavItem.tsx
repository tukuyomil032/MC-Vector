import { type AppView } from '../shared/server declaration';

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
    <div
      className={`app-nav-item ${isOpen ? 'app-nav-item--open' : 'app-nav-item--collapsed'} ${isActive ? 'is-active' : 'is-idle'}`}
      onClick={() => set(view)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          set(view);
        }
      }}
      title={isOpen ? '' : tooltip}
      role="button"
      tabIndex={0}
      aria-label={tooltip}
      aria-current={isActive ? 'page' : undefined}
    >
      <img
        src={iconSrc}
        alt={tooltip}
        className={`app-nav-item__icon ${isOpen ? 'app-nav-item__icon--open' : 'app-nav-item__icon--collapsed'} ${isActive ? 'is-active' : 'is-idle'}`}
      />
      {isOpen && <span className="app-nav-item__label">{label}</span>}
    </div>
  );
}
