# Launcher Asset Sources

## Input policy

MC-Vector accepts a user-selected client JAR, game directory, or resource-pack
stack. Automatic discovery is convenience only and must not make the app
silently copy or redistribute Minecraft assets.

## Discovery order

```text
explicit client JAR
explicit game directory
PrismLauncher instance
official Launcher versions directory
MultiMC-compatible instances
Modrinth App profiles
CurseForge instances
GDLauncher instances
ATLauncher instances
manual file picker
```

Each adapter returns candidates, not an already trusted path. Rust validates
canonical containment, file type, readable size, Minecraft version metadata,
and SHA-256 before use.

For a usable game instance, the selected source is represented as an ordered
stack: the client JAR is the base layer, followed by discovered resource-pack
archives/directories. Later entries override matching `assets/` entries before
blockstate, model, texture, animation metadata, and colormap resolution. The
stack identity is composed from every layer identity, so changing a pack
invalidates Map tiles instead of reusing a client-only cache.

## Manifest identity

```text
launcher
launcherRoot
instanceId
gameDirectory
clientJarPath
resourcePackPaths
minecraftVersion
sourceHash
packStackOrder
blockstateCount
modelCount
textureCount
unresolvedBlockstateCount
quality
```

The UI distinguishes `auto_detected`, `user_selected`, `missing`,
`version_mismatch`, `invalid`, and `fallback`. A user may override an
auto-detected candidate.

## Open compatibility work

Launcher layouts vary by OS, custom roots, portable instances, and symlinks.
Fixtures must cover standard/custom PrismLauncher roots, official Launcher,
manual selection, invalid archives, path traversal, and version mismatch. The
current discovery fallback lists resource-pack directory entries in stable
path order; reading each launcher's active-pack order from its native options
file remains open work.
