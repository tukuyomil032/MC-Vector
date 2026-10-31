export interface PluginInstallItem {
  name: string;
  iconUrl?: string;
  /** Muted text on the right of the row, such as the file name that will be written. */
  detail?: string;
}

const ROW_CLASS = 'flex h-[52px] items-center gap-3 px-3.5';
const AVATAR_CLASS = 'h-[28px] w-[28px] shrink-0 rounded-[8px]';

/** Plugins queued for one install, as an inset card. Rows without an icon show the first letter of the name instead. */
export function PluginInstallList({ items }: { items: PluginInstallItem[] }) {
  return (
    <ul className="m-0 max-h-[240px] list-none overflow-x-hidden overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] p-0">
      {items.map((item, index) => (
        <li
          key={item.name}
          className={index > 0 ? `${ROW_CLASS} border-t border-[var(--border-subtle)]` : ROW_CLASS}
        >
          {item.iconUrl ? (
            <img
              src={item.iconUrl}
              alt=""
              width={28}
              height={28}
              className={`${AVATAR_CLASS} object-cover`}
            />
          ) : (
            <span
              aria-hidden="true"
              className={`${AVATAR_CLASS} flex items-center justify-center bg-[var(--surface-muted)] text-[12px] font-semibold text-[var(--text-secondary)]`}
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--foreground)]">
            {item.name}
          </span>
          {item.detail ? (
            <span className="max-w-[45%] shrink-0 truncate text-[12px] text-[var(--text-secondary)]">
              {item.detail}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
