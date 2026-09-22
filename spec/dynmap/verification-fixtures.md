# Dynmap Differential Fixture Contract

The fixed fixture inventory lives in `tests/fixtures/dynmap/manifest.json`.
It is committed input metadata, not a test-output directory. Test execution
must never create or replace a golden file.

The inventory covers flat terrain, mountain/cliff, water, forest/leaves, snow,
stairs, slabs, fences, doors, glass, chunk boundaries, missing textures,
malformed chunks, unloaded chunks, and custom resource-pack overrides.

Each case is tied to the pinned Dynmap revision
`93b454efb8802dc7406d6873434f2aeec5c636f4` and a source symbol. The current
Rust gate records fixed contract vectors and a deterministic flat PNG digest.
The `referenceStatus` deliberately records that a runnable Java Dynmap capture
has not yet been attached. Until that capture exists, this is not evidence of
full pixel parity; it is the guardrail that prevents self-generated goldens
from being mistaken for parity evidence.

The strict external-reference gate is:

```bash
bun scripts/run-dynmap-differential.mjs --strict-reference
```

It must remain failing until every case has a committed Dynmap reference
capture and the corresponding ray/face/UV/light/alpha/pixel comparisons.
