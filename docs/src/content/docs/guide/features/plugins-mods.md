---
title: Plugins & Mods
description: Browse and install plugins and mods from Modrinth, Hangar, and SpigotMC.
sidebar:
  order: 3
---

The **Plugins / Mods** tab lets you search, preview, and install content from the three major Minecraft plugin and mod platforms — all without leaving MC-Vector.

## Supported Sources

| Source       | Best for                                              |
| ------------ | ----------------------------------------------------- |
| **Modrinth** | Fabric and Forge mods; Paper plugins                  |
| **Hangar**   | Paper and Velocity plugins (official Paper ecosystem) |
| **SpigotMC** | Bukkit, Spigot, and Paper plugins                     |

## Installing a Plugin or Mod

1. Navigate to the **Plugins / Mods** tab.
2. Select the source tab: **Modrinth**, **Hangar**, or **SpigotMC**.
3. Use the search bar to find what you need (e.g., "EssentialsX").
4. Click a result to view details — description, download count, and version compatibility.
5. Click **"Install"**.

MC-Vector downloads the JAR and places it directly into the server's `plugins/` or `mods/` folder. For Modrinth projects, required dependencies are resolved and downloaded automatically.

:::note[Installation target]
Plugins and mods are always installed into the **currently selected server**. Switch servers in the sidebar before installing if needed.
:::

## Sorting Results

Results can be sorted by:

- **Relevance** — search score (default)
- **Downloads** — most downloaded first
- **Name** — alphabetical
- **Compatibility** — Minecraft version match first

## Removing a Plugin or Mod

1. Switch to the **"Installed"** tab in the Plugins / Mods view.
2. Select the item to remove.
3. Click **"Delete"** and confirm.

The JAR file is deleted from the server folder. Restart the server for the change to take effect.

## Version Compatibility

Before installing, MC-Vector checks whether the plugin or mod supports the server's Minecraft version. Incompatible versions are highlighted so you can choose an appropriate release.

:::tip
Always restart the server after installing or removing plugins for the changes to load correctly.
:::
