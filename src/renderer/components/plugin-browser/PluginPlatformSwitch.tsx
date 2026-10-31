import { Tabs, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import type { LucideIcon } from 'lucide-react';
import styles from './plugin-browser.module.css';
import type { BrowserPlatform } from './plugin-model';

export interface PlatformOption {
  key: BrowserPlatform;
  label: string;
  /** Shown in a tooltip on the option, so the switch stays one line. */
  hint: string;
  inApp: boolean;
  icon: LucideIcon;
  logoUrl: string;
}

export interface PluginPlatformSwitchProps {
  value: BrowserPlatform;
  options: PlatformOption[];
  label: string;
  logoFailed: Record<string, boolean>;
  onChange: (platform: BrowserPlatform) => void;
  onLogoFailed: (platform: BrowserPlatform) => void;
}

/** Provider switch styled like the section tabs: the platform logo and name, with the description in a tooltip. */
export function PluginPlatformSwitch({
  value,
  options,
  label,
  logoFailed,
  onChange,
  onLogoFailed,
}: PluginPlatformSwitchProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as BrowserPlatform)}>
      <TabsList aria-label={label}>
        {options.map((option) => {
          const Icon = option.icon;
          const showLogo = option.logoUrl.length > 0 && !logoFailed[option.key];
          return (
            <TabsTrigger
              key={option.key}
              value={option.key}
              data-testid={`plugin-provider-${option.key.toLowerCase()}`}
            >
              <Tooltip content={option.hint}>
                <span className={styles.platformLabel}>
                  {showLogo ? (
                    <img
                      src={option.logoUrl}
                      alt=""
                      width={16}
                      height={16}
                      loading="lazy"
                      className={styles.platformLogo}
                      onError={() => onLogoFailed(option.key)}
                    />
                  ) : (
                    <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  <span>{option.label}</span>
                </span>
              </Tooltip>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export default PluginPlatformSwitch;
