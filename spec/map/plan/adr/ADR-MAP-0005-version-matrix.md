# ADR-MAP-0005: Exact Minecraft release support

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

The target is every exact Minecraft Java release in the maintained 1.14–26.3 matrix, baseline 48 entries. Each exact release owns five independent stages: assets, Anvil, Paper snapshot, Java reference/pixel parity and real acceptance. No family representative or neighboring patch substitutes for an exact release.

## Consequences

Official manifest membership is refreshed in the version-lock phase. Client/server/asset/Paper artifacts are identified by exact URL, version, declared size and cryptographic digest. Unavailable official or Paper artifacts remain blocked and cannot be silently excluded from the target. New releases in range expand the matrix and five-stage set.
