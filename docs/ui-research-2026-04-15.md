# UI research notes (2026-04-15)

## Scope

This document tracks root-cause findings for the 9 UI/UX regressions reported on 2026-04-15.

## Findings

### 1) Java uninstall leaves files on disk

- `downloadJava()` stores `javaHome` in config (`src/lib/java-commands.ts`).
- On macOS this can be `.../Contents/Home` (`find_java_home` in `src-tauri/src/commands/java.rs`).
- `deleteJava()` currently removes only `target.path`, which can leave install root folders behind.

### 2) Files save fails (button and shortcut)

- Save path: `FilesView -> saveFileContent -> assertAllowedPath -> resolve_managed_path`.
- The save target is composed from UI state (`currentPath` + `editingFile`), so normalization and filename extraction must be strict and stable.
- Any mismatch in managed path normalization can produce identical user-facing save failures regardless of trigger.

### 3) Plugin platform switch animation mismatch

- `PluginBrowser` uses dedicated blur-based motion vars.
- App-level page transition (`AppMainContent`) uses opacity + y transitions.
- Requirement is to align plugin platform switch to app-level page transition feel.

### 4) Files toolbar icons are hard to see

- Multiple SVG assets under `src/assets/icons` have fixed black fill/stroke (`#000000`).
- Icons are rendered via `<img>`, so parent text color does not affect them.
- Fix needs both asset-side color strategy and toolbar-side contrast tuning.

### 5) Light theme inconsistency

- Many view styles still use dark fixed colors (`text-zinc-*`, hardcoded rgba/hex).
- Theme tokens are present, but not consistently consumed across all views.

### 6) Toast readability

- Normal toasts are gradient-based; reported readability issue indicates insufficient opacity/contrast in actual usage contexts.
- Scope confirmed: normal toast only (not download toast).

### 7) Backup selector graph interaction

- Current graph mode is tree-like card rendering, without zoom/pan/rearrange.
- Requirement now expects advanced interaction (zoom, pan, manual repositioning).

### 8) Proxy backend text spacing

- Backend detail uses i18n string with spacing, but layout/readability still feels cramped in UI.
- Needs both content formatting guard and style-level spacing improvements.

### 9) Paper logo source

- Platform logo in Plugin browser currently points to remote favicon.
- User-provided local asset exists at `src/assets/papermc_logo.svg` and should be used.
