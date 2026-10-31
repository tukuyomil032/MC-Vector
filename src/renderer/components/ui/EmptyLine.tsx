import type { ReactNode } from 'react';
import styles from './EmptyLine.module.css';

export interface EmptyLineProps {
  /** The one line to show, for example "バックアップはまだありません". */
  title: string;
  /** An optional action, such as a button. It sits under the line. */
  action?: ReactNode;
  className?: string;
}

/** A quiet empty state: one muted, centered line with no icon and no description. Use it wherever a list or panel has nothing to show. */
export function EmptyLine({ title, action, className }: EmptyLineProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <p role="status" className={styles.line}>
        {title}
      </p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export default EmptyLine;
