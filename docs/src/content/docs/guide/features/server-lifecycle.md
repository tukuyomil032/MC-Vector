---
title: Server Lifecycle & Dashboard
description: Start, stop, and monitor your Minecraft server with the MC-Vector dashboard.
sidebar:
  order: 1
---

The **Dashboard** is the main control panel for each server. It shows real-time performance metrics and provides server lifecycle controls.

## Starting a Server

1. Select your server from the sidebar.
2. Click **"Start"** on the Dashboard.
3. MC-Vector launches the Java process with the configured JVM settings.
4. The status tile changes to **Running** (green) when the server is online.

:::caution[Java required]
A Java runtime must be assigned to the server before starting. If no Java is configured, go to **General Settings → Java Version** and select or download one.
:::

## Stopping a Server

Click **"Stop"** on the Dashboard. MC-Vector sends the `stop` command to the server's stdin, allowing a graceful shutdown.

:::tip
Always stop the server gracefully before closing MC-Vector or making changes to server files. Forced termination can cause world corruption.
:::

## Restarting a Server

Click **"Restart"** to stop and immediately start the server again. Useful after installing plugins or changing `server.properties`.

You can also restart via the **Command Palette** (`Cmd/Ctrl+K` → type "restart").

## Dashboard Metrics

The Dashboard displays live KPIs updated every 2 seconds:

| Tile         | Description                                            |
| ------------ | ------------------------------------------------------ |
| **Status**   | Running (green) / Stopped (gray)                       |
| **TPS**      | Ticks Per Second — 20 is ideal; below 18 indicates lag |
| **CPU**      | CPU usage of the Minecraft process                     |
| **Memory**   | RAM used vs. allocated (e.g., 1.2 GB / 4 GB)           |
| **Software** | Server type and Minecraft version (e.g., Paper 1.21.1) |
| **Uptime**   | Time elapsed since last start                          |

## Real-Time Charts

The Dashboard also shows three 60-second rolling charts:

- **CPU Chart** — CPU usage trend
- **Memory Chart** — RAM usage trend
- **TPS Chart** — Server tick rate trend

Use TPS as the primary health indicator:

| TPS range | Meaning                                                                 |
| --------- | ----------------------------------------------------------------------- |
| 18–20     | Healthy — no action needed                                              |
| 15–17     | Minor lag — check for heavy plugins or large farms                      |
| Below 15  | Significant lag — reduce view distance, restart, or investigate plugins |

## Version Upgrade Wizard

When a new version of the server software is available, an **"Upgrade to Latest"** button appears on the Dashboard.

The wizard automatically:

1. **Checks** the current version against the latest release
2. **Creates a full backup** before any changes
3. **Downloads** the new server JAR
4. **Replaces** the old JAR with the new one

The server must be **stopped** before running the wizard. Start it again after the wizard completes.
