import type { ReactNode } from 'react';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import styles from './ContentState.module.css';

interface ContentStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

/** A centered Arc empty state for the content card: no server selected, a view that failed, or a missing screen. */
export default function ContentState({ icon, title, description, action }: ContentStateProps) {
  return (
    <div className={styles.state} data-testid="content-state">
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}
