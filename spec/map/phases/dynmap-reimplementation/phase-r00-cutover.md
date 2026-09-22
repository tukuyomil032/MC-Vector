# R00: Cutover and Clean Baseline

## Goal

Remove the incomplete Map implementation without removing unrelated branch
changes or the existing user-owned Tauri command allowlist change.

## Dependencies

None. This phase must finish before any renderer source is edited.

## Owned scope

The Map changes introduced after `origin/main`, beginning at
`de34583 feat: add MC-Vector map integration`.

Keep `b61c62d`, `e8080a7`, `8c00128`, and `c18a339` as separately identified
non-Map/user-owned changes.

## Implementation tasks

- create a recoverable backup ref for the current `HEAD`;
- restore the tree to `origin/main` and reapply only the four keep-set changes;
- remove `src-tauri/src/commands/map.rs`, `src-tauri/src/commands/map/`, and
  `src-tauri/src/map/`;
- remove Map-only React, Paper, tests, source snapshots, specs, workflows, and
  release helpers;
- verify `src/lib/tauri-command-allowlist.ts` retains the user change;
- record the exact remaining diff against `origin/main`.

## Focused checks

```bash
git diff --name-status origin/main
git diff --check
test ! -e src-tauri/src/commands/map.rs
test ! -d src-tauri/src/map
```

## Gate

The remaining diff contains only the four keep-set changes and no Map feature
implementation. Commit as:

```text
revert: remove incomplete map implementation
```

## Non-goals

No new renderer code, source download, Paper plugin, UI, or fixture is added.
