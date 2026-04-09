# UI/UX Pro Max (Shell + Dashboard + Console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh App shell, Dashboard, and Console into a cohesive production-grade UI while migrating theme behavior to `light / dark / system` (default `light`).

**Architecture:** First migrate and centralize theme-mode behavior, then introduce shared visual primitives in SCSS, then apply those primitives to App shell and the two priority views. Keep business logic intact and limit changes to structure/styling and theme option plumbing.

**Tech Stack:** React 19, TypeScript, Zustand, SCSS + Tailwind `@layer`, Vite, Tauri

---

## File Structure (planned changes)

- Modify: `src/store/settingsStore.ts`  
  Responsibility: canonical app theme type/state default
- Modify: `src/App.tsx`  
  Responsibility: resolved theme selection and shell-level palette variables
- Modify: `src/renderer/components/SettingsWindow.tsx`  
  Responsibility: theme picker options and normalization path
- Modify: `src/i18n/types.ts`  
  Responsibility: remove legacy theme option keys from type contract
- Modify: `src/i18n/locales/en.ts`  
  Responsibility: update theme option labels (light/dark/system)
- Modify: `src/i18n/locales/ja.ts`  
  Responsibility: update theme option labels (light/dark/system)
- Create: `src/styles/base/_design-tokens.scss`  
  Responsibility: shared semantic token variables for light/dark surfaces
- Create: `src/styles/components/_surface-primitives.scss`  
  Responsibility: reusable UI primitives (`surface-card`, `section-title`, `kpi-tile`, `control-chip`)
- Modify: `src/styles/index.scss`  
  Responsibility: register new SCSS modules
- Modify: `src/styles/layout/_app-layout.scss`  
  Responsibility: App shell structural visual refresh
- Modify: `src/styles/views/_dashboard-view.scss`  
  Responsibility: Dashboard-specific layout + KPI emphasis
- Modify: `src/styles/views/_console-view.scss`  
  Responsibility: Console-specific visual hierarchy
- Modify: `src/renderer/components/DashboardView.tsx`  
  Responsibility: semantic structure hooks for new dashboard primitives
- Modify: `src/renderer/components/ConsoleView.tsx`  
  Responsibility: semantic structure hooks for new console primitives
- Modify: `docs/ui-ux-pro-max-plan.md`  
  Responsibility: status matrix update (Phase 1/2/3 progression)

> Note: This repository currently has no dedicated frontend unit-test runner. RED/GREEN gates in this plan use existing project gates (`pnpm check`, `pnpm build`) plus explicit manual acceptance checks.

### Task 1: Theme mode migration to light/dark/system

**Files:**

- Modify: `src/store/settingsStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/renderer/components/SettingsWindow.tsx`
- Modify: `src/i18n/types.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/ja.ts`
- Test: manual acceptance + `pnpm check` + `pnpm build`

- [ ] **Step 1: Capture failing behavior (RED)**

Run: App settings UI review  
Expected fail criteria:

1. Theme dropdown still contains legacy values (`darkBlue`, `forest`, etc.)
2. Default behavior is not `light`

- [ ] **Step 2: Narrow theme type to three modes**

```ts
// src/store/settingsStore.ts
export type AppTheme = 'light' | 'dark' | 'system';

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  appTheme: 'light',
  systemPrefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  setAppTheme: (theme) => set({ appTheme: theme }),
  setSystemPrefersDark: (value) => set({ systemPrefersDark: value }),
}));
```

- [ ] **Step 3: Update settings picker + normalization**

```tsx
// src/renderer/components/SettingsWindow.tsx
type AppTheme = 'light' | 'dark' | 'system';

const normalizeTheme = (value: unknown): AppTheme => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'dark'; // legacy values migrate to dark
};

<select value={theme} onChange={(e) => handleThemeChange(e.target.value as AppTheme)}>
  <option value="light">{t('settings.theme.options.light')}</option>
  <option value="dark">{t('settings.theme.options.dark')}</option>
  <option value="system">{t('settings.theme.options.system')}</option>
</select>;
```

- [ ] **Step 4: Align App theme resolution and i18n contracts**

```ts
// src/App.tsx
const normalizeTheme = (value: unknown): AppTheme => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'dark';
};

const resolvedTheme: Exclude<AppTheme, 'system'> =
  appTheme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : appTheme;
```

```ts
// src/i18n/types.ts + locales
settings: {
  theme: {
    options: {
      light: string;
      dark: string;
      system: string;
    }
  }
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm check && pnpm build
```

Expected:

1. commands pass
2. theme dropdown shows only `light`, `dark`, `system`
3. default theme is `light` for fresh config

- [ ] **Step 6: Commit**

