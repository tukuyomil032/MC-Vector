import type { CSSProperties } from 'react';
import type { AppTheme } from '../../store/settingsStore';

export type ResolvedAppTheme = Exclude<AppTheme, 'system'>;

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
  light: {
    mainBg:
      'radial-gradient(circle at 20% 0%, rgba(59,130,246,0.14), transparent 45%), radial-gradient(circle at 90% 0%, rgba(16,185,129,0.12), transparent 35%), #f4f7fb',
    headerBg: 'rgba(255,255,255,0.95)',
    text: '#0f172a',
    sidebarBg: '#e8eef6',
    sidebarPanelBg: '#f8fafc',
    panelBg: '#ffffff',
    border: '#cbd5e1',
    viewGlowA: 'rgba(59, 130, 246, 0.12)',
    viewGlowB: 'rgba(16, 185, 129, 0.1)',
    panelStart: 'rgba(255, 255, 255, 0.95)',
    panelEnd: 'rgba(241, 245, 249, 0.88)',
    panelAltStart: 'rgba(248, 250, 252, 0.96)',
    panelAltEnd: 'rgba(226, 232, 240, 0.88)',
    borderSoft: 'rgba(148, 163, 184, 0.45)',
    borderStrong: 'rgba(14, 165, 233, 0.35)',
    accentStart: '#2563eb',
    accentEnd: '#0891b2',
    successStart: '#16a34a',
    successEnd: '#059669',
    warnStart: '#d97706',
    warnEnd: '#ea580c',
  },
};

export function resolveAppTheme(
  appTheme: AppTheme,
  systemPrefersDark: boolean,
): Exclude<AppTheme, 'system'> {
  return appTheme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : appTheme;
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
