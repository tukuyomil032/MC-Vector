# R46: Repository and CI verification matrix

## Purpose

Expose the current Map renderer evidence boundaries as separate CI jobs without claiming that metadata cataloging is renderer completion. The version matrix is the single source for the generated version job matrix.

## Scope

- Verify the pinned Dynmap source boundary.
- Verify source, resource, built-in renderer, and version catalogs are structurally complete enough for the current phase.
- Run the warning-clean renderer-core quality gate.
- Validate every entry in `spec/map/coverage/version-matrix.json` through a generated GitHub Actions matrix.
- Keep frontend map contract tests separate from renderer and version checks.

## Workflow

`.github/workflows/map-renderer.yml` contains four independent evidence groups:

1. `renderer-static` checks source attribution, metadata catalogs, reference fixtures, renderer formatting, Clippy, tests, and TypeScript test typing.
2. `generate-version-matrix` reads the version catalog and emits the Actions matrix; versions are not duplicated in workflow YAML.
3. `version-metadata` validates each catalog entry independently. It proves official metadata exists, not that the version has a verified Anvil adapter, Paper snapshot adapter, or real acceptance evidence.
4. `frontend-contract` runs Map interaction/command tests and general frontend checks independently.

All external Actions are pinned to commit SHAs. The workflow does not download client/server/Paper artifacts, run real Paper, or publish a release.

## Commands

```bash
node scripts/map-version-matrix-output.mjs
node scripts/check-map-version-entry.mjs 1.21.4
node scripts/verify-dynmap-source.mjs
node scripts/verify-map-version-artifacts.mjs
bun scripts/verify-map-reference-fixtures.mjs
bun run test:map:renderer:quality
bun run check:workflow-actions
```

## Completion boundary

This phase is complete when the workflow is structurally valid, all Actions are immutable, the generated matrix covers every catalog entry, current renderer/source/fixture checks pass, and the frontend contract checks pass.

This phase does not prove:

- all Minecraft versions have a verified adapter;
- all Dynmap symbols/resources/built-in renderers have pixel parity;
- Paper snapshot or real Tauri acceptance has passed;
- real server stop, Java exit, or port release has passed.

Those remain explicit R47/R48 gates.

## Commit

```text
ci: add versioned map renderer verification matrix
```
