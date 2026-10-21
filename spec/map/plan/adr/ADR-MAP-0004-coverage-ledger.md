# ADR-MAP-0004: Source-to-evidence coverage ledger

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Use a Java AST inventory, call/data/reflection/resource dependency graph and complete resource enumeration. Track each declaration by stable identity including overload signature and source span. Link every required symbol/resource to Rust owner, version scope, fixture, Java reference trace, focused test and evidence record. `adapter-only` and `excluded` entries require caller and rationale.

## Consequences

Regex-derived 1,489 lexical rows and path-heuristic resource labels are not authoritative. Candidate inventory counts do not close the dependency graph. Newly discovered nodes receive phase documents, index entries and commit boundaries before code work begins.
