import { Card } from '@/components/arc/card/card';
import type { ReactNode } from 'react';
import styles from './GuideView.module.css';

interface GuideStepProps {
  /** The step label, such as "Step 1". It is text, not a colored badge. */
  badge: string;
  title: string;
  children: ReactNode;
}

/** One numbered step of a setup guide, on an Arc card. */
export function GuideStep({ badge, title, children }: GuideStepProps) {
  return (
    <Card title={`${badge} · ${title}`} className={styles.card}>
      <div className={styles.stepBody}>{children}</div>
    </Card>
  );
}
