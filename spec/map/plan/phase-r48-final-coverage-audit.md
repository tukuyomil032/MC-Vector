# R48: Final Map renderer coverage audit

## Purpose

Provide one final, non-ambiguous command that checks source closure, renderer quality, frontend behavior, Rust library tests, acceptance evidence, and repository hygiene together. The audit is deliberately strict: a missing fixture, missing reference, missing version adapter, or missing real Paper/Tauri record must fail.

## Command

```bash
bun run test:map:final-audit
```

The command runs:

```text
bun scripts/check-map-renderer-coverage.mjs --require-all-symbols --require-all-resources --require-all-builtins --require-all-versions
node scripts/check-map-acceptance-evidence.mjs --require-complete
bun run test:map:renderer:quality
bun run check
bun run test
bun run typecheck:tests
bun run build
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
git diff --check
```

Each subcommand is reported separately. Failed output is truncated to the last 20 lines so the audit remains readable while preserving the command boundary.

`--report-only` is available for diagnostics, but it must not be used as completion evidence:

```bash
node scripts/run-map-final-audit.mjs --report-only
```

## Completion conditions

R48 is complete only when the strict command exits successfully and the evidence ledger has no unresolved required row. In the current checkout, the command is expected to fail because the source/resource/built-in/version catalogs still contain incomplete entries and the real acceptance matrix has 48 blocked records. That failure is the correct state; it is not converted into a pass by weakening the command.

The final report must distinguish:

- source catalog completion;
- resource catalog completion;
- built-in renderer completion;
- version/Anvil/Paper adapter completion;
- reference and pixel parity;
- real Paper/Tauri acceptance;
- UI and shutdown/port evidence;
- repository quality checks.

## Commit

```text
test: close map renderer coverage audit
```
