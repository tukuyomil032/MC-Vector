import type { ReactNode } from 'react';
import { Switch } from '@/components/arc/switch/switch';
import { HintIcon } from '../ui/FieldLabel';
import styles from './PropertyCards.module.css';

export interface PropertyToggleRowProps {
  /** Unique on the page. It names the label and the switch's test id. */
  id: string;
  label: string;
  /** Shown in the hint tooltip beside the label, so the row keeps one line. */
  description: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A switch row: the label with its hint icon on the left, the switch at the far right. The hint is a tooltip, so it takes no row height. */
export function PropertyToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: PropertyToggleRowProps) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabelGroup}>
        <span className={styles.toggleLabel} id={`properties-${id}-label`}>
          {label}
        </span>
        <HintIcon hint={description} label={label} />
      </span>
      <Switch
        aria-labelledby={`properties-${id}-label`}
        checked={checked}
        onCheckedChange={onChange}
        data-testid={`properties-toggle-${id}`}
      />
    </div>
  );
}
