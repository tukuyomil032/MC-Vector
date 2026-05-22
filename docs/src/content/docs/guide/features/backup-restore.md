---
title: Backup & Restore
description: Create full or differential server backups and restore them when needed.
sidebar:
  order: 4
---

The **Backups** tab lets you snapshot your server and restore it to any saved state.

## Backup Types

| Type | Description |
|------|-------------|
| **Full** | Archives the entire server directory (all worlds, configs, plugins) |
| **Differential** | Archives only files changed since the last backup — faster and smaller |

Use differential backups for frequent snapshots and full backups before major changes (version upgrades, large plugin installs).

## Backup Storage Location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/MC-Vector/servers/<name>/backups/` |
| Windows | `%APPDATA%\MC-Vector\servers\<name>\backups\` |
| Linux | `~/.local/share/MC-Vector/servers/<name>/backups/` |

## Creating a Backup

1. Navigate to the **Backups** tab.
2. Click **"Create Backup"**.
3. Choose:
   - **Mode** — Full or Differential
   - **Compression** — Fast / Normal / Best
   - **Name** — custom file name (optional)
   - **Included paths** — select specific subdirectories (worlds, plugins, configs)
4. Optionally add a **tag** and **notes** for identification.
5. Click **"Create"** — progress is shown in real-time.

## Restoring a Backup

:::caution[Stop the server first]
Always stop the server before restoring a backup. Restoring while the server is running can cause world corruption.
:::

1. Select a backup from the list.
2. Click **"Restore"**.
3. Confirm — the server directory is overwritten with the backup contents.
4. Start the server.

## Deleting Backups

1. Select a backup from the list.
2. Click **"Delete"** and confirm.

## Automatic Backups

Automatic backups can be configured in [General Settings](/guide/configuration/general-settings#automatic-backups). Options include:

- **Interval** — every N minutes
- **Daily** — once per day at a specific time (HH:MM)
- **Weekly** — once per week on a specific day and time

A **retention policy** controls how many backups are kept automatically: by count limit or by age (days).
