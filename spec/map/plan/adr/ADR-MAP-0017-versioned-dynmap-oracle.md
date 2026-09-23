# ADR-MAP-0017: Version-specific Dynmap oracle selection

## Status

Accepted for planning. No Minecraft release is declared renderer-supported by this ADR alone.

## Context

The renderer behavior baseline is Dynmap v3.0 revision `93b454efb8802dc7406d6873434f2aeec5c636f4`. Minecraft's block registry, block-state properties, assets, chunk schema and runtime requirements continue to change after that source revision. A fixed renderer source revision cannot be presumed to contain the data mappings or host adapter needed by every later release.

Minecraft 26.1 is a concrete audit case: Mojang's release notes document world-storage/data-format changes, a rewritten lightmap algorithm, new block/texture data, alpha-cutout changes and block-state rendering changes. The official Dynmap v3.0 activity records the pinned baseline in March 2026, before the March 24, 2026 Minecraft 26.1 release. Later Dynmap support work also reports new block mappings and state/property changes. These are investigation leads; exact artifact and source evidence remains required.

## Decision

1. Keep `93b454efb8802dc7406d6873434f2aeec5c636f4` as the common behavior baseline for the reimplementation.
2. Select an exact Dynmap source revision/module/build for every target Minecraft release. The same revision/build may be reused across releases only when each release independently proves that its registry/state mappings, renderer registration/behavior, exact assets, and reference build cover that release. Selection evidence must identify those concrete inputs; README support claims and version names alone do not qualify. This rule does not require artificial per-patch Rust code duplication.
3. When the selected source differs from the baseline, inventory every renderer-relevant Java symbol and resource change from the baseline, map each to a Rust owner, and preserve both source revisions and their hashes. Do not silently move the global baseline or discard version-specific upstream behavior.
4. Bind each release's official client/server artifact digests and concrete block/state/model/texture/light and Anvil differences to fixtures and the selected Java oracle. Paper compatibility remains a separate axis.
5. If no exact-version-compatible Dynmap oracle can be built or its relevant renderer inputs cannot be accounted for, mark that release `unsupported` or `blocked`; never infer parity from a newer/older version, bridge connectivity, release metadata or a generated phase page. The overall complete-reimplementation gate remains closed until the support gap is actually resolved and evidenced.

## Consequences

- [`version-delta-matrix.json`](../../coverage/version-delta-matrix.json) carries a per-release `dynmapOracle` report in addition to assets, Anvil, Paper and pixel parity.
- Version reference-and-parity phases use the exact source revision selected by that report rather than assuming the baseline source handles every release.
- Renderer-relevant source deltas discovered during version audits extend the source-symbol/resource catalog and add implementation phases before Rust work begins.
- A no-diff report is allowed only when exact input/source fingerprints and source-level compatibility evidence are present.

## Evidence sources

- [Minecraft Java Edition 26.1 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1)
- [Dynmap v3.0 branch activity](https://github.com/webbukkit/dynmap/activity)
- [Dynmap PR #4271: Minecraft 26.2 support work and block-mapping findings](https://github.com/webbukkit/dynmap/pull/4271)