```bash
git add src/store/settingsStore.ts src/App.tsx src/renderer/components/SettingsWindow.tsx src/i18n/types.ts src/i18n/locales/en.ts src/i18n/locales/ja.ts
git commit -m "ref: migrate app theme modes to light dark system" -m "Replace legacy theme options and align settings/i18n contracts" -m "Set default theme to light with legacy value migration fallback"
```

### Task 2: Introduce shared visual tokens and primitives

**Files:**

- Create: `src/styles/base/_design-tokens.scss`
- Create: `src/styles/components/_surface-primitives.scss`
- Modify: `src/styles/index.scss`
- Modify: `src/styles/base/_base.scss`
- Test: style compilation via `pnpm build`

- [ ] **Step 1: Capture failing behavior (RED)**

Expected fail criteria:

1. Shell/Dashboard/Console use mixed ad-hoc colors/shadows
2. Shared primitive classes do not exist

- [ ] **Step 2: Add semantic design tokens**

```scss
/* src/styles/base/_design-tokens.scss */
@layer base {
  :root {
    --ux-bg-main: #f5f7fb;
    --ux-bg-surface: #ffffff;
    --ux-bg-surface-alt: #f8fafc;
    --ux-border-soft: #dbe3ef;
    --ux-text-primary: #0f172a;
    --ux-text-secondary: #475569;
    --ux-accent: #2563eb;
  }

  .theme-dark {
    --ux-bg-main: #0b1220;
    --ux-bg-surface: #111a2b;
    --ux-bg-surface-alt: #162134;
    --ux-border-soft: #22324d;
    --ux-text-primary: #e2e8f0;
    --ux-text-secondary: #94a3b8;
    --ux-accent: #38bdf8;
  }
}
```

- [ ] **Step 3: Add reusable primitives**

```scss
/* src/styles/components/_surface-primitives.scss */
@layer components {
  .surface-card {
    @apply rounded-2xl border;
    background: var(--ux-bg-surface);
    border-color: var(--ux-border-soft);
  }

  .section-title {
    @apply text-xs font-semibold uppercase tracking-[0.12em];
    color: var(--ux-text-secondary);
  }

  .kpi-tile {
    @apply surface-card p-4;
  }

  .control-chip {
    @apply rounded-md border px-2.5 py-1.5 text-xs font-semibold;
    border-color: var(--ux-border-soft);
    background: var(--ux-bg-surface-alt);
    color: var(--ux-text-primary);
  }
}
```

- [ ] **Step 4: Wire modules into global styles**

```scss
/* src/styles/index.scss */
@use './base/base';
@use './base/design-tokens';
@use './components/surface-primitives';
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm check && pnpm build
```

Expected: no SCSS import/compile errors

- [ ] **Step 6: Commit**

```bash
git add src/styles/base/_design-tokens.scss src/styles/components/_surface-primitives.scss src/styles/index.scss src/styles/base/_base.scss
git commit -m "feat: add semantic design tokens and surface primitives" -m "Introduce shared light/dark token variables and reusable card/control classes" -m "Prepare styling foundation for shell dashboard console refresh"
```

### Task 3: Refresh App shell presentation

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/styles/layout/_app-layout.scss`
- Test: manual shell acceptance + `pnpm check` + `pnpm build`

- [ ] **Step 1: Capture failing behavior (RED)**

Expected fail criteria:

1. Sidebar/header/content visual hierarchy still appears legacy/mixed
2. New primitive classes are not applied in shell surfaces

- [ ] **Step 2: Apply semantic shell classes in TSX**

```tsx
// src/App.tsx (representative)
<aside className={`app-sidebar ${isSidebarOpen ? 'app-sidebar--open' : 'app-sidebar--collapsed'} surface-card`}>
  ...
</aside>

<header className="app-main__header surface-card">
  ...
</header>
```

- [ ] **Step 3: Update shell SCSS to token-driven visuals**

```scss
/* src/styles/layout/_app-layout.scss (representative) */
.app-shell {
  background: var(--ux-bg-main);
  color: var(--ux-text-primary);
}

