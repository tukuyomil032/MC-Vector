# License, Assets, and Attribution

## Dynmap source

Dynmap v3.0 is distributed under Apache License 2.0. Selected renderer logic
may be ported or translated, but every derived unit must be recorded in
`porting-manifest.md` with its immutable source reference and attribution.

The final distribution must include:

- the Apache License 2.0 text;
- a Dynmap-derived code notice;
- source paths and commits for translated code;
- MC-Vector modifications;
- a review record for each ported component.

DynmapCore, platform adapters, web server, commands, and marker code are not
runtime dependencies. Product-specific Java lifecycle and Tauri integration
remain MC-Vector code.

## Minecraft assets

Minecraft client assets are separate from Dynmap source code. MC-Vector does
not unconditionally redistribute Mojang/Microsoft textures or models.

The supported input order is:

1. explicitly selected server resource pack;
2. explicitly selected client JAR or resource pack;
3. detected local 1.21.x client JAR;
4. explicit degraded fallback.

The asset manifest records source path, Minecraft version, SHA-256 identity,
pack stack order, loader version, resolved states, unresolved states, and
quality. The UI distinguishes `asset_missing`, `asset_invalid`, and
`fallback` from a world with no generated chunks.

Any server resource-pack download requires explicit user approval. It is not a
silent background acquisition step.

## Release gate

Before distributing a build containing translated Dynmap code or a bundled
asset, the license and asset review must confirm that the NOTICE, source
provenance, and Minecraft usage policy are satisfied.
