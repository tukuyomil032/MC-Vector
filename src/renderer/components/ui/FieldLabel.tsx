import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import { useTranslation } from '@/i18n';
import styles from './FieldLabel.module.css';

export interface FieldLabelProps {
  label: string;
  /** Id of the control this label names. */
  htmlFor?: string;
  /** Help text. It stays out of the layout and shows in a tooltip from the info icon. */
  hint?: ReactNode;
  /** Shows a required mark after the label. The control itself still carries `required`. */
  required?: boolean;
}

/** The small info button. Hovering or focusing it shows the hint in a tooltip. */
export function HintIcon({ hint, label }: { hint: ReactNode; label?: string }) {
  const { t } = useTranslation();
  const moreInfo = t('common.moreInfo');
  return (
    <Tooltip content={hint} side="top">
      <button
        type="button"
        className={styles.hint}
        aria-label={label ? `${label}: ${moreInfo}` : moreInfo}
        data-testid="hint-icon"
      >
        <Info size={14} strokeWidth={1.75} aria-hidden={true} />
      </button>
    </Tooltip>
  );
}

/** A form label with an optional hint and required mark. Use it wherever a field needs a note that should not take up space. */
export function FieldLabel({ label, htmlFor, hint, required }: FieldLabelProps) {
  return (
    <span className={styles.root}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {required && (
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      )}
      {hint && <HintIcon hint={hint} label={label} />}
    </span>
  );
}

export default FieldLabel;
