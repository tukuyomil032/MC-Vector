# ADR-011: Selected Dynmap Source Reuse

- Status: Accepted with release review required
- Date: 2026-09-18

## Context

The user authorized source reuse where needed, and Dynmap's renderer contains
substantial math/model/shader behavior that should not be re-guessed.

## Decision

Use Dynmap v3.0 commit `93b454efb8802dc7406d6873434f2aeec5c636f4` as the source
anchor. Copy or translate only platform-neutral renderer logic. Track every
file/symbol and preserve Apache attribution in the porting manifest. Do not
copy lifecycle, Bukkit adapters, web server, web UI, commands, or storage.

## Consequences

Source-derived code needs SPDX/origin metadata, NOTICE, license review, and
golden fixtures. Dynmap is not a runtime dependency or endorsement.
