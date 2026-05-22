# MC-Vector User Guide

Complete guide to using MC-Vector for Minecraft server management.

**Guide target version:** `2.0.55`

## Table of Contents

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Creating Your First Server](#creating-your-first-server)
  - [Importing an Existing Server](#importing-an-existing-server)
- [Server Management Features](#server-management-features)
  - [Dashboard](#dashboard)
  - [Console](#console)
  - [Users](#users)
  - [Files](#files)
  - [Plugins / Mods](#plugins--mods)
  - [Backups](#backups)
  - [Properties](#properties)
  - [General Settings](#general-settings)
  - [Proxy Network](#proxy-network)
- [Application Features](#application-features)
  - [Command Palette](#command-palette)
  - [Java Manager](#java-manager)
  - [Version Upgrade Wizard](#version-upgrade-wizard)
  - [App Update](#app-update)
- [Tips and Tricks](#tips-and-tricks)

---

<!-- Starlight page: guide/getting-started/installation.md -->

## Getting Started

MC-Vector is a desktop application that makes managing Minecraft servers easy and intuitive. Whether you're running a small server for friends or managing multiple server instances, MC-Vector provides all the tools you need.

### Installation

1. Download the latest release from the [Releases page](https://github.com/tukuyomil032/MC-Vector/releases)
2. Install the application:
   - **macOS:** Open the `.dmg` file and drag MC-Vector to Applications
   - **Windows:** Run the `.exe` installer
   - **Linux:** Install the `.AppImage`, `.deb`, or `.rpm` package
3. Launch MC-Vector

---

<!-- Starlight page: guide/getting-started/server-creation.md -->

## Creating Your First Server

Follow these steps to create your first Minecraft server:

### Step 1: Launch the Application

Open MC-Vector. You'll see the main interface with a server list (empty if this is your first time).

### Step 2: Add a New Server

1. Click the **"+ Add Server"** button in the sidebar
2. Choose **"Create New Server"** from the dialog

### Step 3: Configure Server Settings

Fill in the following settings:

- **Server Name:** Choose a name for your server (e.g., "Survival Server")
- **Software:** Select the server software
  - Vanilla
  - Paper
  - Spigot
  - Fabric
  - Forge
- **Version:** Choose the Minecraft version (e.g., 1.21.1)
- **Port:** Set the server port (default: 25565)
- **Memory Usage:** Allocate RAM for the server (e.g., 2GB, 4GB)

### Step 4: Create the Server

1. Click the **"Create"** button
2. MC-Vector downloads the server software and sets up the directory structure
3. Wait for the setup to complete

**That's it!** Your server is created and ready to start.

---

### Importing an Existing Server

If you have an existing Minecraft server folder, you can import it into MC-Vector:

1. Click **"+ Add Server"** → choose **"Import Existing Server"**
2. Select the folder containing your server files
3. MC-Vector auto-detects the server name, version, and software
4. Review the detected settings (you can edit them if needed)
5. Click **"Import"**

> **Note:** MC-Vector reads the EULA status and warns you if it has not been accepted yet.

---

<!-- Starlight page: guide/features/server-lifecycle.md -->

## Server Management Features

Once your server is created, select it from the sidebar to manage it.

---

<!-- Starlight page: guide/features/dashboard.md -->

### Dashboard

The Dashboard provides a real-time at-a-glance view of your server's health and performance.

**KPI Tiles:**

| Tile         | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| **Status**   | Running / Stopped (color-coded: green / gray)                |
| **TPS**      | Ticks Per Second — server performance indicator (20 = ideal) |
| **CPU**      | Current CPU usage of the Minecraft process                   |
| **Memory**   | Current RAM usage (used / allocated)                         |
| **Software** | Server software and version (e.g., Paper 1.21.1)             |
| **Uptime**   | Time elapsed since the server started                        |

**Real-Time Charts (60-second window):**

- **CPU Chart** — CPU usage trend over the last 60 seconds
- **Memory Chart** — Memory usage trend over the last 60 seconds
- **TPS Chart** — Server tick rate trend over the last 60 seconds

**How to Use:**

- Select your server from the sidebar to view its dashboard
- Charts update every 2 seconds automatically
- Use TPS as a quick health signal: below 18 TPS indicates performance issues

---

<!-- Starlight page: guide/features/console-logs.md -->

### Console

The Console is the command center for your server.

**Features:**

- **Server Address:** View the server IP and port
- **Status Indicator:** Online (green) / Offline (gray)
- **Memory Usage:** Current RAM usage summary
- **Live Logs:** Streamed server output with ANSI color support
- **Command Input:** Execute server commands with operator privileges

**How to Use:**

1. Select your server from the sidebar
2. Navigate to the **Console** tab
3. View server logs as they stream in real-time
4. Type a command in the input field at the bottom
5. Press **Enter** or click **"Send"** to execute

**Example Commands:**

```
say Hello, world!
op PlayerName
gamemode creative PlayerName
time set day
weather clear
```

> **Note:** Do not prefix commands with `/` in the console input — the server console uses bare commands.

---

<!-- Starlight page: guide/features/players.md -->

### Users

The Users tab lets you manage player permissions and access control.

**Features:**

- **Whitelist Management:** Control who can join your server
- **Operator Privileges:** Grant / revoke admin access
- **Ban Management:** Ban players by username
- **IP Ban Management:** Ban players by IP address

**How Usernames Are Resolved:**

When you enter a player's username, MC-Vector automatically fetches the player's UUID from the Mojang API. The player's avatar is also displayed using their skin.

#### Add to Whitelist

1. Navigate to **Users** → **Whitelist** card
2. Enter the player's username
3. Click **"Add"** — UUID is resolved automatically

#### Grant Operator Privileges

1. Select **"Operators"** card
2. Enter the player's username
3. Click **"Add"**

#### Ban a Player

1. Select **"Banned Players"** card
2. Enter the player's username
3. Enter a reason (optional)
4. Click **"Ban"**

#### Ban an IP Address

1. Select **"Banned IPs"** card
2. Enter the IP address
3. Click **"Ban"**

---

<!-- Starlight page: guide/features/file-manager.md -->

### Files

The Files tab provides a full-featured file manager for your server directory.

**Features:**

- Browse the server directory with a breadcrumb navigation bar
- Create new files and folders
- Edit files with the built-in **Monaco Editor** (syntax highlighting for JSON, YAML, TOML, properties, and more)
- View file diffs side-by-side
- Upload files via drag-and-drop or the upload button
- Rename, move, compress, and extract files via the right-click context menu
- Delete files and folders

**How to Use:**

#### Create a New Folder

1. Navigate to the **Files** tab
2. Click the **"+"** button and select **"New Folder"**
3. Enter a folder name and click **"Create"**

#### Create a New File

1. Click the **"+"** button and select **"New File"**
2. Enter a file name and click **"Create"**
3. The file opens in Monaco Editor automatically

#### Edit a File

1. Click any file to open it in Monaco Editor
2. Edit the content
3. Click **"Save"** (or press `Ctrl/Cmd+S`)

#### Upload Files

- **Drag and drop** files from your OS file manager into the Files view
- Or click the **upload** button and select files

#### Compress / Extract

1. Right-click a file or folder
2. Select **"Compress"** to create a ZIP archive
3. Select **"Extract"** to unpack an existing archive

---

<!-- Starlight page: guide/features/plugins-mods.md -->

### Plugins / Mods

The Plugins / Mods tab lets you browse and install plugins and mods from popular sources.

**Supported Sources:**

| Source       | For                                            |
| ------------ | ---------------------------------------------- |
| **Modrinth** | Plugins (Paper/Spigot) and Mods (Fabric/Forge) |
| **Hangar**   | Paper and Velocity plugins                     |
| **SpigotMC** | Spigot/Paper plugins                           |

**Features:**

- Search by name or filter by category
- View plugin/mod details, downloads, and descriptions
- Install with one click (JAR downloaded directly to the `plugins/` or `mods/` folder)
- Remove installed plugins/mods

**How to Use:**

#### Install a Plugin/Mod

1. Navigate to the **Plugins / Mods** tab
2. Use the search bar to find a plugin/mod (e.g., "EssentialsX")
3. Select the source tab (Modrinth / Hangar / SpigotMC)
4. Click on the plugin/mod to view details
5. Click **"Install"** — the file is downloaded and placed in the correct folder

> **Note:** Installation targets the currently selected server. Switch servers in the sidebar before installing.

#### Remove a Plugin/Mod

1. Switch to the **"Installed"** tab in the Plugins / Mods view
2. Select the plugin/mod to remove
3. Click **"Delete"** and confirm

---

<!-- Starlight page: guide/features/backup-restore.md -->

### Backups

The Backups tab lets you create and restore server snapshots.

**Backup Types:**

- **Full Backup:** Archives the entire server directory (all worlds, configs, plugins)
- **Differential Backup:** Archives only files changed since the last backup (faster, smaller)

**Backup Features:**

- Choose compression level (Fast / Normal / Best)
- Select specific subdirectories to include or exclude
- Add a custom tag and notes to each backup for easy identification
- Virtual scrolling for large backup lists with size and date display

**Backup Storage Location:**

| Platform | Path                                                              |
| -------- | ----------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/MC-Vector/servers/<name>/backups/` |
| Windows  | `%APPDATA%\MC-Vector\servers\<name>\backups\`                     |
| Linux    | `~/.local/share/MC-Vector/servers/<name>/backups/`                |

**How to Use:**

#### Create a Backup

1. Navigate to the **Backups** tab
2. Click **"Create Backup"**
3. Choose backup mode (Full / Differential), compression level, and file name
4. Optionally add a tag and notes
5. Click **"Create"** — progress is shown in real-time

#### Restore a Backup

1. Select a backup from the list
2. Click **"Restore"**
3. Confirm — the server directory is overwritten with the backup contents

> **Important:** Stop the server before restoring a backup.

#### Delete Outdated Backups

1. Select a backup from the list
2. Click **"Delete"** and confirm

---

<!-- Starlight page: guide/configuration/server-properties.md -->

### Properties

The Properties tab gives you a form-based editor for `server.properties`.

**Common Settings:**

| Setting          | Description                                        |
| ---------------- | -------------------------------------------------- |
| **Difficulty**   | Peaceful / Easy / Normal / Hard                    |
| **Gamemode**     | Survival / Creative / Adventure / Spectator        |
| **Max Players**  | Maximum concurrent players                         |
| **PvP**          | Enable / disable player vs. player combat          |
| **Allow Flight** | Allow flight in survival mode                      |
| **Whitelist**    | Enforce whitelist on join                          |
| **Online Mode**  | Mojang authentication (set false for offline mode) |
| **MOTD**         | Message shown in the server list                   |

**How to Use:**

1. Navigate to the **Properties** tab
2. Modify settings using toggles, dropdowns, and text fields
3. Click **"Save"** to write changes to `server.properties`
4. Restart the server for changes to take effect

---

<!-- Starlight page: guide/configuration/general-settings.md -->

### General Settings

The General Settings tab configures server-level settings that can be changed after creation.

**Configurable Options:**

- **Server Name:** Rename the server in MC-Vector
- **Software:** Switch server software (e.g., Vanilla → Paper)
- **Version:** Change the Minecraft version
- **Memory Usage:** Adjust RAM allocation
- **Port Number:** Change the listening port
- **Java Version:** Select the Java runtime (managed by [Java Manager](#java-manager))
- **JVM Extra Args:** Add custom JVM flags (validated before saving)
- **Ngrok Integration:** Enable/disable the port-forwarding tunnel

**How to Use:**

1. Navigate to the **General Settings** tab
2. Modify the desired settings
3. Click **"Save"**

#### Port Forwarding Elimination (Ngrok Integration)

MC-Vector can automatically open a public TCP tunnel using Ngrok, removing the need for router port forwarding.

1. Enable **"Port Forwarding Elimination"** in General Settings
2. MC-Vector downloads Ngrok if not already installed
3. A public address is generated (e.g., `tcp://0.tcp.ngrok.io:XXXXX`)
4. Share this address with friends — they connect using `0.tcp.ngrok.io XXXXX` in the Minecraft client

> Click **"Connection Guide"** in the UI for illustrated setup instructions.

---

<!-- Starlight page: guide/network/velocity.md -->

### Proxy Network

The Proxy Network tab helps you set up a proxy server (Velocity or BungeeCord) to link multiple backend servers.

**Use Cases:**

- Hub + game server architecture
- Multiple game modes (survival, creative, minigames) under one address
- Load balancing across backend instances

**How to Use:**

1. Navigate to the **Proxy Network** tab
2. Click **"See Detailed Setup Guide"**
3. Follow the step-by-step wizard to:
   - Create a proxy server instance
   - Connect backend servers
   - Configure forwarding mode (modern / legacy / BungeeGuard)

---

<!-- Starlight page: application features -->

## Application Features

---

### Command Palette

The Command Palette provides keyboard-driven navigation and server control.

**How to Open:**

- Press **`Cmd+K`** (macOS) or **`Ctrl+K`** (Windows/Linux)

**Available Commands:**

| Category             | Command                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| **Navigate**         | Dashboard, Console, Users, Files, Plugins, Backups, Properties, Settings |
| **Server (Online)**  | Stop Server, Restart Server                                              |
| **Server (Offline)** | Start Server                                                             |

**How to Use:**

1. Press `Cmd/Ctrl+K`
2. Type to filter commands (e.g., "start", "backup")
3. Use arrow keys to navigate, press Enter to execute

---

### Java Manager

The Java Manager lets you download and manage Java runtimes used by your servers.

**Supported Versions:**

- Java 8 (for older Minecraft versions ≤ 1.16)
- Java 17 (for Minecraft 1.17–1.20)
- Java 21 (for Minecraft 1.21+)

**How to Open:**

- Click the Java icon in the sidebar footer, or
- Navigate to **General Settings** → **Java Version** → **"Manage Java"**

**How to Use:**

#### Download a Java Version

1. Open the Java Manager
2. Click **"Download"** next to the desired version
3. Progress is shown in real-time — the binary is extracted automatically

#### Delete a Java Version

1. Open the Java Manager
2. Click **"Delete"** on an installed version

> Deleting a version used by a running server will not stop the server, but starting it again will fail until a valid Java version is assigned in General Settings.

---

### Version Upgrade Wizard

The Version Upgrade Wizard automates upgrading your server software to the latest version.

**Steps performed automatically:**

1. **Check** — Compares the current version against the latest available release
2. **Backup** — Creates a full backup before upgrading (progress shown)
3. **Download** — Downloads the new server JAR
4. **Complete** — Replaces the old JAR; server is ready to start

**Prerequisites:**

- The server must be **stopped** before starting the wizard
- An active internet connection is required

**How to Use:**

1. Navigate to **General Settings** or **Dashboard**
2. Click **"Upgrade to Latest"** (visible when a new version is available)
3. Review the current vs. latest version comparison
4. Click **"Start Upgrade"** — the wizard runs all steps automatically
5. Start the server when the wizard reports completion

---

### App Update

MC-Vector checks for application updates automatically on launch.

**Update Flow:**

1. When a new version is available, a banner appears in the UI
2. Click **"Update"** to open the App Update modal
3. Review the release notes
4. Click **"Download"** — progress is shown
5. Click **"Install & Restart"** to apply the update

> Updates are downloaded from the [GitHub Releases page](https://github.com/tukuyomil032/MC-Vector/releases) and verified before installation.

---

<!-- Starlight page: guide/troubleshooting/common-errors.md -->

## Tips and Tricks

### Keep Your Server Updated

Regularly check for updates to:

- MC-Vector application (App Update modal)
- Minecraft server software (Version Upgrade Wizard)
- Plugins and mods

### Monitor Performance

Use the Dashboard to watch:

- **TPS** — below 18 indicates the server is overloaded; consider reducing view distance or removing heavy plugins
- **CPU** — consistently high usage may require hardware upgrades or server optimization
- **Memory** — if usage approaches the allocation ceiling, increase RAM in General Settings

### Regular Backups

Create backups before:

- Updating Minecraft version
- Installing or removing plugins/mods
- Making major `server.properties` changes

Use **differential backups** for frequent snapshots to save disk space.

### Security Best Practices

- Enable whitelist for private servers
- Do not grant operator privileges to untrusted players
- Keep `online-mode=true` to prevent cracked client connections

---

## Need Help?

- Check the [Development Guide](./development-guide.md) if you're a developer
- Visit the [GitHub Issues](https://github.com/tukuyomil032/MC-Vector/issues) page to report bugs
- Read [CONTRIBUTING.md](../CONTRIBUTING.md) if you want to contribute
