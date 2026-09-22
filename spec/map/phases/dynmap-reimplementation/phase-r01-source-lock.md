# R01: Source Lock and License Boundary

## Goal

Make the pinned Dynmap renderer source, license, and Rust destination mapping
auditable before writing production renderer code.

## Dependencies

R00.

## Owned files

- `spec/dynmap/source-scope-and-version.md`
- `spec/dynmap/source-porting.md`
- `src/map/dynmap/` attribution and source manifest
- `scripts/verify-dynmap-source.mjs`

## Implementation tasks

- lock commit `93b454efb8802dc7406d6873434f2aeec5c636f4`;
- enumerate the exact upstream classes and methods used by R02-R04;
- record the Apache-2.0 notice and source path for every copied or translated
  unit;
- record the Rust destination module and fixture ID for each unit;
- verify the selected Java source is not bundled into the frontend or Paper JAR;
- reject a source manifest with a changed revision, missing attribution, or an
  unassigned renderer symbol.

## Focused checks

```bash
bun scripts/verify-dynmap-source.mjs
git diff --check
```

## Gate

Every renderer algorithm used by the next phases has an upstream path,
pinned-revision reference, license record, Rust destination, and fixture ID.

## Non-goals

No Bukkit lifecycle, Dynmap web server, Dynmap storage, or product runtime is
copied into MC-Vector.
