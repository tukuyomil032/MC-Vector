import type { CSSProperties } from 'react';
import type { AppTheme } from '../../store/settingsStore';

export type ResolvedAppTheme = AppTheme;

interface AppShellThemeColors {
  mainBg: string;
  text: string;
  sidebarBg: string;
  border: string;
  panelAltStart: string;
  borderSoft: string;
}

const THEME_PALETTE: Record<ResolvedAppTheme, AppShellThemeColors> = {
  // Values point at the Arc foundation tokens (src/components/arc/foundation.css).
  dark: {
    mainBg: 'var(--background)',
    text: 'var(--foreground)',
    sidebarBg: 'var(--background)',
    border: 'var(--border-subtle)',
    panelAltStart: 'color-mix(in oklab, var(--surface-raised) 95%, transparent)',
    borderSoft: 'var(--border)',
  },
};

export function resolveAppTheme(appTheme: AppTheme): ResolvedAppTheme {
  return appTheme;
}

export function buildAppShellStyle(resolvedTheme: ResolvedAppTheme): CSSProperties {
  const themeColors = THEME_PALETTE[resolvedTheme];

  const appShellCssVars: Record<`--${string}`, string> = {
    '--mv-shell-bg': themeColors.mainBg,
    '--mv-shell-text': themeColors.text,
    '--mv-shell-border': themeColors.border,
    '--mv-shell-sidebar-bg': themeColors.sidebarBg,
    '--mv-shell-main-bg': 'transparent',
    '--mv-panel-alt-start': themeColors.panelAltStart,
    '--mv-border-soft': themeColors.borderSoft,
  };

  return { ...appShellCssVars };
}
