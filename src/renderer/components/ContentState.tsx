import type { ReactNode } from 'react';
import { EmptyLine } from './ui/EmptyLine';
import styles from './ContentState.module.css';

interface ContentStateProps {
  title: string;
  action?: ReactNode;
}

/** A centered single line for the content card: no server selected, a view that failed, or a missing screen. */
export default function ContentState({ title, action }: ContentStateProps) {
  return (
    <div className={styles.state} data-testid="content-state">
      <EmptyLine title={title} action={action} />
    </div>
  );
}
