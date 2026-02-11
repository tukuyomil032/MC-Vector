# MC-Vector

**Minecraft - Multi-Function Server Management Software**

## Technology Stacks

- TailwindCSS
- Tauri
- Node.js
- React 19
- Vite

## Languages

- Typescript
- Rust
- CSS

# Tutorial - How to create a server

1. Install MC-Vector and launch the application.
2. Press “+ Add Server” to open the server creation screen.
3. Set the “Server Name,” “Software,” “Version,” “Port,” and “Memory Usage” respectively.
4. Press the “Create” button.
   **Completing steps 1 through 4 above will finish creating your server!**

## Tutorial - How to Configure Server Details

This application contains the following main configuration items:

- **Dashboard**
  - Here you can check the server status, **_software in use, CPU usage, and memory usage_** in real time!

- **Console**
  - Here you can check the **_server address, status, and memory usage_**!
  - Additionally, as a key feature of the console, server logs stream here.
    - Furthermore, **you can execute console commands (with administrator privileges)** by typing a command into the `Type a command...` field and pressing the “Send” button!

- **Users**
  - Here, you can add or remove four items:
    - Server whitelist,
    - Administrator privileges,
    - User bans (+including checking banned users),
    - User IP bans.

- **Files**
  - Here, you can create, delete, edit, and move files or folders.
  - In the Files tab, **you can create new folders and files within the current directory** by clicking the + button in the upper-left corner!

- **Plugins / Mods**
  - Here, you can install plugins and mods on your server simply by pressing the “Install” button.
  - ⚠️However, **if you have created multiple servers**, **_only the currently selected server will be installed_** when you press the “Install” button.

- **Backups**
  - Here, you can create and delete server backups, as well as restore data from backups.
  - The backup file you created is saved in the following directory:
    - For MacOS➡️ `/Users/<username>/Library/Application Support/MC-Vector/servers/<servername>/backups`
    - For Windows➡️ `C:\Users\<username>\AppData\Roaming\MC-Vector\servers\<servername>\backups`
      - `<username>` is your operating system's user ID.
      - `<servername>` is the name of the server you created the backup for.

- **Properties**
  - Here, you can edit **the basic settings** for your Minecraft server.
  - For example, setting items include:
    - Difficulty
    - allow-flight
    - max-players
    - whitelist [``On / Off``] etc.

- **General Settings**
  - Here, you can change the settings configured when creating the server later!
  - List of configurable items:
    - Server name
    - Software
    - Version
    - Memory usage
    - Port number
    - Java version
    - **_Port fowarding elimination feature_**
      - For detailed setup instructions, press the “❓️Connection Guide” button.

- **Proxy Network**
  - **_Here, you can easily set up a proxy server!_**
  - For detailed setup instructions, click the “See Detailed Setup Guide” button.
---

## Prerequisites
Before you start developing, make sure you have the following installed:

- **Node.js** (v18 or later recommended)
- **pnpm** (Package manager)
- **Rust** (v1.77.2 or later)
- **Cargo** (Included with Rust)

### Installation

1. **Clone the repository**
   ```bash
   $ git clone https://github.com/tukuyomil032/MC-Vector.git

   $ cd MC-Vector
   ```

2. **Install dependencies**
   ```bash
   $ pnpm install
   ```

3. **Run development server**
   ```bash
   $ pnpm tauri dev
   ```

### Build

To create a production build:

```bash
$ pnpm tauri build
```

This will generate platform-specific installers in `src-tauri/target/release/bundle/`.

### Project Structure