.app-sidebar,
.app-main__header,
.app-main__content {
  border-color: var(--ux-border-soft);
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm check && pnpm build
```

Manual:

1. Sidebar/nav/servers list visual hierarchy is consistent
2. Header actions remain functional
3. Focus styles remain visible

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles/layout/_app-layout.scss
git commit -m "feat: refresh app shell visual hierarchy" -m "Apply token-driven shell surfaces for sidebar header and content framing" -m "Keep existing shell interactions while improving consistency"
```

### Task 4: Refresh Dashboard with strong KPI emphasis

**Files:**

- Modify: `src/renderer/components/DashboardView.tsx`
- Modify: `src/styles/views/_dashboard-view.scss`
- Test: manual dashboard acceptance + `pnpm check` + `pnpm build`

- [ ] **Step 1: Capture failing behavior (RED)**

Expected fail criteria:

1. KPI cards are not visually dominant enough
2. chart cards and stat cards do not share consistent surface language

- [ ] **Step 2: Re-structure Dashboard markup with primitives**

```tsx
// src/renderer/components/DashboardView.tsx (representative)
<section className="dashboard-view__stats-grid">
  <article className="kpi-tile dashboard-view__stat-card">...</article>
</section>

<section className="dashboard-view__chart-grid">
  <article className="surface-card dashboard-view__chart-card">...</article>
</section>
```

- [ ] **Step 3: Tune dashboard styles for comfortable density**

```scss
/* src/styles/views/_dashboard-view.scss (representative) */
.dashboard-view {
  @apply h-full p-6 flex flex-col gap-5;
}

.dashboard-view__stats-grid {
  @apply grid gap-4;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm check && pnpm build
```

Manual:

1. KPI row is visually strongest block
2. chart readability remains intact
3. no data behavior regressions (CPU/Memory/TPS updates)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DashboardView.tsx src/styles/views/_dashboard-view.scss
git commit -m "feat: redesign dashboard with kpi-first hierarchy" -m "Rework dashboard layout to emphasize key metrics and consistent chart surfaces" -m "Preserve existing metric data flow and interactions"
```

### Task 5: Refresh Console layout hierarchy

**Files:**

- Modify: `src/renderer/components/ConsoleView.tsx`
- Modify: `src/styles/views/_console-view.scss`
- Test: manual console acceptance + `pnpm check` + `pnpm build`

- [ ] **Step 1: Capture failing behavior (RED)**

Expected fail criteria:

1. status/search/log/input zones are not clearly separated
2. control priority and spacing look inconsistent with new shell/dashboard

- [ ] **Step 2: Re-structure Console markup to align with new zones**

```tsx
// src/renderer/components/ConsoleView.tsx (representative)
<section className="console-view__status-bar surface-card">...</section>
<section className="console-view__search-bar surface-card">...</section>
<section className="console-view__log-pane surface-card">...</section>
<section className="console-view__command-bar surface-card">...</section>
```

- [ ] **Step 3: Update console SCSS with control-chip and surface tokens**

```scss
/* src/styles/views/_console-view.scss (representative) */
.console-view__find-button,
.console-view__save-button,
.console-view__search-nav-btn,
.console-view__search-close-btn,
.console-view__filter-pill {
  @apply control-chip;
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm check && pnpm build
```

Manual:

1. send/find/save/filter controls remain fully functional
2. search highlight and active-match UX still works
3. layout remains usable at 1280x720 baseline

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ConsoleView.tsx src/styles/views/_console-view.scss
git commit -m "feat: redesign console view hierarchy and controls" -m "Apply structured status search log command bands with consistent visual system" -m "Retain existing command/search/log behavior while improving readability"
```

### Task 6: Finalize phase docs and release hygiene

**Files:**

- Modify: `docs/ui-ux-pro-max-plan.md`
- Test: `pnpm check` + `pnpm build`

- [ ] **Step 1: Update status matrix**

```md
| 1 | 最新`main`取込 + UI刷新用新規ブランチ作成 | **Done** | Phase 0 |
| 2 | ask_userで詳細要件確定（配色/密度/優先タブ） | **Done** | Phase 1 |
| 3 | デザインシステム定義（トークン/タイポ/コンポーネント規約） | **Done** | Phase 2 |
```

- [ ] **Step 2: Verify GREEN**

Run:

```bash
pnpm check && pnpm build
```

Expected: all checks pass with updated docs

- [ ] **Step 3: Commit**

```bash
git add docs/ui-ux-pro-max-plan.md
git commit -m "docs: update ui ux phase matrix progress" -m "Mark branch setup requirement confirmation and design-system definition as completed" -m "Keep execution status aligned with implementation milestones"
```

## Self-Review (plan vs spec)

- Spec coverage:
  - Theme model migration (`light/dark/system`, default light): covered in Task 1
  - Shared token/primitives: covered in Task 2
  - App shell refresh: covered in Task 3
  - Dashboard refresh: covered in Task 4
  - Console refresh: covered in Task 5
  - Docs/status progression: covered in Task 6
- Placeholder scan: no TBD/TODO placeholders remain in task steps.
- Type consistency:
  - Theme mode is consistently referenced as `light | dark | system`.
  - Screen scope consistently limited to App shell + Dashboard + Console.
