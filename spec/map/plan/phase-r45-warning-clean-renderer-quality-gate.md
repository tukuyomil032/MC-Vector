# R45: Enforce warning-clean renderer-core quality

## Purpose

Make the renderer crate's quality boundary reproducible and prevent unfinished code from being hidden with `allow(dead_code)`, `allow(unused)`, underscore renames, or relaxed warning policy.

## Scope

- Add a repository script that scans the renderer crate for forbidden warning-suppression attributes.
- Run renderer-only format, check, `clippy -- -D warnings`, and test gates from one command.
- Keep unrelated application warnings out of this phase; they require their own focused tasks and commits.

## Command

```bash
bun run test:map:renderer:quality
```

The command executes:

```text
cargo fmt --all -- --check
cargo check -p map-renderer-core
cargo clippy -p map-renderer-core -- -D warnings
cargo test -p map-renderer-core
```

## Completion boundary

This proves warning-clean quality for the current renderer crate only. It does not prove that the application has no unrelated Rust warnings, that every Dynmap symbol has pixel parity, or that real Paper/Tauri acceptance has passed.

## Commit

```text
test: enforce warning clean map renderer core
```
