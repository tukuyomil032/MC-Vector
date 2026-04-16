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
  dark: {
    mainBg: '#0f0f11',
    headerBg: 'rgba(18,18,20,0.92)',
    text: '#ffffff',
    sidebarBg: '#16171d',
    sidebarPanelBg: '#1f2027',
    panelBg: '#1c1d23',
    border: '#2f2f3d',
    viewGlowA: 'rgba(74, 222, 128, 0.1)',
    viewGlowB: 'rgba(56, 189, 248, 0.15)',
    panelStart: 'rgba(24, 24, 27, 0.94)',
    panelEnd: 'rgba(17, 24, 39, 0.88)',
    panelAltStart: 'rgba(24, 24, 27, 0.95)',
    panelAltEnd: 'rgba(31, 41, 55, 0.84)',
    borderSoft: 'rgba(82, 82, 91, 0.72)',
    borderStrong: 'rgba(34, 211, 238, 0.42)',
    accentStart: '#0ea5e9',
    accentEnd: '#06b6d4',
    successStart: '#22c55e',
    successEnd: '#10b981',
    warnStart: '#f59e0b',
    warnEnd: '#f97316',
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
