# ADR-MAP-0004: Version Adapter Boundary

Minecraft version differences are handled by version profiles and source
adapters. Version-specific branches must not be scattered through the common
renderer algorithm. Each exact version has a manifest entry and its own Anvil,
asset, Paper snapshot, and renderer evidence.
