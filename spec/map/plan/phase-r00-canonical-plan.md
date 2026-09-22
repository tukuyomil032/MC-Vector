# R00: Canonical Map Renderer Plan

## Purpose

Replace the short obsolete Map plan with the canonical source-, version-,
fixture-, and evidence-level plan under `spec/map`.

## Scope

Move useful attribution and source-boundary information without preserving the
old completion claims. Remove the old plan path and update the ADR index. Do
not alter unrelated ADRs or application behavior.

## Gate

```bash
test ! -d spec/map/phases/dynmap-reimplementation
test ! -d spec/dynmap
bun scripts/verify-dynmap-source.mjs
git diff --check
```

The retired directories must not exist in the working tree. The source
verifier must use the new attribution location.

## Completion

- canonical plan, phase index, coverage catalogs, ADRs, and evidence ledger
  exist;
- old phase/spec paths are absent;
- Apache-2.0 attribution remains available;
- no renderer implementation behavior changes in this phase;
- commit uses the exact message below.

```text
chore: replace obsolete map plans with canonical renderer plan
```
