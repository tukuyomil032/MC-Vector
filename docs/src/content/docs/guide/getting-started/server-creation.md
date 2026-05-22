---
title: Create Your First Server
description: Create a new Minecraft server or import an existing one using MC-Vector.
sidebar:
  order: 2
---

## Create a New Server

1. Click the **"+ Add Server"** button in the sidebar.
2. Choose **"Create New Server"** from the dialog.
3. Configure the server settings:

| Setting | Description |
|---------|-------------|
| **Server Name** | Display name shown in MC-Vector (e.g., "Survival Server") |
| **Software** | Vanilla, Paper, Spigot, Fabric, or Forge |
| **Version** | Minecraft version (e.g., 1.21.1) |
| **Port** | Listening port (default: 25565) |
| **Memory** | RAM allocation for the JVM (e.g., 2 GB) |

4. Click **"Create"** — MC-Vector downloads the server JAR and sets up the directory structure.
5. Wait for setup to complete. When done, the server is ready to start from the Dashboard.

:::tip[Choosing server software]
- **Paper** — recommended for most servers; great plugin support and performance optimizations
- **Fabric** — recommended for mod packs (client + server mods)
- **Vanilla** — no plugin support, pure Mojang experience
:::

## Import an Existing Server

If you already have a Minecraft server folder on disk:

1. Click **"+ Add Server"** → **"Import Existing Server"**.
2. Select the folder that contains your existing server files (the folder with `server.jar` and `server.properties`).
3. MC-Vector auto-detects the server name, software, and version.
4. Review the detected settings — edit if needed.
5. Click **"Import"**.

:::note
MC-Vector checks the `eula.txt` and warns you if the EULA has not been accepted. Minecraft requires accepting the EULA before the server can start.
:::

## What Happens Next

After creation, MC-Vector sets up the following directory under the app data folder:

| Platform | Server data path |
|----------|-----------------|
| macOS | `~/Library/Application Support/MC-Vector/servers/<name>/` |
| Windows | `%APPDATA%\MC-Vector\servers\<name>\` |
| Linux | `~/.local/share/MC-Vector/servers/<name>/` |

Select your server in the sidebar to open the [Dashboard](/guide/features/server-lifecycle) and start it.
