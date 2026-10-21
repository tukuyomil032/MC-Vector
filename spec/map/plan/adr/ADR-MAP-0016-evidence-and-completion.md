# ADR-MAP-0016: Evidence classes and completion claim

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Plan, implementation, automated tests, Java reference, fixed fixtures, Paper smoke, real Tauri, manual UI, server stop, process exit and port release are distinct evidence classes. Each record includes exact version/source identity, artifact/input digest, command or observation, timestamp, commit and result. Goal completion is fail-closed against every required row.

## Consequences

No build, mock, single fixture, representative version, bridge-connected badge, visual screenshot alone, or plan-file count proves complete reproduction. Any required row still planned, running, failed, blocked, unverified or without evidence means Goal incomplete. Unsupported entries are only permitted where an ADR explicitly sets them outside the agreed renderer/use-case boundary.