```
MC-Vector/
├── src/                              # Frontend source code
│   ├── App.tsx                       # Main application component
│   ├── main.tsx                      # React entry point
│   ├── index.css                     # Global styles
│   ├── vite-env.d.ts                 # Vite type definitions
│   ├── assets/                       # Static assets
│   │   └── icons/                    # Icon files
│   ├── lib/                          # Frontend API layer
│   │   ├── backup-commands.ts        # Backup operations
│   │   ├── config-commands.ts        # Configuration management
│   │   ├── file-commands.ts          # File system operations
│   │   ├── java-commands.ts          # Java runtime management
│   │   ├── ngrok-commands.ts         # Ngrok tunnel operations
│   │   ├── plugin-commands.ts        # Plugin/mod management
│   │   ├── proxy-commands.ts         # Proxy server setup
│   │   ├── server-commands.ts        # Server lifecycle management
│   │   ├── update-commands.ts        # App update operations
│   │   └── tauri-api.ts              # Tauri API wrappers
│   └── renderer/                     # React components
│       ├── components/               # UI components
│       │   ├── AddServerModal.tsx    # Server creation modal
│       │   ├── BackupsView.tsx       # Backup management view
│       │   ├── ConsoleView.tsx       # Server console view
│       │   ├── DashboardView.tsx     # Server dashboard
│       │   ├── FilesView.tsx         # File browser view
│       │   ├── JavaManagerModal.tsx  # Java version manager
│       │   ├── NgrokGuideView.tsx    # Ngrok setup guide
│       │   ├── PluginBrowser.tsx     # Plugin/mod browser
│       │   ├── ProxyHelpView.tsx     # Proxy help documentation
│       │   ├── ProxySetupView.tsx    # Proxy configuration
│       │   ├── SettingsWindow.tsx    # Server settings window
│       │   ├── UsersView.tsx         # User/whitelist management
│       │   ├── Toast.tsx             # Toast notification component
│       │   ├── ToastProvider.tsx     # Toast context provider
│       │   └── properties/           # Server properties components
│       │       ├── PropertiesView.tsx
│       │       ├── ServerSettings.tsx
│       │       └── AdvancedSettingsWindow.tsx
│       └── shared/                   # Shared utilities
│           ├── propertiesData.ts     # Server properties definitions
│           └── server declaration.ts # Server type declarations
│
├── src-tauri/                        # Rust backend (Tauri core)
│   ├── Cargo.toml                    # Rust dependencies
│   ├── Cargo.lock                    # Dependency lock file
│   ├── tauri.conf.json               # Tauri configuration
│   ├── build.rs                      # Build script
│   ├── capabilities/                 # Tauri capability definitions
│   │   ├── default.json
│   │   └── desktop.json
│   ├── icons/                        # Application icons
│   ├── gen/                          # Generated schema files
│   └── src/
│       ├── main.rs                   # Rust entry point
│       ├── lib.rs                    # Library exports
│       └── commands/                 # Tauri command handlers
│           ├── mod.rs                # Command module exports
│           ├── backup.rs             # Backup/restore operations
│           ├── download.rs           # Server software downloads
│           ├── file_utils.rs         # File system utilities
│           ├── java.rs               # Java runtime detection
│           ├── ngrok.rs              # Ngrok integration
│           ├── process_stats.rs      # Server process monitoring
│           └── server.rs             # Server process management
│
├── .github/                          # GitHub configurations
│   └── workflows/                    # CI/CD workflows
├── .vscode/                          # VS Code settings
├── build/                            # Build artifacts
├── eslint.config.js                  # ESLint configuration
├── tailwind.config.js                # Tailwind CSS configuration
├── postcss.config.js                 # PostCSS configuration
├── lint-staged.config.js             # lint-staged configuration
├── vite.config.ts                    # Vite build configuration
├── tsconfig.app.json                 # TypeScript configuration
├── tsconfig.node.json                # TypeScript configuration
├── tsconfig.json                     # TypeScript configuration
├── .editorconfig                     # Sync format configuration
├── .prettierrc                       # Prettier rules
├── .prettierignore                   # Ignore prettier files
├── package.json                      # Node.js project manifest
├── pnpm-lock.yaml                    # pnpm lock file
└── README.md                         # This file
```

---
## License

This project is licensed under the MIT License - see the LICENSE file for details.
