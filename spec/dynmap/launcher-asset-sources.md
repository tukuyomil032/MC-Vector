# Launcher Asset Sources

This document records source-backed launcher layouts used by MC-Vector. It is
not a list of guessed directories. Each adapter must be based on launcher
metadata, source code, official documentation, or a real launch argument log.

## Evidence policy

- source code and official documentation are primary evidence;
- GitHub issue launch logs are runtime evidence for argument and path shape;
- a default path is only a discovery hint, never the authoritative path when a
  launcher supports a custom root;
- the authoritative game directory is the launcher's resolved `--gameDir` (or
  equivalent metadata), and shared libraries/assets are resolved separately;
- selected assets are not usable until blockstates, models, and textures are
  parsed and the manifest is connected to the renderer.

## Confirmed layouts

### PrismLauncher

PrismLauncher source separates `gameRoot`, local libraries, shared libraries,
and the current `versions` directory. The instance version comes from
`mmc-pack.json`; the client JAR commonly lives under:

```text
<prism-root>/libraries/com/mojang/minecraft/<version>/minecraft-<version>-client.jar
```

The instance game root contains `resourcepacks`, `saves`, and other mutable
world files. The implementation and runtime evidence are:

- [MinecraftInstance.cpp](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/minecraft/MinecraftInstance.cpp)
- [Prism runtime log](https://github.com/PrismLauncher/PrismLauncher/issues/2870)
- [Prism data-location discussion](https://github.com/orgs/PrismLauncher/discussions/3522)

The macOS user fixture for this project is:

```text
/Users/hosiyomi322/Library/Application Support/PrismLauncher/
```

### MultiMC

The documented layout uses `instances/<id>/minecraft/` for the game root,
instance `version.json`, and root-level `libraries/` and `assets/`.

- [MultiMC Folder Structure](https://github.com/MultiMC/Launcher/wiki/Folder-Structure)

### Modrinth App

The app directory is configurable. Runtime logs show profile game roots and
shared metadata paths such as:

```text
<app-root>/profiles/<profile>
<app-root>/meta/assets
<app-root>/meta/libraries
```

- [Modrinth storage location](https://support.modrinth.com/en/articles/8797641-modrinth-app-storage-folder-location)
- [Modrinth launch log](https://github.com/modrinth/code/issues/6643)

### CurseForge

The modding folder is configurable. Its Minecraft data normally contains an
`Instances` directory, but the configured modding folder and the instance's
resolved game directory are authoritative.

- [CurseForge Getting Started](https://support.curseforge.com/support/solutions/articles/9000218572-getting-started)
- [CurseForge modding-folder migration](https://support.curseforge.com/support/solutions/articles/9000238895-how-to-move-your-minecraft-modding-folder)

### GDLauncher Carbon

Carbon has a configurable Runtime Path. The documented default is
`gdlauncher_carbon/data`, which contains instances and shared runtime data. The
legacy `gdlauncher_next` layout must not be treated as Carbon's layout.

- [GDLauncher troubleshooting](https://gdlauncher.com/docs/troubleshooting/)
- [GDLauncher backup guide](https://gdlauncher.com/guides/backup-gdlauncher-data/)
- [GDLauncher Carbon source](https://github.com/gorilla-devs/GDLauncher-Carbon)

### ATLauncher

ATLauncher resolves a launcher working directory and launches with explicit
`--gameDir` and `--assetsDir` arguments. The launcher source exposes the
working-directory option, and runtime logs show instances, assets, and
libraries under the resolved launcher user directory.

- [ATLauncher source](https://github.com/ATLauncher/ATLauncher)
- [ATLauncher working-directory code](https://github.com/ATLauncher/ATLauncher/blob/master/src/main/java/com/atlauncher/App.java)
- [ATLauncher launch log](https://github.com/ATLauncher/ATLauncher/issues/989)

## Adapter contract

Every adapter resolves an `AssetRuntimeLayout` containing launcher root,
instance root, game directory, Minecraft version, client JAR, library root,
asset root/index, resource-pack stack, and metadata provenance. The resolver
must support explicit paths and custom roots without recursive scanning of a
user's entire home directory.

## Required fixtures

Each adapter needs standard, custom-root, missing-client, malformed-metadata,
version-mismatch, and multi-instance fixtures. PrismLauncher additionally
requires the shared-library fixture matching the macOS path above.

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
