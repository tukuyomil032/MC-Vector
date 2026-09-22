# Dynmap Source Scope and Version

## Pinned source

MC-Vector uses only Dynmap v3.0 commit
`93b454efb8802dc7406d6873434f2aeec5c636f4` as the renderer reference. The
moving `v3.0` branch and later commits are not valid provenance for this
track.

The source-only snapshot in `src/map/dynmap/upstream/` contains the exact
files listed in `SOURCE-REF.md`. `scripts/verify-dynmap-source.mjs` checks the
revision, attribution, source paths, and SHA-256 values before R02 begins.

## In scope

- `HDPerspective`
- `IsoHDPerspective`
- `PatchDefinition`
- `HDBlockModels`
- `TexturePack`
- `HDShader`
- `HDLighting`
- `Matrix3D`
- the shader definitions required by the selected renderer path

These are implementation references for projection, ray traversal, patch
intersection, model/texture resolution, UV handling, shading, lighting, and
alpha compositing.

## Out of scope

Dynmap Bukkit lifecycle, Bukkit storage, web server, web UI, commands,
permissions, platform adapters, and configuration compatibility are not copied
into MC-Vector. The Paper plugin remains a snapshot provider and never embeds
the Dynmap renderer.

Minecraft client JARs, resource packs, and generated world data remain
user-owned runtime inputs. They are not part of this source boundary.

## Version boundary

The first supported fixture targets Paper and Minecraft `1.21.10`. That
runtime version is an MC-Vector compatibility target; it does not change the
Dynmap source revision or imply that Dynmap's old Bukkit adapter can run in
the target environment.
