# MC-Vector User Guide

Complete guide to using MC-Vector for Minecraft server management.

## Table of Contents

- [Getting Started](#getting-started)
- [Creating Your First Server](#creating-your-first-server)
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

---

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

## Creating Your First Server

Follow these steps to create your first Minecraft server:

### Step 1: Launch the Application

Open MC-Vector. You'll see the main interface with a server list (empty if this is your first time).

### Step 2: Add a New Server

1. Click the **"+ Add Server"** button
2. The server creation modal will open

### Step 3: Configure Server Settings

Fill in the following settings:

- **Server Name:** Choose a name for your server (e.g., "Survival Server")
- **Software:** Select the server software
  - Vanilla
  - Paper
  - Spigot
  - Fabric
  - Forge
- **Version:** Choose the Minecraft version (e.g., 1.20.1)
- **Port:** Set the server port (default: 25565)
- **Memory Usage:** Allocate RAM for the server (e.g., 2GB, 4GB)

### Step 4: Create the Server

1. Click the **"Create"** button
2. MC-Vector will download the server software and set up your server
3. Wait for the setup to complete

**That's it!** Your server is now created and ready to start.

---

## Server Management Features

Once your server is created, you can manage it using the following features:

### Dashboard

The Dashboard provides an at-a-glance view of your server's status.

**What You'll See:**

- **Server Status:** Running / Stopped
- **Software in Use:** (e.g., Paper 1.20.1)
- **CPU Usage:** Real-time CPU utilization
- **Memory Usage:** RAM usage graph

**How to Use:**

- Select your server from the list to view its dashboard
- Monitor performance metrics in real-time
- Check if your server is running properly

---

### Console

The Console is the command center for your server.

**Features:**

- **Server Address:** View the server IP and port
- **Status Indicator:** See if the server is online/offline
- **Memory Usage:** Current RAM usage
- **Live Logs:** Stream server logs in real-time
- **Command Input:** Execute commands with administrator privileges

**How to Use:**

1. Select your server from the list
2. Navigate to the **Console** tab
3. View server logs as they stream in
4. Type a command in the `Type a command...` field
5. Click **"Send"** to execute the command

**Example Commands:**

```
/say Hello, world!
/op PlayerName
/gamemode creative PlayerName
/time set day
```

---

### Users

The Users tab allows you to manage player permissions and access.

**Features:**

- **Whitelist Management:** Add/remove players from the whitelist
- **Operator Privileges:** Grant/revoke admin permissions
- **Ban Management:** Ban/unban players
- **IP Ban Management:** Ban/unban IP addresses

**How to Use:**

#### Add to Whitelist

1. Navigate to the **Users** tab
2. Select **"Whitelist"**
3. Enter the player's username
4. Click **"Add"**

#### Grant Operator Privileges

1. Select **"Operators"**
2. Enter the player's username
3. Click **"Add"**

#### Ban a Player

1. Select **"Banned Players"**
2. Enter the player's username
3. Enter a reason (optional)
4. Click **"Ban"**

#### Ban an IP Address

1. Select **"Banned IPs"**
2. Enter the IP address
3. Click **"Ban"**

---

### Files

The Files tab provides a built-in file manager for your server files.

**Features:**

- Browse server directories
- Create new files and folders
- Edit files (e.g., `server.properties`, plugin configs)
- Delete files and folders
- Move files and folders

**How to Use:**

#### Create a New Folder

1. Navigate to the **Files** tab
2. Click the **"+"** button in the upper-left corner
3. Select **"New Folder"**
4. Enter a folder name
5. Click **"Create"**

#### Create a New File

1. Click the **"+"** button
2. Select **"New File"**
3. Enter a file name
4. Click **"Create"**

#### Edit a File

1. Click on a file to open it
2. Edit the content in the built-in editor
3. Click **"Save"** to save changes

#### Delete a File or Folder

1. Right-click on the file or folder
2. Select **"Delete"**
3. Confirm the deletion

---

### Plugins / Mods

The Plugins / Mods tab allows you to easily install plugins (for Bukkit/Spigot/Paper) or mods (for Fabric/Forge).

**Features:**

- Browse available plugins/mods from popular sources (Modrinth, Hangar, SpigotMC)
- Search by name or filter by category
- Install plugins/mods with one click
- View installed plugins/mods
- Remove plugins/mods

**How to Use:**

#### Install a Plugin/Mod

1. Navigate to the **Plugins / Mods** tab
2. Use the search bar to find a plugin/mod (e.g., "EssentialsX")
3. Click on the plugin/mod to view details
4. Click **"Install"**
5. Wait for the download to complete

⚠️ **Note:** If you have multiple servers, **only the currently selected server** will receive the installation.

#### Remove a Plugin/Mod

**Backup Location:**

- **macOS:** `/Users/<username>/Library/Application Support/MC-Vector/servers/<servername>/backups`
- **Windows:** `C:\Users\<username>\AppData\Roaming\MC-Vector\servers\<servername>\backups`
- **Linux:** `~/.local/share/MC-Vector/servers/<servername>/backups` または `$XDG_DATA_HOME/MC-Vector/servers/<servername>/backups`

1. Select a backup from the list
2. Click **"Delete"**
3. Confirm the deletion

---

### Properties

The Properties tab allows you to edit basic Minecraft server settings.

**Features:**

- Edit common `server.properties` settings
- Toggle settings with convenient switches
- Save changes with one click

**Common Settings:**

- **Difficulty:** Peaceful, Easy, Normal, Hard
- **Gamemode:** Survival, Creative, Adventure, Spectator
- **Max Players:** Maximum number of players allowed
- **PvP:** Enable/disable player vs. player combat
- **Allow Flight:** Allow/disallow flight in survival mode
- **Whitelist:** Enable/disable whitelist mode
- **Online Mode:** Enable/disable Mojang authentication
- **And many more...**

**How to Use:**

1. Navigate to the **Properties** tab
2. Modify settings as needed
3. Click **"Save"** to apply changes
4. Restart the server for changes to take effect

---

### General Settings

The General Settings tab allows you to change server configuration after creation.

**Configurable Settings:**

- **Server Name:** Rename your server
- **Software:** Change server software (e.g., from Vanilla to Paper)
- **Version:** Update Minecraft version
- **Memory Usage:** Adjust RAM allocation
- **Port Number:** Change the server port
- **Java Version:** Select Java runtime version
- **Port Forwarding Elimination Feature:** Enable/disable Ngrok tunnel

**How to Use:**

1. Navigate to the **General Settings** tab
2. Modify settings as needed
3. Click **"Save"** to apply changes

#### Port Forwarding Elimination (Ngrok Integration)

MC-Vector can automatically create a public tunnel using Ngrok, eliminating the need for manual port forwarding.

1. Click **"❓ Connection Guide"** for detailed setup instructions
2. Enable the feature
3. MC-Vector will generate a public address for your server
4. Share this address with your friends to let them connect

---

### Proxy Network

The Proxy Network tab allows you to easily set up a proxy server (e.g., BungeeCord, Velocity).

**Features:**

- Create a proxy server
- Connect multiple backend servers
- Manage proxy configuration

**How to Use:**

1. Navigate to the **Proxy Network** tab
2. Click **"See Detailed Setup Guide"**
3. Follow the step-by-step instructions
4. Configure your proxy and backend servers

---

## Tips and Tricks

### Keep Your Server Updated

Regularly check for updates to:

- MC-Vector application
- Minecraft server software
- Plugins/mods

### Monitor Performance

Use the Dashboard to monitor:

- CPU usage (if consistently high, consider optimizing or upgrading hardware)
- Memory usage (if maxed out, increase RAM allocation)

### Regular Backups

Create backups before:

- Updating Minecraft version
- Installing new plugins/mods
- Making major configuration changes

### Security Best Practices

- Enable whitelist for private servers
- Don't grant operator privileges to untrusted players
- Keep online-mode enabled to prevent cracked clients

---

## Need Help?

- Check the [Development Guide](./development-guide.md) if you're a developer
- Visit the [GitHub Issues](https://github.com/tukuyomil032/MC-Vector/issues) page to report bugs
- Read the [CONTRIBUTING.md](../CONTRIBUTING.md) if you want to contribute

Enjoy managing your Minecraft servers with MC-Vector! 🎮
