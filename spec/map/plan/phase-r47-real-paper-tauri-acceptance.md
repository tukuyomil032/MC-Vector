# R47: Real Paper/Tauri acceptance evidence

## Purpose

Define a machine-checked evidence boundary for real Paper and real Tauri acceptance without treating fixtures, mocks, a loaded plugin, or a connected bridge as proof of terrain rendering.

## Evidence matrix

`spec/map/evidence/real-acceptance-matrix.json` resolves every entry in the canonical version matrix through a `defaultRecord` plus optional version-specific overrides. This keeps the matrix complete without copying 48 version names into another hand-maintained list.

Each version must eventually provide separate evidence for:

- verified Core artifact;
- Paper plugin load;
- bridge hello/heartbeat;
- loaded snapshot;
- saved/live source distinction;
- terrain PNG generation;
- verified tile cache reuse;
- real Tauri IPC;
- Map UI state;
- zoom and pan behavior;
- missing snapshot/failure safety;
- Paper shutdown;
- Java process exit;
- port `25565` release.

The initial default record is intentionally `blocked`. It records that real environments and artifacts have not been supplied for the complete version matrix. A `verified` row is invalid unless it includes a command, artifact identity, and result reference. Raw paths, tokens, authorization values, and raw HTTP bodies are rejected by the validator.

## Commands

```bash
bun run test:map:acceptance:evidence
node scripts/check-map-acceptance-evidence.mjs --require-complete
```

The first command validates the shape and reports unresolved records. The second is the final gate and must remain failing until every target version has real acceptance evidence. This is intentional: R47 cannot be marked complete from the current checkout merely because the ledger is present.

## Completion boundary

R47 is complete only when each version in `spec/map/coverage/version-matrix.json` has a verified override or verified default record backed by real Paper/Tauri evidence. A blocked entry remains blocked when the required server artifact, runtime, plugin, or hardware environment is unavailable; it is never silently converted to pass.

The current commit implements the evidence contract and its validator. It does not claim real Paper/Tauri acceptance has passed.

## Commit

```text
test: record real map renderer acceptance
```
