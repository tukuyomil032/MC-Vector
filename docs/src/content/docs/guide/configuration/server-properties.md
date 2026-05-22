---
title: Server Properties
description: Edit server.properties with a form-based UI directly inside MC-Vector.
sidebar:
  order: 2
---

The **Properties** tab provides a form-based editor for `server.properties` — no manual file editing required.

## Common Settings

### General

| Property | Description |
|----------|-------------|
| **MOTD** | Message shown in the Minecraft server list |
| **Spawn Protection** | Radius around spawn that non-operators cannot break (default: 16) |
| **OP Permission Level** | Permission level for operators (1–4, default: 4) |

### Gameplay

| Property | Description |
|----------|-------------|
| **Difficulty** | Peaceful / Easy / Normal / Hard |
| **Gamemode** | Survival / Creative / Adventure / Spectator |
| **PvP** | Enable or disable player vs. player combat |
| **Allow Flight** | Allow flying in survival mode (useful with movement plugins) |
| **Max Players** | Maximum number of simultaneous players |
| **Spawn Animals** | Allow passive animal spawning |
| **Spawn Monsters** | Allow hostile mob spawning |

### World

| Property | Description |
|----------|-------------|
| **Level Type** | World type: normal, flat, amplified, or large_biomes |
| **Level Seed** | World generation seed |
| **Generate Structures** | Enable or disable dungeon/village generation |
| **View Distance** | Server-side render distance (chunks, default: 10) |
| **Simulation Distance** | Active entity simulation distance (chunks) |

### Network

| Property | Description |
|----------|-------------|
| **Server Port** | TCP port the server listens on (default: 25565) |
| **Online Mode** | Enforce Mojang authentication (set `false` for offline/cracked mode) |
| **Max Packet Size** | Maximum size of network packets |

### Security

| Property | Description |
|----------|-------------|
| **Whitelist** | Restrict who can join (configure players in [Users](/guide/features/server-lifecycle)) |
| **Enable Command Block** | Allow command blocks to run commands |
| **Enforce Secure Chat** | Require signed chat messages (Minecraft 1.19.1+) |

## How to Edit

1. Navigate to the **Properties** tab.
2. Modify values using toggles, dropdowns, sliders, or text fields.
3. Click **"Save"** to write changes to `server.properties`.
4. **Restart the server** — most properties take effect only on restart.

:::tip
Some properties (like `max-players` and `whitelist`) can also be changed at runtime via console commands (`/maxplayers`, `/whitelist on`), but editing through Properties and restarting ensures persistence.
:::

## Advanced Properties

The **Advanced** tab within Properties exposes less common settings such as:

- `resource-pack` URL and SHA-1 hash
- `network-compression-threshold`
- `entity-broadcast-range-percentage`
- `enable-jmx-monitoring`

Edit these only if you know what they do — incorrect values can cause server instability.
