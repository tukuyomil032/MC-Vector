import type { ReactNode } from 'react';

/** One titled block of the lab. Every Arc component gets one. */
export function LabSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-[length:var(--text-lg)] font-semibold text-[var(--foreground)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LabCaption({ children }: { children: ReactNode }) {
  return <span className="text-xs text-[var(--text-muted)]">{children}</span>;
}

export const MINECRAFT_VERSIONS = [
  { value: '1.21.4', label: '1.21.4', keywords: ['paper', 'latest'] },
  { value: '1.21.1', label: '1.21.1', keywords: ['paper'] },
  { value: '1.20.6', label: '1.20.6', keywords: ['purpur'] },
  { value: '1.19.4', label: '1.19.4' },
];

export const LOG_LEVELS = [
  { value: 'ALL', label: 'ALL' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARN', label: 'WARN' },
  { value: 'ERROR', label: 'ERROR' },
  { value: 'FATAL', label: 'FATAL' },
];

export const noop = () => undefined;
