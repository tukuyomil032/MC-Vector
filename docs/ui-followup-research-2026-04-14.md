# UI Follow-up Research (2026-04-14)

## Background

After the first regression-fix batch, additional visual/interaction issues were reported:

1. Layout overlap at specific medium window widths.
2. Plugin platform-switch animation feeling stiff/unnatural.
3. Proxy Network tab should look closer to General Settings.
4. Select dropdown menu still looked visually off.
5. Backup selector still had light/white-looking elements.
6. Requested node-graph mode should be closer to an actual hierarchical graph.

## Investigation Targets

- `src/renderer/components/BackupTargetSelectorWindow.tsx`
- `src/styles/views/_backup-selector-window.scss`
- `src/renderer/components/PluginBrowser.tsx`
- `src/styles/views/_plugin-browser.scss`
- `src/renderer/components/ProxySetupView.tsx`
- `src/styles/views/_proxy-setup-view.scss`
- `src/styles/components/_ui-components.scss`

## Findings and Direction

### 1) Medium-width overlap

- Overlap risk was concentrated in flexible toolbars where multiple grouped controls had fixed minimum visual footprints.
- Fix direction: enforce `flex-wrap` + width/flex-basis constraints and breakpoint-specific stacking for intermediate widths.

### 2) Plugin motion quality

- Platform switch transition needed a softer unified profile (not abrupt card replacement).
- Fix direction: use one consistent fade/translate/soft-blur motion profile for all platforms with reduced-motion safeguards.

### 3) Proxy style mismatch

- Existing layout looked utilitarian and lacked hierarchy compared with General Settings.
- Fix direction: add inner container, section cards, panel title hierarchy, and more structured spacing.

### 4) Select menu discomfort

- Trigger/dropdown visuals needed safer cross-view consistency.
- Fix direction: tune shared `select.input-field` treatment (trigger spacing/chevron/menu surface) while avoiding fragile per-view hacks.

### 5) Backup selector light surfaces

- Native checkbox visuals and some panel layers could appear too bright against dark UI.
- Fix direction: enforce dark base background and custom checkbox styling consistent with theme.

### 6) Node graph expectation

- Previous graph mode presentation was too chip/list-like.
- Fix direction: move to a hierarchical node-card graph representation with connector lines and expand/collapse relationships.

## Implemented Scope (this follow-up round)

- Backup selector:
  - dark-theme consistency improvements
  - true hierarchical node-card graph style
  - responsive overlap fixes for header/toolbar/panel
- Plugin:
  - softer unified platform-switch motion profile
- Proxy:
  - visual hierarchy aligned toward General Settings style
- Shared select:
  - improved trigger/menu visual consistency

## Validation Gate

- `pnpm check`
- `pnpm build`
