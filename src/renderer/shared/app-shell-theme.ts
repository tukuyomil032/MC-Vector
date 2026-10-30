import type { CSSProperties } from 'react';
import type { AppTheme } from '../../store/settingsStore';

export type ResolvedAppTheme = AppTheme;

interface AppShellThemeColors {
  mainBg: string;
  headerBg: string;
  text: string;
  sidebarBg: string;
  sidebarPanelBg: string;
  panelBg: string;
  border: string;
  viewGlowA: string;
  viewGlowB: string;
  panelStart: string;
  panelEnd: string;
  panelAltStart: string;
  panelAltEnd: string;
  borderSoft: string;
  borderStrong: string;
  accentStart: string;
  accentEnd: string;
  successStart: string;
  successEnd: string;
  warnStart: string;
  warnEnd: string;
}

const THEME_PALETTE: Record<ResolvedAppTheme, AppShellThemeColors> = {
  // Values point at the Arc foundation tokens (src/components/arc/foundation.css).
  dark: {
    mainBg: 'var(--background)',
    headerBg: 'color-mix(in oklab, var(--surface) 92%, transparent)',
    text: 'var(--foreground)',
    sidebarBg: 'var(--background)',
    sidebarPanelBg: 'var(--surface)',
    panelBg: 'var(--surface)',
    border: 'var(--border-subtle)',
    viewGlowA: 'transparent',
    viewGlowB: 'transparent',
    panelStart: 'color-mix(in oklab, var(--surface) 94%, transparent)',
    panelEnd: 'color-mix(in oklab, var(--surface) 88%, transparent)',
    panelAltStart: 'color-mix(in oklab, var(--surface-raised) 95%, transparent)',
    panelAltEnd: 'color-mix(in oklab, var(--surface-raised) 84%, transparent)',
    borderSoft: 'var(--border)',
    borderStrong: 'var(--border-strong)',
    accentStart: 'var(--accent)',
    accentEnd: 'var(--accent-strong)',
    successStart: 'var(--success)',
    successEnd: 'var(--success)',
    warnStart: 'var(--warning)',
    warnEnd: 'var(--warning)',
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
    '--mv-shell-sidebar-panel-bg': themeColors.sidebarPanelBg,
    '--mv-shell-main-bg': 'transparent',
    '--mv-shell-header-bg': themeColors.headerBg,
    '--mv-shell-content-bg': themeColors.panelBg,
    '--mv-view-glow-a': themeColors.viewGlowA,
    '--mv-view-glow-b': themeColors.viewGlowB,
    '--mv-panel-start': themeColors.panelStart,
    '--mv-panel-end': themeColors.panelEnd,
    '--mv-panel-alt-start': themeColors.panelAltStart,
    '--mv-panel-alt-end': themeColors.panelAltEnd,
    '--mv-border-soft': themeColors.borderSoft,
    '--mv-border-strong': themeColors.borderStrong,
    '--mv-accent-start': themeColors.accentStart,
    '--mv-accent-end': themeColors.accentEnd,
    '--mv-success-start': themeColors.successStart,
    '--mv-success-end': themeColors.successEnd,
    '--mv-warn-start': themeColors.warnStart,
    '--mv-warn-end': themeColors.warnEnd,
  };

  return { ...appShellCssVars };
}
